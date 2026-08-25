import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { DeployEnv, DEV_ORIGIN, appOrigin } from './env';

export interface DataStackProps extends cdk.StackProps {
  deployEnv: DeployEnv;
}

/**
 * Tables and the content bucket. Deliberately separate from WebStack: that
 * bucket holds the SPA and is rebuilt on every deploy, this one holds talks and
 * recordings that must outlive any number of redeployments.
 */
export class DataStack extends cdk.Stack {
  readonly talksTable: dynamodb.Table;
  readonly accessTable: dynamodb.Table;
  readonly shareTable: dynamodb.Table;
  readonly contentBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { deployEnv } = props;
    const isProd = deployEnv === 'prod';
    const removalPolicy = isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    // ── Talks ────────────────────────────────────────────────────────────────
    this.talksTable = new dynamodb.Table(this, 'TalksTable', {
      tableName: `lightning-talks-${deployEnv}`,
      partitionKey: { name: 'talkId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy,
    });

    // The list panel reads one collection at a time, newest first, so the sort
    // key is the talk date rather than the id.
    this.talksTable.addGlobalSecondaryIndex({
      indexName: 'byCollection',
      partitionKey: { name: 'collection', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'date', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── Access control ───────────────────────────────────────────────────────
    // PK USER#<email>, SK COLLECTION#<name> | ROOT. Email rather than Cognito
    // sub so the bootstrap admin can be seeded without a deploy-time lookup.
    this.accessTable = new dynamodb.Table(this, 'AccessTable', {
      tableName: `lightning-access-${deployEnv}`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      // Always retained: losing this table locks everyone out of every talk,
      // and it is small enough that keeping it costs nothing.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Share tokens ─────────────────────────────────────────────────────────
    // Its own table because resolving /d/<token> is the hot path for people with
    // no account, and it must be a single O(1) lookup on the token itself.
    this.shareTable = new dynamodb.Table(this, 'ShareTable', {
      tableName: `lightning-share-${deployEnv}`,
      partitionKey: { name: 'token', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy,
    });

    // ── Content ──────────────────────────────────────────────────────────────
    this.contentBucket = new s3.Bucket(this, 'ContentBucket', {
      bucketName: `lightning-content-${this.account}-${deployEnv}`,
      removalPolicy,
      autoDeleteObjects: !isProd,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Decks, notes and assets upload straight from the browser via presigned
      // PUT, so the bucket has to accept a cross-origin PUT from the SPA. Reads
      // never come from the browser directly — they are always redirects to a
      // presigned GET — so GET is not listed.
      cors: [
        {
          allowedOrigins: [appOrigin(deployEnv), DEV_ORIGIN],
          allowedMethods: [s3.HttpMethods.PUT],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        {
          id: 'recordings-to-glacier',
          prefix: 'recordings/',
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
        {
          // A multipart upload that dies mid-talk otherwise bills forever.
          id: 'abort-incomplete-multipart',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
    });

    // ── Handles for the other stacks ─────────────────────────────────────────
    // Published by name so a table or bucket can be recreated without every
    // dependent stack needing a matching update.
    new ssm.StringParameter(this, 'ContentBucketParam', {
      parameterName: `/lightning/${deployEnv}/content/bucket-name`,
      stringValue: this.contentBucket.bucketName,
      description: `Lightning content bucket (${deployEnv})`,
    });

    new cdk.CfnOutput(this, 'ContentBucketName', { value: this.contentBucket.bucketName });
    new cdk.CfnOutput(this, 'AccessTableName', { value: this.accessTable.tableName });
  }
}
