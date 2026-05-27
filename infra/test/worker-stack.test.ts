import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, beforeAll } from 'vitest';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { WorkerStack } from '../lib/worker-stack';
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
  const workerStack = new WorkerStack(app, 'TestWorker', {
    config: testConfig,
    networkStack,
    dataStack,
    env: { account: testConfig.account, region: testConfig.region },
  });
  template = Template.fromStack(workerStack);
});

describe('WorkerStack — DLQ alarm', () => {
  it('DLQ alarm uses GreaterThanOrEqualToThreshold with threshold 1', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      Threshold: 1,
      EvaluationPeriods: 1,
    });
  });

  it('DLQ alarm has an SNS action', () => {
    // Alarm should have at least one action pointing to the SNS topic
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: Match.stringLikeRegexp('dlq-depth'),
      AlarmActions: Match.anyValue(),
    });
    // SNS topic must exist in the same stack
    template.resourceCountIs('AWS::SNS::Topic', 1);
  });
});

describe('WorkerStack — ECS Fargate service', () => {
  it('ECS service does not assign a public IP', () => {
    template.hasResourceProperties('AWS::ECS::Service', {
      NetworkConfiguration: Match.objectLike({
        AwsvpcConfiguration: Match.objectLike({
          AssignPublicIp: 'DISABLED',
        }),
      }),
    });
  });

  it('ECS cluster has Container Insights enabled', () => {
    template.hasResourceProperties('AWS::ECS::Cluster', {
      ClusterSettings: Match.arrayWith([
        Match.objectLike({ Name: 'containerInsights', Value: 'enabled' }),
      ]),
    });
  });

  it('ECS task definition has the correct CPU and memory for staging', () => {
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Cpu: '256',
      Memory: '512',
    });
  });
});
