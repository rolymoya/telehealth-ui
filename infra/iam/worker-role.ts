import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface WorkerRoleProps {
  /** ARN of the apoth KMS key used for envelope encryption and decryption */
  readonly kmsKeyArn: string;
}

/**
 * Task role for the ECS Fargate background worker.
 * The worker consumes the webhook SQS queue, writes to RDS via IAM auth,
 * and emits structured logs. No internet-facing permissions.
 */
export class WorkerRole extends Construct {
  readonly taskRole: iam.Role;

  constructor(scope: Construct, id: string, props: WorkerRoleProps) {
    super(scope, id);

    if (!props.kmsKeyArn.startsWith('arn:aws:kms:')) {
      throw new Error(
        `WorkerRoleProps.kmsKeyArn must be a valid KMS ARN, got: '${props.kmsKeyArn}'`,
      );
    }

    this.taskRole = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: 'apoth-ecs-worker-task',
      description:
        'ECS Fargate worker task role — processes webhook queue, no internet-facing',
    });

    // SQS: consume from the webhook queue (long-poll, delete after processing)
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'WebhookConsume',
        actions: [
          'sqs:ReceiveMessage',
          'sqs:DeleteMessage',
          'sqs:ChangeMessageVisibility',
          'sqs:GetQueueAttributes',
          'sqs:GetQueueUrl',
        ],
        resources: ['arn:aws:sqs:*:*:apoth-*'],
      }),
    );

    // KMS: decrypt messages encrypted by the web layer
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'KmsDecrypt',
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: [props.kmsKeyArn],
      }),
    );

    // RDS IAM auth: connect as the apoth_worker DB user
    // IAM auth replaces a static password; the DB must have it enabled.
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'RdsIamAuth',
        actions: ['rds-db:connect'],
        resources: ['arn:aws:rds-db:*:*:dbuser:*/apoth_worker'],
      }),
    );

    // CloudWatch Logs: write structured logs to the apoth log group
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchLogs',
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['arn:aws:logs:*:*:log-group:/apoth/*:*'],
      }),
    );
  }
}
