#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ACCOUNTS, DeployEnv, appDomain } from '../lib/env';
import { ApiStack } from '../lib/api-stack';
import { DataStack } from '../lib/data-stack';
import { GithubCiStack } from '../lib/github-ci-stack';
import { WebCertStack } from '../lib/web-cert-stack';
import { WebStack } from '../lib/web-stack';

const npmEnvironment = process.env.NPM_ENVIRONMENT;
if (!npmEnvironment) {
  throw new Error(
    'NPM_ENVIRONMENT is not set. Use `pnpm deploy-sandbox` or `pnpm deploy-prod`.',
  );
}
if (npmEnvironment !== 'sandbox' && npmEnvironment !== 'prod') {
  throw new Error(`Unknown NPM_ENVIRONMENT "${npmEnvironment}". Must be "sandbox" or "prod".`);
}

const deployEnv = npmEnvironment as DeployEnv;
const accountId = ACCOUNTS[deployEnv];
const londonEnv = { env: { account: accountId, region: 'eu-west-2' } };
const githubOidcProviderArn = `arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`;

const app = new cdk.App();

new GithubCiStack(app, 'LightningGithubCiStack', {
  ...londonEnv,
  deployEnv,
  githubOidcProviderArn,
  description: `IAM role assumed by lightning GitHub Actions (${deployEnv})`,
});

const dataStack = new DataStack(app, 'LightningDataStack', {
  ...londonEnv,
  deployEnv,
  description: `Talks, access control, share tokens and content storage (${deployEnv})`,
});

// CloudFront only accepts a certificate from us-east-1, so this stack lives
// there and is referenced across regions.
const webCertStack = new WebCertStack(app, 'LightningWebCertStack', {
  env: { account: accountId, region: 'us-east-1' },
  deployEnv,
  crossRegionReferences: true,
  description: `ACM certificate for ${appDomain(deployEnv)} (us-east-1, for CloudFront)`,
});

const webStack = new WebStack(app, 'LightningWebStack', {
  ...londonEnv,
  deployEnv,
  certificate: webCertStack.certificate,
  crossRegionReferences: true,
  description: `CloudFront, S3 SPA hosting and the Cognito client (${deployEnv})`,
});

const apiStack = new ApiStack(app, 'LightningApiStack', {
  ...londonEnv,
  deployEnv,
  talksTable: dataStack.talksTable,
  accessTable: dataStack.accessTable,
  shareTable: dataStack.shareTable,
  contentBucket: dataStack.contentBucket,
  description: `HTTP API and Lambda handlers (${deployEnv})`,
});

// The API reads the Cognito client id that WebStack publishes to SSM. That is a
// deploy-time read of a parameter, not a CloudFormation reference, so the
// ordering has to be stated explicitly or a fresh environment races.
apiStack.addStackDependency(webStack);
