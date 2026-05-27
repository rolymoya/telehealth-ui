import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface AppRunnerRoleProps {
  /** ARN of the apoth KMS key used for envelope encryption and decryption */
  readonly kmsKeyArn: string;
}

/**
 * Instance role attached to the App Runner service.
 * Least-privilege: only the resources the web service actually calls at runtime.
 * No EC2, no IAM, no broad S3 access.
 */
export class AppRunnerRole extends Construct {
  readonly taskRole: iam.Role;

  constructor(scope: Construct, id: string, props: AppRunnerRoleProps) {
    super(scope, id);

    if (!props.kmsKeyArn.startsWith('arn:aws:kms:')) {
      throw new Error(
        `AppRunnerRoleProps.kmsKeyArn must be a valid KMS ARN, got: '${props.kmsKeyArn}'`,
      );
    }

    this.taskRole = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      roleName: 'apoth-app-runner-task',
      description: 'App Runner instance role — least-privilege for the web service',
    });

    // Secrets Manager: read apoth/* namespace only (env vars, API keys)
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SecretsRead',
        actions: [
          'secretsmanager:GetSecretValue',
          'secretsmanager:DescribeSecret',
        ],
        resources: ['arn:aws:secretsmanager:*:*:secret:apoth/*'],
      }),
    );

    // SQS: enqueue to webhook queue (outbound webhooks from the web layer)
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'WebhookEnqueue',
        actions: ['sqs:SendMessage', 'sqs:GetQueueUrl', 'sqs:GetQueueAttributes'],
        resources: ['arn:aws:sqs:*:*:apoth-*'],
      }),
    );

    // S3: read consent documents (patient-signed consent PDFs)
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ConsentRead',
        actions: ['s3:GetObject'],
        resources: ['arn:aws:s3:::apoth-consents/*'],
      }),
    );

    // KMS: envelope decrypt for data at rest; scoped to the single apoth key
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'KmsDecrypt',
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: [props.kmsKeyArn],
      }),
    );
  }
}
