import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { DeployEnv, HOSTED_ZONES, appDomain } from './env';

export interface WebCertStackProps extends cdk.StackProps {
  deployEnv: DeployEnv;
}

/** CloudFront will only take a certificate from us-east-1, hence its own stack. */
export class WebCertStack extends cdk.Stack {
  readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: WebCertStackProps) {
    super(scope, id, props);

    const { deployEnv } = props;
    const { hostedZoneId, zoneName } = HOSTED_ZONES[deployEnv];

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId,
      zoneName,
    });

    this.certificate = new acm.Certificate(this, 'Cert', {
      domainName: appDomain(deployEnv),
      validation: acm.CertificateValidation.fromDns(zone),
    });
  }
}
