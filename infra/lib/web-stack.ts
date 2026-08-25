import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { API_PATH_PREFIX, DeployEnv, HOSTED_ZONES, appDomain } from './env';

export interface WebStackProps extends cdk.StackProps {
  deployEnv: DeployEnv;
  certificate: acm.ICertificate;
  /** execute-api hostname of the HTTP API, fronted here under `/api/*`. */
  apiDomainName: string;
}

/**
 * The SPA bucket and its CloudFront distribution, which also fronts the API so
 * that the two are same-origin.
 */
export class WebStack extends cdk.Stack {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    const { deployEnv, certificate, apiDomainName } = props;
    const isProd = deployEnv === 'prod';
    const removalPolicy = isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;
    const { hostedZoneId, zoneName } = HOSTED_ZONES[deployEnv];
    const domain = appDomain(deployEnv);

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

    // API Gateway routes are `/talks`, `/me`, `/d/{token}` — the `/api` prefix
    // exists only to pick this behaviour out at CloudFront, so it is removed
    // before the request is forwarded.
    const stripApiPrefix = new cloudfront.Function(this, 'StripApiPrefix', {
      functionName: `lightning-strip-api-prefix-${deployEnv}`,
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: `Remove the ${API_PATH_PREFIX} prefix before forwarding to API Gateway`,
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var prefix = '${API_PATH_PREFIX}';
  if (request.uri.startsWith(prefix)) {
    request.uri = request.uri.slice(prefix.length) || '/';
  }
  return request;
}
`),
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
      additionalBehaviors: {
        [`${API_PATH_PREFIX}/*`]: {
          origin: new origins.HttpOrigin(apiDomainName, {
            // CloudFront-to-origin is always HTTPS regardless of how the viewer
            // arrived, so a plaintext request is only ever plaintext over the
            // first hop.
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          // Deliberately ALLOW_ALL rather than REDIRECT_TO_HTTPS: a 301 on an
          // API call is worse than useless. Non-GET clients drop the body on
          // redirect, and many drop the Authorization header too, so the retry
          // arrives unauthenticated with nothing in it. The SPA is served over
          // HTTPS and its calls inherit that; this only affects a caller who
          // asked for plain HTTP explicitly.
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          // An API response is never the same twice, and the Authorization
          // header must not become part of a cache key by accident.
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          // Forwards Authorization and the query string; excludes Host, which
          // API Gateway needs to be its own.
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          functionAssociations: [
            {
              function: stripApiPrefix,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
      },
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
    const params: Array<[string, string, string]> = [
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
