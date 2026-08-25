import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { DeployEnv, oidcSubjectPatterns } from './env';

export interface GithubCiStackProps extends cdk.StackProps {
  deployEnv: DeployEnv;
  /** ARN of the GitHub OIDC provider, which already exists in both accounts. */
  githubOidcProviderArn: string;
}

/**
 * The role GitHub Actions assumes. Deliberately narrow: it may assume the CDK
 * bootstrap roles and read this project's own SSM parameters, and nothing else.
 * Everything a deploy actually does happens through the bootstrap roles.
 */
export class GithubCiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GithubCiStackProps) {
    super(scope, id, props);

    const { deployEnv, githubOidcProviderArn } = props;

    const githubOidc = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GithubOidc',
      githubOidcProviderArn,
    );

    const role = new iam.Role(this, 'LightningCiRole', {
      roleName: `nakomis-lightning-github-ci-${deployEnv}`,
      assumedBy: new iam.WebIdentityPrincipal(githubOidc.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        // Scoped to this repository. Any branch may assume it, because the
        // GitHub environment gates are what stop an arbitrary branch deploying
        // to prod, and a PR still needs to synth against sandbox.
        //
        // A list is an OR. Both the immutable-id subject GitHub emits today and
        // the legacy name-only one are accepted — see oidcSubjectPatterns.
        StringLike: {
          'token.actions.githubusercontent.com:sub': oidcSubjectPatterns(),
        },
      }),
      description: `Assumed by lightning GitHub Actions CI (${deployEnv})`,
      inlinePolicies: {
        CdkDeploy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['sts:AssumeRole'],
              resources: [`arn:aws:iam::${this.account}:role/cdk-hnb659fds-*`],
            }),
          ],
        }),
        WebDeploy: new iam.PolicyDocument({
          statements: [
            // Reading the bucket name and distribution id back out at deploy
            // time, rather than threading them through the workflow as vars.
            new iam.PolicyStatement({
              actions: ['ssm:GetParameter', 'ssm:GetParameters'],
              resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/lightning/*`],
            }),
            // Publishing the built SPA. Scoped to the one bucket, and `--delete`
            // on the sync means DeleteObject is needed as well as Put.
            new iam.PolicyStatement({
              actions: ['s3:PutObject', 's3:DeleteObject'],
              resources: [`arn:aws:s3:::lightning-web-${this.account}-${deployEnv}/*`],
            }),
            new iam.PolicyStatement({
              actions: ['s3:ListBucket'],
              resources: [`arn:aws:s3:::lightning-web-${this.account}-${deployEnv}`],
            }),
            // CloudFront is global, so this cannot be scoped by region. The
            // distribution id is not known here without a cross-stack
            // reference that would invert the dependency, and an invalidation
            // is not a destructive operation.
            new iam.PolicyStatement({
              actions: ['cloudfront:CreateInvalidation'],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    new cdk.CfnOutput(this, 'LightningCiRoleArn', {
      value: role.roleArn,
      description: `IAM role for lightning GitHub Actions CI (${deployEnv})`,
    });
  }
}
