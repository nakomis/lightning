import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { DeployEnv, DEV_ORIGIN, GATE_GROUP, HOSTED_ZONES, appDomain } from './env';

export interface WebStackProps extends cdk.StackProps {
  deployEnv: DeployEnv;
  certificate: acm.ICertificate;
}

/**
 * The SPA bucket, its CloudFront distribution, and this app's own Cognito
 * client on the shared pool.
 */
export class WebStack extends cdk.Stack {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    const { deployEnv, certificate } = props;
    const isProd = deployEnv === 'prod';
    const removalPolicy = isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;
    const { hostedZoneId, zoneName } = HOSTED_ZONES[deployEnv];
    const domain = appDomain(deployEnv);

    // ── Cognito ──────────────────────────────────────────────────────────────
    // The pool is shared with nine other applications. Read it, add our own
    // client, and change nothing else about it.
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

    // The gate group. Created here rather than by hand so a fresh environment is
    // usable without anyone remembering this step — but note the group is on the
    // *shared* pool, so the name has to stay namespaced.
    const gateGroup = new cognito.CfnUserPoolGroup(this, 'GateGroup', {
      userPoolId,
      groupName: GATE_GROUP,
      description: 'May sign in to lightning. Per-collection access lives in DynamoDB.',
    });
    gateGroup.node.addDependency(client);

    // ── SPA hosting ──────────────────────────────────────────────────────────
    this.bucket = new s3.Bucket(this, 'SpaBucket', {
      bucketName: `lightning-web-${this.account}-${deployEnv}`,
      removalPolicy,
      autoDeleteObjects: !isProd,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    const oac = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      originAccessControlName: `lightning-${deployEnv}`,
    });

    // Uploaded decks are arbitrary HTML from the talks bucket. They are served
    // through a separate path with a response-headers policy that denies them
    // any ambient authority, and rendered in a sandboxed frame by the SPA.
    const deckHeaders = new cloudfront.ResponseHeadersPolicy(this, 'DeckHeaders', {
      responseHeadersPolicyName: `lightning-deck-${deployEnv}`,
      // X-Robots-Tag is a plain custom header, but Referrer-Policy is one
      // CloudFront recognises as a security header and refuses to accept as a
      // custom one — it has to go through securityHeadersBehavior instead.
      customHeadersBehavior: {
        customHeaders: [
          { header: 'X-Robots-Tag', value: 'noindex, nofollow', override: true },
        ],
      },
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.SAMEORIGIN, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER,
          override: true,
        },
      },
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      // A client-routed SPA: anything S3 doesn't have is a route, not a 404.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
      domainNames: [domain],
      certificate,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId,
      zoneName,
    });

    new route53.ARecord(this, 'AliasA', {
      recordName: domain,
      zone,
      target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(this.distribution)),
    });

    new route53.AaaaRecord(this, 'AliasAaaa', {
      recordName: domain,
      zone,
      target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(this.distribution)),
    });

    // ── Handles ──────────────────────────────────────────────────────────────
    const loginDomain = ssm.StringParameter.valueForStringParameter(
      this,
      `/nakomis-infra/${deployEnv}/cognito/login-domain`,
    );

    const params: Array<[string, string, string]> = [
      ['ClientIdParam', `/lightning/${deployEnv}/cognito/client-id`, client.userPoolClientId],
      ['UserPoolIdParam', `/lightning/${deployEnv}/cognito/user-pool-id`, userPoolId],
      ['LoginDomainParam', `/lightning/${deployEnv}/cognito/login-domain`, loginDomain],
      ['BucketNameParam', `/lightning/${deployEnv}/web/bucket-name`, this.bucket.bucketName],
      ['DistributionIdParam', `/lightning/${deployEnv}/web/distribution-id`, this.distribution.distributionId],
    ];
    for (const [id, parameterName, stringValue] of params) {
      new ssm.StringParameter(this, id, { parameterName, stringValue });
    }

    // Referenced so the policy is not dropped as unused before the deck routes
    // are wired up in LTNG-5.
    new cdk.CfnOutput(this, 'DeckHeadersPolicyId', { value: deckHeaders.responseHeadersPolicyId });
    new cdk.CfnOutput(this, 'DistributionDomainName', { value: this.distribution.domainName });
    new cdk.CfnOutput(this, 'AppUrl', { value: `https://${domain}` });
  }
}
