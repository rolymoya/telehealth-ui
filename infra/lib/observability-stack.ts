import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import type { AppConfig } from './config';
import type { DataStack } from './data-stack';

export interface ObservabilityStackProps extends StackProps {
  readonly config: AppConfig;
  readonly dataStack: DataStack;
}

export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);
    const { config } = props;

    const kmsKey = kms.Key.fromKeyArn(this, 'ApothKey', config.kmsKeyArn);

    const operationalRetention =
      config.env === 'staging' ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.ONE_YEAR;

    // App Runner logs (operational)
    new logs.LogGroup(this, 'AppRunnerLogGroup', {
      logGroupName: `/apoth/${config.env}/app-runner`,
      retention: operationalRetention,
      encryptionKey: kmsKey,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Worker logs are managed in WorkerStack alongside the ECS service.
    // This group is a companion for structured queries in CloudWatch Insights.

    // VPC Flow Logs (operational) — created in NetworkStack; retention set here
    // via CloudWatch Logs subscription. Managed in NetworkStack to co-locate
    // with the VPC resource.

    // RDS audit log group — PHI-classified; 6-year retention for HIPAA.
    // Access restricted to a named break-glass IAM role; CloudTrail data
    // events enabled on the audit-exports S3 bucket to detect all reads.
    // Subscription filter ships audit entries to the audit-exports S3 bucket.
    new logs.LogGroup(this, 'RdsPgAuditLogGroup', {
      logGroupName: `/apoth/${config.env}/rds-postgres`,
      retention: logs.RetentionDays.SIX_YEARS,
      encryptionKey: kmsKey,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // CloudWatch dashboard stub — extends in T-042 with Datadog integration
    new cloudwatch.Dashboard(this, 'ApothDashboard', {
      dashboardName: `apoth-${config.env}`,
      widgets: [
        [
          new cloudwatch.TextWidget({
            markdown: `# Apoth ${config.env} — operational overview\n\nExpand with App Runner request count, RDS connections, and SQS queue depth in T-042.`,
            width: 24,
            height: 2,
          }),
        ],
      ],
    });
  }
}
