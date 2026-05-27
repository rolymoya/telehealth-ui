import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Stack, StackProps, RemovalPolicy, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { WorkerRole } from '../iam/worker-role';
import type { AppConfig } from './config';
import type { NetworkStack } from './network-stack';
import type { DataStack } from './data-stack';

export interface WorkerStackProps extends StackProps {
  readonly config: AppConfig;
  readonly networkStack: NetworkStack;
  readonly dataStack: DataStack;
}

export class WorkerStack extends Stack {
  readonly ecsCluster: ecs.Cluster;

  constructor(scope: Construct, id: string, props: WorkerStackProps) {
    super(scope, id, props);
    const { config, networkStack, dataStack } = props;

    // ── DLQ alarm + SNS notifications ────────────────────────────────────────

    // DLQ redrive procedure:
    //   aws sqs start-message-move-task \
    //     --source-arn <dlq-arn> --destination-arn <queue-arn>
    // See runbook in .story/tickets/T-039.json for full recovery steps.
    const dlqAlertTopic = new sns.Topic(this, 'DlqAlertTopic', {
      topicName: `apoth-${config.env}-dlq-alerts`,
      displayName: `Apoth ${config.env} DLQ alerts`,
    });

    // Email subscription placeholder — on-call destination wired in T-042
    // new sns.Subscription(this, 'DlqAlertEmail', {
    //   topic: dlqAlertTopic,
    //   protocol: sns.SubscriptionProtocol.EMAIL,
    //   endpoint: 'oncall@example.com',
    // });

    const dlqAlarm = new cloudwatch.Alarm(this, 'DlqDepthAlarm', {
      alarmName: `apoth-${config.env}-dlq-depth`,
      alarmDescription: 'Messages in the webhook DLQ — investigate dead letters',
      metric: dataStack.sqsDlq.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dlqAlarm.addAlarmAction(new cwActions.SnsAction(dlqAlertTopic));

    // ── ECS Fargate cluster ───────────────────────────────────────────────────

    this.ecsCluster = new ecs.Cluster(this, 'Cluster', {
      vpc: networkStack.vpc,
      clusterName: `apoth-${config.env}-workers`,
      containerInsights: true,
    });

    const workerRole = new WorkerRole(this, 'WorkerRole', {
      kmsKeyArn: config.kmsKeyArn,
    });

    const workerLogGroup = new logs.LogGroup(this, 'WorkerLogGroup', {
      logGroupName: `/apoth/${config.env}/worker`,
      retention: config.env === 'staging' ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.ONE_YEAR,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const taskDef = new ecs.FargateTaskDefinition(this, 'WorkerTaskDef', {
      cpu: config.env === 'staging' ? 256 : 512,
      memoryLimitMiB: config.env === 'staging' ? 512 : 1024,
      taskRole: workerRole.taskRole,
      family: 'apoth-worker',
    });

    // Placeholder image — replaced by CI pipeline (T-045)
    taskDef.addContainer('worker', {
      containerName: 'worker',
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/amazonlinux/amazonlinux:latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'worker',
        logGroup: workerLogGroup,
      }),
      environment: {
        NODE_ENV: config.env,
        QUEUE_URL: dataStack.sqsQueue.queueUrl,
      },
    });

    new ecs.FargateService(this, 'WorkerService', {
      cluster: this.ecsCluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      vpcSubnets: { subnets: networkStack.privateSubnets },
      securityGroups: [networkStack.workerSg],
      assignPublicIp: false,
      serviceName: `apoth-${config.env}-worker`,
    });
  }
}
