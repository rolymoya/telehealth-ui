import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, beforeAll } from 'vitest';
import { NetworkStack } from '../lib/network-stack';
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
  const stack = new NetworkStack(app, 'TestNetworkStack', {
    config: testConfig,
    env: { account: testConfig.account, region: testConfig.region },
  });
  template = Template.fromStack(stack);
});

describe('NetworkStack — subnet isolation', () => {
  it('creates 6 subnets across 3 groups and 2 AZs', () => {
    template.resourceCountIs('AWS::EC2::Subnet', 6);
  });

  it('creates a VpcConnector', () => {
    template.hasResourceProperties('AWS::AppRunner::VpcConnector', {
      VpcConnectorName: 'apoth-staging-connector',
    });
  });
});

describe('NetworkStack — security group rules', () => {
  it('RdsSG does not have a catch-all egress rule (allowAllOutbound: false)', () => {
    // allowAllOutbound: false removes the default 0.0.0.0/0 egress rule;
    // CDK may still add a self-referential placeholder rule, but never allow-all
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: Match.stringLikeRegexp('RDS Postgres'),
      SecurityGroupEgress: Match.not(
        Match.arrayWith([Match.objectLike({ CidrIp: '0.0.0.0/0' })]),
      ),
    });
  });

  it('RedisSG does not have a catch-all egress rule (allowAllOutbound: false)', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: Match.stringLikeRegexp('ElastiCache Redis'),
      SecurityGroupEgress: Match.not(
        Match.arrayWith([Match.objectLike({ CidrIp: '0.0.0.0/0' })]),
      ),
    });
  });

  it('RdsSG allows ingress on port 5432 from App Runner connector', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      FromPort: 5432,
      ToPort: 5432,
      IpProtocol: 'tcp',
      Description: 'App Runner connector',
    });
  });

  it('RdsSG allows ingress on port 5432 from ECS worker', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      FromPort: 5432,
      ToPort: 5432,
      IpProtocol: 'tcp',
      Description: 'ECS worker',
    });
  });

  it('RedisSG allows ingress on port 6379 from App Runner connector', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      FromPort: 6379,
      ToPort: 6379,
      IpProtocol: 'tcp',
      Description: 'App Runner connector',
    });
  });

  it('RedisSG allows ingress on port 6379 from ECS worker', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      FromPort: 6379,
      ToPort: 6379,
      IpProtocol: 'tcp',
      Description: 'ECS worker',
    });
  });
});

describe('NetworkStack — VPC endpoints', () => {
  it('creates a gateway endpoint for S3', () => {
    // The S3 service name is a CloudFormation Join token in CDK; verify by
    // type and presence of RouteTableIds (Gateway-specific property)
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      VpcEndpointType: 'Gateway',
      RouteTableIds: Match.anyValue(),
    });
  });

  it('creates an interface endpoint for Secrets Manager', () => {
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      ServiceName: Match.stringLikeRegexp('secretsmanager'),
      VpcEndpointType: 'Interface',
      PrivateDnsEnabled: true,
    });
  });

  it('creates an interface endpoint for KMS', () => {
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      ServiceName: Match.stringLikeRegexp('kms'),
      VpcEndpointType: 'Interface',
      PrivateDnsEnabled: true,
    });
  });

  it('creates an interface endpoint for SQS', () => {
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      ServiceName: Match.stringLikeRegexp('sqs'),
      VpcEndpointType: 'Interface',
      PrivateDnsEnabled: true,
    });
  });

  it('creates interface endpoints for ECR (api + dkr)', () => {
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      ServiceName: Match.stringLikeRegexp('ecr.api'),
      VpcEndpointType: 'Interface',
    });
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      ServiceName: Match.stringLikeRegexp('ecr.dkr'),
      VpcEndpointType: 'Interface',
    });
  });

  it('creates an interface endpoint for CloudWatch Logs', () => {
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      ServiceName: Match.stringLikeRegexp('logs'),
      VpcEndpointType: 'Interface',
      PrivateDnsEnabled: true,
    });
  });
});
