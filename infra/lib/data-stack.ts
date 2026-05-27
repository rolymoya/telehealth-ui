import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Stack, StackProps, RemovalPolicy, Duration, SecretValue } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import type { AppConfig } from './config';
import type { NetworkStack } from './network-stack';

export interface DataStackProps extends StackProps {
  readonly config: AppConfig;
  readonly networkStack: NetworkStack;
}

export class DataStack extends Stack {
  readonly rdsInstance: rds.DatabaseInstance;
  readonly redisEndpoint: string;
  readonly webhookBucket: s3.Bucket;
  readonly auditBucket: s3.Bucket;
  readonly kycBucket: s3.Bucket;
  readonly sqsQueue: sqs.Queue;
  readonly sqsDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { config, networkStack } = props;

    // KMS CMK — imported; created and managed in T-043.
    // Key policy (T-043) grants kms:Encrypt/Decrypt/GenerateDataKey to RDS, S3,
    // SQS, and CloudWatch Logs via kms:ViaService for this account/region only.
    // Key admin principals are separate from key user principals.
    const kmsKey = kms.Key.fromKeyArn(this, 'ApothKey', config.kmsKeyArn);

    // ── RDS Postgres 16 ───────────────────────────────────────────────────────

    const parameterGroup = new rds.ParameterGroup(this, 'PgParamGroup', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      // pgaudit: full SQL audit for HIPAA — output is PHI-classified;
      // rds-postgres log group must be CMK-encrypted, access restricted to
      // a named break-glass IAM role. CloudTrail data events enabled on
      // audit-exports bucket to detect reads.
      parameters: {
        shared_preload_libraries: 'pgaudit',
        'pgaudit.log': 'write,ddl,role',
        // rds.force_ssl=1 enforces TLS in-transit; clients use sslmode=verify-full
        'rds.force_ssl': '1',
      },
    });

    this.rdsInstance = new rds.DatabaseInstance(this, 'RdsInstance', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType:
        config.env === 'staging'
          ? ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO)
          : ec2.InstanceType.of(ec2.InstanceClass.R7G, ec2.InstanceSize.LARGE),
      vpc: networkStack.vpc,
      vpcSubnets: { subnets: networkStack.isolatedSubnets },
      securityGroups: [networkStack.rdsSg],
      parameterGroup,
      storageEncrypted: true,
      storageEncryptionKey: kmsKey,
      multiAz: config.rdsMultiAz,
      backupRetention: Duration.days(35),
      deletionProtection: config.env === 'prod',
      iamAuthentication: true,
      cloudwatchLogsExports: ['postgresql', 'upgrade'],
      cloudwatchLogsRetention: logs.RetentionDays.SIX_YEARS,
      removalPolicy: config.env === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // ── ElastiCache Redis ─────────────────────────────────────────────────────

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: `apoth-${config.env}-redis`,
      subnetIds: networkStack.isolatedSubnets.map((s) => s.subnetId),
      cacheSubnetGroupName: `apoth-${config.env}-redis`,
    });

    // Use ReplicationGroup for both envs to support Redis AUTH (token auth)
    // and at-rest KMS encryption. numCacheClusters=1 for staging (single node).
    // authToken resolved from Secrets Manager at deploy time (T-041).
    const redisGroup = new elasticache.CfnReplicationGroup(this, 'Redis', {
      replicationGroupDescription: `apoth-${config.env} Redis`,
      cacheNodeType: config.env === 'staging' ? 'cache.t4g.micro' : 'cache.r7g.large',
      engine: 'redis',
      numCacheClusters: config.env === 'staging' ? 1 : 2,
      multiAzEnabled: config.env === 'prod',
      cacheSubnetGroupName: redisSubnetGroup.ref,
      securityGroupIds: [networkStack.redisSg.securityGroupId],
      atRestEncryptionEnabled: true,
      kmsKeyId: kmsKey.keyId,
      transitEncryptionEnabled: true,
      // authToken is set in T-041; {{resolve}} dynamic reference avoids
      // storing credentials in source
      authToken: SecretValue.secretsManager(`apoth/${config.env}/redis-auth-token`).unsafeUnwrap(),
      automaticFailoverEnabled: config.env === 'prod',
    });

    this.redisEndpoint = redisGroup.attrPrimaryEndPointAddress;

    // ── S3 Buckets ─────────────────────────────────────────────────────────────

    // Server access logs destination — no KMS (avoids circular CMK dependency)
    const accessLogsBucket = new s3.Bucket(this, 'AccessLogsBucket', {
      bucketName: `apoth-${config.env}-access-logs`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.webhookBucket = new s3.Bucket(this, 'WebhookPayloadsBucket', {
      bucketName: `apoth-${config.env}-webhook-payloads`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      encryptionKey: kmsKey,
      encryption: s3.BucketEncryption.KMS,
      serverAccessLogsBucket: accessLogsBucket,
      lifecycleRules: [
        {
          transitions: [
            { storageClass: s3.StorageClass.INFREQUENT_ACCESS, transitionAfter: Duration.days(30) },
            { storageClass: s3.StorageClass.GLACIER, transitionAfter: Duration.days(90) },
          ],
        },
      ],
      removalPolicy: config.env === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    this.auditBucket = new s3.Bucket(this, 'AuditExportsBucket', {
      bucketName: `apoth-${config.env}-audit-exports`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      encryptionKey: kmsKey,
      encryption: s3.BucketEncryption.KMS,
      serverAccessLogsBucket: accessLogsBucket,
      // GOVERNANCE in staging (removable by privileged accounts);
      // COMPLIANCE in prod (immutable 7 years, cannot be shortened)
      objectLockEnabled: true,
      objectLockDefaultRetention:
        config.env === 'prod'
          ? s3.ObjectLockRetention.compliance(Duration.days(7 * 365))
          : s3.ObjectLockRetention.governance(Duration.days(7 * 365)),
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.kycBucket = new s3.Bucket(this, 'KycDocumentsBucket', {
      bucketName: `apoth-${config.env}-kyc-documents`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      encryptionKey: kmsKey,
      encryption: s3.BucketEncryption.KMS,
      serverAccessLogsBucket: accessLogsBucket,
      lifecycleRules: [
        {
          transitions: [
            { storageClass: s3.StorageClass.GLACIER, transitionAfter: Duration.days(365) },
          ],
        },
      ],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ── SQS Webhook Queue + DLQ ───────────────────────────────────────────────

    this.sqsDlq = new sqs.Queue(this, 'WebhookDlq', {
      queueName: `apoth-${config.env}-webhook-dlq`,
      encryptionMasterKey: kmsKey,
      retentionPeriod: Duration.days(14),
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.sqsQueue = new sqs.Queue(this, 'WebhookQueue', {
      queueName: `apoth-${config.env}-webhook`,
      encryptionMasterKey: kmsKey,
      visibilityTimeout: Duration.seconds(300),
      retentionPeriod: Duration.days(4),
      deadLetterQueue: { queue: this.sqsDlq, maxReceiveCount: 5 },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Role ARNs are known at plan time (fixed role names from infra/iam/).
    // Avoids a DataStack → AppStack/WorkerStack circular dependency.
    const appRunnerRoleArn = `arn:aws:iam::${this.account}:role/apoth-app-runner-task`;
    const workerRoleArn = `arn:aws:iam::${this.account}:role/apoth-ecs-worker-task`;

    // SQS resource policy: role-scoped access + TLS enforcement
    const sqsResourcePolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          sid: 'AllowAppRunnerEnqueue',
          principals: [new iam.ArnPrincipal(appRunnerRoleArn)],
          actions: ['sqs:SendMessage', 'sqs:GetQueueUrl', 'sqs:GetQueueAttributes'],
          resources: [this.sqsQueue.queueArn],
        }),
        new iam.PolicyStatement({
          sid: 'AllowWorkerConsume',
          principals: [new iam.ArnPrincipal(workerRoleArn)],
          actions: [
            'sqs:ReceiveMessage',
            'sqs:DeleteMessage',
            'sqs:ChangeMessageVisibility',
            'sqs:GetQueueAttributes',
            'sqs:GetQueueUrl',
          ],
          resources: [this.sqsQueue.queueArn],
        }),
        new iam.PolicyStatement({
          sid: 'DenyNonTls',
          effect: iam.Effect.DENY,
          principals: [new iam.StarPrincipal()],
          actions: ['sqs:*'],
          resources: [this.sqsQueue.queueArn],
          conditions: { Bool: { 'aws:SecureTransport': 'false' } },
        }),
      ],
    });

    const dlqResourcePolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          sid: 'AllowWorkerReadDlq',
          principals: [new iam.ArnPrincipal(workerRoleArn)],
          actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
          resources: [this.sqsDlq.queueArn],
        }),
        new iam.PolicyStatement({
          sid: 'DenyNonTls',
          effect: iam.Effect.DENY,
          principals: [new iam.StarPrincipal()],
          actions: ['sqs:*'],
          resources: [this.sqsDlq.queueArn],
          conditions: { Bool: { 'aws:SecureTransport': 'false' } },
        }),
      ],
    });

    new sqs.CfnQueuePolicy(this, 'WebhookQueuePolicy', {
      queues: [this.sqsQueue.queueUrl],
      policyDocument: sqsResourcePolicy.toJSON(),
    });

    new sqs.CfnQueuePolicy(this, 'WebhookDlqPolicy', {
      queues: [this.sqsDlq.queueUrl],
      policyDocument: dlqResourcePolicy.toJSON(),
    });
  }
}
