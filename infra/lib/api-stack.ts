import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as customresources from 'aws-cdk-lib/custom-resources';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as path from 'path';
import { Construct } from 'constructs';
import {
  API_PATH_PREFIX,
  BOOTSTRAP_ADMIN_EMAIL,
  DeployEnv,
  DEV_ORIGIN,
  GATE_GROUP,
  INITIAL_COLLECTIONS,
  appDomain,
  appOrigin,
} from './env';

export interface ApiStackProps extends cdk.StackProps {
  deployEnv: DeployEnv;
  talksTable: dynamodb.ITable;
  accessTable: dynamodb.ITable;
  shareTable: dynamodb.ITable;
  contentBucket: s3.IBucket;
}

export class ApiStack extends cdk.Stack {
  /**
   * The execute-api hostname, for CloudFront to use as an origin. Exposed as a
   * plain host rather than a URL because that is the shape an origin takes.
   */
  readonly apiDomainName: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { deployEnv, talksTable, accessTable, shareTable, contentBucket } = props;
    const origin = appOrigin(deployEnv);
    const domain = appDomain(deployEnv);

    // ── Cognito ──────────────────────────────────────────────────────────────
    // The pool is shared with nine other applications. Read it, add our own
    // client, and change nothing else about it.
    //
    // The client lives here rather than with the SPA because the API's JWT
    // authoriser needs its id as the audience. Putting it in WebStack meant the
    // API had to wait for the web stack, and once CloudFront fronts the API the
    // web stack has to wait for the API — which is a cycle. Owning the client
    // here points both edges the same way.
    const userPoolId = ssm.StringParameter.valueForStringParameter(
      this,
      `/nakomis-infra/${deployEnv}/cognito/user-pool-id`,
    );
    const userPool = cognito.UserPool.fromUserPoolId(this, 'SharedPool', userPoolId);

    const client = new cognito.UserPoolClient(this, 'LightningClient', {
      userPoolClientName: `lightning-spa-${deployEnv}`,
      userPool,
      authFlows: { userSrp: true },
      generateSecret: false,
      oAuth: {
        // Authorisation code + PKCE only. CDK's default enables the implicit
        // grant as well, which hands tokens back in the URL fragment — they end
        // up in history, in referrers, and in any script on the page. There is
        // no reason a public SPA needs it.
        flows: { authorizationCodeGrant: true, implicitCodeGrant: false },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [`https://${domain}/loggedin`, `${DEV_ORIGIN}/loggedin`],
        logoutUrls: [`https://${domain}/logout`, `${DEV_ORIGIN}/logout`],
      },
    });
    const clientId = client.userPoolClientId;

    // The gate group. Created here rather than by hand so a fresh environment is
    // usable without anyone remembering this step — but note the group is on the
    // *shared* pool, so the name has to stay namespaced.
    const gateGroup = new cognito.CfnUserPoolGroup(this, 'GateGroup', {
      userPoolId,
      groupName: GATE_GROUP,
      description: 'May sign in to lightning. Per-collection access lives in DynamoDB.',
    });
    gateGroup.node.addDependency(client);

