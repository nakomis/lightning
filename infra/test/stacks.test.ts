/**
 * Synthesis assertions.
 *
 * These are here to pin the properties that are invisible in a diff and
 * expensive to get wrong — a bucket quietly becoming public, the API's default
 * authoriser being dropped, the share route accidentally requiring a login (or,
 * far worse, a talks route accidentally not).
 */
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ApiStack } from '../lib/api-stack';
import { DataStack } from '../lib/data-stack';
import { GithubCiStack } from '../lib/github-ci-stack';
import { WebCertStack } from '../lib/web-cert-stack';
import { WebStack } from '../lib/web-stack';
import { ACCOUNTS } from '../lib/env';

const env = { account: ACCOUNTS.sandbox, region: 'eu-west-2' };
const usEast = { account: ACCOUNTS.sandbox, region: 'us-east-1' };

function build() {
  const app = new cdk.App();
  const data = new DataStack(app, 'Data', { env, deployEnv: 'sandbox' });
  const cert = new WebCertStack(app, 'Cert', {
    env: usEast,
    deployEnv: 'sandbox',
    crossRegionReferences: true,
  });
  const web = new WebStack(app, 'Web', {
    env,
    deployEnv: 'sandbox',
    certificate: cert.certificate,
    crossRegionReferences: true,
  });
  const api = new ApiStack(app, 'Api', {
    env,
    deployEnv: 'sandbox',
    talksTable: data.talksTable,
    accessTable: data.accessTable,
    shareTable: data.shareTable,
    contentBucket: data.contentBucket,
  });
  const ci = new GithubCiStack(app, 'Ci', {
    env,
    deployEnv: 'sandbox',
    githubOidcProviderArn: `arn:aws:iam::${ACCOUNTS.sandbox}:oidc-provider/token.actions.githubusercontent.com`,
  });
  return { data, cert, web, api, ci };
}

describe('DataStack', () => {
  const t = () => Template.fromStack(build().data);

  it('blocks all public access on the content bucket', () => {
    t().hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('allows only PUT from the browser, never GET', () => {
    // Reads are always a redirect to a presigned URL, so a browser GET straight
    // to the bucket should never be possible.
    t().hasResourceProperties('AWS::S3::Bucket', {
      CorsConfiguration: {
        CorsRules: [Match.objectLike({ AllowedMethods: ['PUT'] })],
      },
    });
  });

  it('retains the access table even in sandbox', () => {
    // Losing it locks everyone out of every talk, and it is tiny.
    t().hasResource('AWS::DynamoDB::Table', {
      Properties: Match.objectLike({ TableName: 'lightning-access-sandbox' }),
      DeletionPolicy: 'Retain',
    });
  });

  it('indexes talks by collection', () => {
    t().hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'lightning-talks-sandbox',
      GlobalSecondaryIndexes: [Match.objectLike({ IndexName: 'byCollection' })],
    });
  });

  it('ages recordings into Glacier and cleans up dead multipart uploads', () => {
    t().hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            Prefix: 'recordings/',
            Transitions: [Match.objectLike({ StorageClass: 'GLACIER_IR' })],
          }),
          Match.objectLike({ AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 } }),
        ]),
      },
    });
  });
});

describe('ApiStack', () => {
  const t = () => Template.fromStack(build().api);

  it('defaults every route to the Cognito authoriser', () => {
    const routes = t().findResources('AWS::ApiGatewayV2::Route');
    const protectedRoutes = Object.values(routes).filter(
      (r) => !String(r.Properties.RouteKey).startsWith('GET /d/'),
    );
    expect(protectedRoutes.length).toBeGreaterThan(0);
    for (const r of protectedRoutes) {
      expect(r.Properties.AuthorizationType).toBe('JWT');
    }
  });

  it('leaves exactly the two share routes public', () => {
    const routes = t().findResources('AWS::ApiGatewayV2::Route');
    const open = Object.values(routes)
      .filter((r) => r.Properties.AuthorizationType === 'NONE')
      .map((r) => r.Properties.RouteKey)
      .sort();
    expect(open).toEqual(['GET /d/{token}', 'GET /d/{token}/{file}']);
  });

  it('does not allow a wildcard CORS origin', () => {
    const apis = t().findResources('AWS::ApiGatewayV2::Api');
    for (const api of Object.values(apis)) {
      expect(api.Properties.CorsConfiguration?.AllowOrigins ?? []).not.toContain('*');
    }
  });

  it('seeds a bootstrap admin conditionally, so a redeploy cannot overwrite a change', () => {
    // The table name arrives as an Fn::ImportValue, so match on the seeded
    // principal rather than the table.
    const resources = t().findResources('Custom::AWS');
    const seeds = Object.values(resources).filter((r) =>
      JSON.stringify(r.Properties).includes('USER#martin@nakomis.com'),
    );
    expect(seeds).toHaveLength(1);
    const props = JSON.stringify(seeds[0].Properties);
    expect(props).toContain('attribute_not_exists(pk)');
    // onCreate only — an onUpdate would re-run and could clobber a later change.
    expect(props).not.toContain('\\"onUpdate\\"');
  });
});

describe('WebStack', () => {
  const t = () => Template.fromStack(build().web);

  it('serves the SPA over HTTPS only', () => {
    t().hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }),
      }),
    });
  });

  it('sets Referrer-Policy through the security behaviour, not as a custom header', () => {
    // CloudFront rejects Referrer-Policy as a custom header outright — it is on
    // its list of recognised security headers. Cost a failed deploy to find.
    t().hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({
        SecurityHeadersConfig: Match.objectLike({
          ReferrerPolicy: { ReferrerPolicy: 'no-referrer', Override: true },
        }),
        CustomHeadersConfig: Match.objectLike({
          Items: [Match.objectLike({ Header: 'X-Robots-Tag' })],
        }),
      }),
    });
  });

  it('creates the gate group on the shared pool, namespaced', () => {
    t().hasResourceProperties('AWS::Cognito::UserPoolGroup', { GroupName: 'lightning' });
  });

  it('uses the authorisation code flow only, never implicit', () => {
    // Implicit returns tokens in the URL fragment, where they leak into
    // history and referrers. CDK enables it by default, so this is pinned.
    t().hasResourceProperties('AWS::Cognito::UserPoolClient', {
      AllowedOAuthFlows: ['code'],
    });
  });

  it('does not put a client secret in a public SPA', () => {
    const clients = t().findResources('AWS::Cognito::UserPoolClient');
    for (const c of Object.values(clients)) {
      expect(c.Properties.GenerateSecret).toBeFalsy();
    }
  });
});

describe('GithubCiStack', () => {
  it('trusts only this repository', () => {
    const t = Template.fromStack(build().ci);
    t.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'nakomis-lightning-github-ci-sandbox',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Condition: Match.objectLike({
              StringLike: {
                'token.actions.githubusercontent.com:sub': [
                  // Immutable ids. GitHub moved to this format and a policy
                  // pinned only to names silently stops matching.
                  'repo:nakomis@1488244/lightning@1346228874:*',
                  'repo:nakomis/lightning:*',
                ],
              },
            }),
          }),
        ]),
      }),
    });
  });
});
