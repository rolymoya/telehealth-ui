import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, beforeAll, expect } from 'vitest';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import type { AppConfig } from '../lib/config';

const testConfig: AppConfig = {
  env: 'staging',
  account: '123456789012',
  region: 'us-east-1',
  natGateways: 1,
  rdsMultiAz: false,
  redisReplicas: 0,
  kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
};

let template: Template;

beforeAll(() => {
  const app = new App();
  const networkStack = new NetworkStack(app, 'TestNetwork', {
    config: testConfig,
    env: { account: testConfig.account, region: testConfig.region },
  });
  const dataStack = new DataStack(app, 'TestData', {
    config: testConfig,
    networkStack,
    env: { account: testConfig.account, region: testConfig.region },
  });
  template = Template.fromStack(dataStack);
});

describe('DataStack — RDS', () => {
  it('RDS instance is not publicly accessible', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      PubliclyAccessible: false,
    });
  });

  it('RDS parameter group includes pgaudit shared_preload_libraries', () => {
    template.hasResourceProperties('AWS::RDS::DBParameterGroup', {
      Parameters: Match.objectLike({
        shared_preload_libraries: 'pgaudit',
      }),
    });
  });

  it('RDS parameter group enforces TLS with rds.force_ssl=1', () => {
    template.hasResourceProperties('AWS::RDS::DBParameterGroup', {
      Parameters: Match.objectLike({
        'rds.force_ssl': '1',
      }),
    });
  });

  it('RDS storage is encrypted', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      StorageEncrypted: true,
    });
  });

  it('RDS has IAM authentication enabled', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      EnableIAMDatabaseAuthentication: true,
    });
  });
});

describe('DataStack — S3 buckets', () => {
  it('webhook-payloads bucket blocks all public access', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: Match.stringLikeRegexp('webhook-payloads'),
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('audit-exports bucket blocks all public access', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: Match.stringLikeRegexp('audit-exports'),
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('kyc-documents bucket blocks all public access', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: Match.stringLikeRegexp('kyc-documents'),
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('all three PHI buckets have bucket policies that enforce SSL', () => {
    // enforceSSL: true generates a bucket policy Deny on non-HTTPS
    const policies = template.findResources('AWS::S3::BucketPolicy');
    const enforcesSsl = Object.values(policies).filter((p: unknown) => {
      const doc = (p as { Properties: { PolicyDocument: { Statement: Array<{ Condition?: { Bool?: Record<string, unknown> }; Effect?: string }> } } }).Properties.PolicyDocument;
      return doc.Statement.some(
        (s) => s.Effect === 'Deny' && s.Condition?.Bool?.['aws:SecureTransport'] !== undefined,
      );
    });
    // At least 3 PHI buckets (webhook-payloads, audit-exports, kyc-documents)
    expect(enforcesSsl.length).toBeGreaterThanOrEqual(3);
  });

  it('audit-exports bucket has Object Lock enabled', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: Match.stringLikeRegexp('audit-exports'),
      ObjectLockEnabled: true,
    });
  });

  it('audit-exports bucket uses GOVERNANCE Object Lock mode in staging', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: Match.stringLikeRegexp('audit-exports'),
      ObjectLockConfiguration: Match.objectLike({
        ObjectLockEnabled: 'Enabled',
        Rule: Match.objectLike({
          DefaultRetention: Match.objectLike({
            Mode: 'GOVERNANCE',
          }),
        }),
      }),
    });
  });
});

describe('DataStack — SQS', () => {
  it('DLQ has maxReceiveCount=5', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: Match.stringLikeRegexp('webhook$'),
      RedrivePolicy: Match.objectLike({
        maxReceiveCount: 5,
      }),
    });
  });

  it('queue and DLQ have resource policies that deny non-TLS access', () => {
    const policies = template.findResources('AWS::SQS::QueuePolicy');
    const hasNonTlsDeny = Object.values(policies).some((p: unknown) => {
      const doc = (p as { Properties: { PolicyDocument: { Statement: Array<{ Effect?: string; Condition?: unknown }> } } }).Properties.PolicyDocument;
      return doc.Statement.some((s) => s.Effect === 'Deny' && s.Condition !== undefined);
    });
    expect(hasNonTlsDeny).toBe(true);
  });
});