    const authorizer = new HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPoolId}`,
      {
        authorizerName: `lightning-cognito-${deployEnv}`,
        identitySource: ['$request.header.Authorization'],
        jwtAudience: [clientId],
      },
    );

    const commonEnv = {
      TALKS_TABLE_NAME: talksTable.tableName,
      ACCESS_TABLE_NAME: accessTable.tableName,
      SHARE_TABLE_NAME: shareTable.tableName,
      CONTENT_BUCKET_NAME: contentBucket.bucketName,
      GATE_GROUP,
      APP_ORIGIN: origin,
      INITIAL_COLLECTIONS: INITIAL_COLLECTIONS.join(','),
    };

    const fn = (name: string, entry: string) =>
      new nodejs.NodejsFunction(this, name, {
        entry: path.join(__dirname, `../lambda/${entry}`),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: cdk.Duration.seconds(15),
        environment: commonEnv,
        bundling: { externalModules: [] },
      });

    // ── Handlers ─────────────────────────────────────────────────────────────
    // Every one of these reads the access table, because that is where the
    // per-collection permission lives.
    const me = fn('MeHandler', 'api/me.ts');
    const listTalks = fn('ListTalksHandler', 'api/list-talks.ts');
    const getTalk = fn('GetTalkHandler', 'api/get-talk.ts');
    const createTalk = fn('CreateTalkHandler', 'api/create-talk.ts');
    const uploadUrl = fn('UploadUrlHandler', 'api/upload-url.ts');
    const confirmUpload = fn('ConfirmUploadHandler', 'api/confirm-upload.ts');
    const talkContent = fn('TalkContentHandler', 'api/talk-content.ts');
    const share = fn('ShareHandler', 'api/share.ts');
    const resolveShare = fn('ResolveShareHandler', 'api/resolve-share.ts');

    for (const h of [
      me,
      listTalks,
      getTalk,
      createTalk,
      uploadUrl,
      confirmUpload,
      talkContent,
      share,
    ]) {
      accessTable.grantReadData(h);
    }
    talksTable.grantReadData(listTalks);
    talksTable.grantReadData(getTalk);
    talksTable.grantReadData(uploadUrl);
    talksTable.grantReadData(share);
    talksTable.grantReadData(resolveShare);
    talksTable.grantWriteData(createTalk);
    talksTable.grantReadWriteData(confirmUpload);
    talksTable.grantReadData(talkContent);
    contentBucket.grantRead(talkContent);
    shareTable.grantReadWriteData(share);
    shareTable.grantReadData(resolveShare);
    contentBucket.grantPut(uploadUrl);
    contentBucket.grantRead(resolveShare);

    // ── API ──────────────────────────────────────────────────────────────────
    const api = new apigwv2.HttpApi(this, 'Api', {
      apiName: `lightning-api-${deployEnv}`,
      // Default-deny: every route is authenticated unless it explicitly opts
      // out, so forgetting to name an authoriser fails closed.
      defaultAuthorizer: authorizer,
      corsPreflight: {
        allowOrigins: [origin, DEV_ORIGIN],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const route = (
      routePath: string,
      methods: apigwv2.HttpMethod[],
      handler: lambda.IFunction,
      id: string,
    ) =>
      api.addRoutes({
        path: routePath,
        methods,
        integration: new HttpLambdaIntegration(id, handler),
      });

    route('/me', [apigwv2.HttpMethod.GET], me, 'MeIntegration');
    route('/talks', [apigwv2.HttpMethod.GET], listTalks, 'ListTalksIntegration');
    route('/talks', [apigwv2.HttpMethod.POST], createTalk, 'CreateTalkIntegration');
    route('/talks/{talkId}', [apigwv2.HttpMethod.GET], getTalk, 'GetTalkIntegration');
    route('/talks/{talkId}/upload-url', [apigwv2.HttpMethod.POST], uploadUrl, 'UploadUrlIntegration');
    route(
      '/talks/{talkId}/content',
      [apigwv2.HttpMethod.GET],
      talkContent,
      'TalkContentIntegration',
    );
    route(
      '/talks/{talkId}/files',
      [apigwv2.HttpMethod.POST],
      confirmUpload,
      'ConfirmUploadIntegration',
    );
    route(
      '/talks/{talkId}/share',
      [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.DELETE],
      share,
      'ShareIntegration',
    );

    // The share resolver is the one deliberately public route — the whole point
    // is that it works with no account. `authorizer: NONE` opts it out of the
    // API default.
    api.addRoutes({
      path: '/d/{token}',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('ResolveShareIntegration', resolveShare),
      authorizer: new apigwv2.HttpNoneAuthorizer(),
    });
    api.addRoutes({
      path: '/d/{token}/{file}',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('ResolveShareFileIntegration', resolveShare),
      authorizer: new apigwv2.HttpNoneAuthorizer(),
    });

    // ── Bootstrap admin ──────────────────────────────────────────────────────
    // Someone has to be able to grant everyone else access, and that cannot come
    // from the app itself. Keying the access table on email rather than Cognito
    // sub is what lets this be a constant instead of a deploy-time lookup.
    // Conditional so a re-deploy never overwrites a role changed since.
    new customresources.AwsCustomResource(this, 'SeedBootstrapAdmin', {
      onCreate: {
        service: 'DynamoDB',
        action: 'putItem',
        physicalResourceId: customresources.PhysicalResourceId.of(
          `seed-admin-${deployEnv}`,
        ),
        parameters: {
          TableName: accessTable.tableName,
          Item: {
            pk: { S: `USER#${BOOTSTRAP_ADMIN_EMAIL}` },
            sk: { S: 'ROOT' },
            role: { S: 'admin' },
            seededAt: { S: new Date().toISOString() },
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
      policy: customresources.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [accessTable.tableArn],
      }),
      installLatestAwsSdk: false,
    });

    // ── Handles ──────────────────────────────────────────────────────────────
    const loginDomain = ssm.StringParameter.valueForStringParameter(
      this,
      `/nakomis-infra/${deployEnv}/cognito/login-domain`,
    );

    const params: Array<[string, string, string]> = [
      ['ClientIdParam', `/lightning/${deployEnv}/cognito/client-id`, clientId],
      ['UserPoolIdParam', `/lightning/${deployEnv}/cognito/user-pool-id`, userPoolId],
      ['LoginDomainParam', `/lightning/${deployEnv}/cognito/login-domain`, loginDomain],
      // The public path, not the execute-api one. Everything the browser calls
      // goes through CloudFront; the raw hostname is for the origin only.
      ['ApiUrlParam', `/lightning/${deployEnv}/api/url`, `${origin}${API_PATH_PREFIX}`],
    ];
    for (const [id, parameterName, stringValue] of params) {
      new ssm.StringParameter(this, id, { parameterName, stringValue });
    }

    this.apiDomainName = `${api.apiId}.execute-api.${this.region}.amazonaws.com`;

    new cdk.CfnOutput(this, 'ApiUrl', { value: `${origin}${API_PATH_PREFIX}` });
    new cdk.CfnOutput(this, 'ApiOriginDomainName', { value: this.apiDomainName });
  }
}
