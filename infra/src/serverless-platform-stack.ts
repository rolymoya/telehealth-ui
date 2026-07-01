import {
  CfnOutput,
  Duration,
  Stack,
  Tags,
  type StackProps,
} from "aws-cdk-lib";
import path from "node:path";
import {
  AccountRecovery,
  CfnUserPool,
  Mfa,
  UserPool,
  UserPoolClient,
} from "aws-cdk-lib/aws-cognito";
import {
  AttributeType,
  BillingMode,
  Table,
  TableEncryption,
} from "aws-cdk-lib/aws-dynamodb";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import {
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
} from "aws-cdk-lib/aws-apigatewayv2";
import { AccessLogFormat } from "aws-cdk-lib/aws-apigateway";
import { LogGroupLogDestination } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import {
  HttpOrigin,
  S3BucketOrigin,
} from "aws-cdk-lib/aws-cloudfront-origins";
import {
  Alarm,
  ComparisonOperator,
  Dashboard,
  GraphWidget,
  Metric,
  SingleValueWidget,
  TreatMissingData,
  Unit,
} from "aws-cdk-lib/aws-cloudwatch";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import { Queue, QueueEncryption } from "aws-cdk-lib/aws-sqs";
import { CfnSecret } from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import {
  secretContracts,
  secretName,
  secretPurposeTag,
  type SecretKind,
} from "../../shared/secrets/contracts";
import {
  observabilityMetricDimensions,
  observabilityNamespace,
  type ObservabilityMetricDimension,
  type ObservabilityMetricName,
} from "../../shared/observability/metrics";
import type { StageConfig } from "./config";

export type ServerlessPlatformStackProps = StackProps & {
  config: StageConfig;
};

export class ServerlessPlatformStack extends Stack {
  constructor(scope: Construct, id: string, props: ServerlessPlatformStackProps) {
    super(scope, id, props);

    for (const [key, value] of Object.entries(props.config.tags)) {
      Tags.of(this).add(key, value);
    }

    const userPool = new UserPool(this, "PatientUserPool", {
      userPoolName: `apoth-${props.config.stage}-patients`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      autoVerify: { email: true },
      deletionProtection: props.config.deletionProtection,
      mfa: Mfa.OFF,
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: false,
      },
      removalPolicy: props.config.removalPolicy,
    });
    const userPoolResource = userPool.node.defaultChild as CfnUserPool;
    userPoolResource.emailConfiguration = {
      emailSendingAccount: "COGNITO_DEFAULT",
      replyToEmailAddress: props.config.authEmailFromAddress,
      sourceArn: this.formatArn({
        service: "ses",
        resource: "identity",
        resourceName: props.config.authEmailFromAddress,
      }),
    };

    const userPoolClient = new UserPoolClient(this, "PatientUserPoolClient", {
      userPool,
      userPoolClientName: `apoth-${props.config.stage}-web`,
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      disableOAuth: true,
      preventUserExistenceErrors: true,
    });

    const appTable = new Table(this, "AppTable", {
      tableName: `apoth-${props.config.stage}-app`,
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      timeToLiveAttribute: "expiresAtEpochSeconds",
      deletionProtection: props.config.deletionProtection,
      removalPolicy: props.config.removalPolicy,
    });

    const secrets = {
      mdiApi: this.createStageSecret("MdiApiSecret", props.config, "mdiApi"),
      stripeApi: this.createStageSecret("StripeSecret", props.config, "stripeApi"),
      appSigning: this.createStageSecret("AppSigningSecret", props.config, "appSigning"),
    };

    const webhookDlq = new Queue(this, "WebhookDeadLetterQueue", {
      queueName: `apoth-${props.config.stage}-webhook-dlq`,
      encryption: QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(14),
      removalPolicy: props.config.removalPolicy,
    });

    const webhookQueue = new Queue(this, "WebhookQueue", {
      queueName: `apoth-${props.config.stage}-webhook-processing`,
      encryption: QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(4),
      visibilityTimeout: Duration.seconds(60),
      removalPolicy: props.config.removalPolicy,
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: webhookDlq,
      },
    });

    const healthFunction = new Function(this, "HealthFunction", {
      functionName: `apoth-${props.config.stage}-health`,
      runtime: Runtime.NODEJS_20_X,
      handler: "index.handler",
      timeout: Duration.seconds(5),
      logGroup: new LogGroup(this, "HealthFunctionLogGroup", {
        logGroupName: `/aws/lambda/apoth-${props.config.stage}-health`,
        retention: props.config.logRetention,
        removalPolicy: props.config.removalPolicy,
      }),
      code: Code.fromInline(`
exports.handler = async () => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ ok: true })
});
`),
    });

    const bootstrapFunction = new Function(this, "AuthenticatedBootstrapFunction", {
      functionName: `apoth-${props.config.stage}-authenticated-bootstrap`,
      runtime: Runtime.NODEJS_20_X,
      handler: "index.handler",
      timeout: Duration.seconds(5),
      logGroup: new LogGroup(this, "AuthenticatedBootstrapFunctionLogGroup", {
        logGroupName: `/aws/lambda/apoth-${props.config.stage}-authenticated-bootstrap`,
        retention: props.config.logRetention,
        removalPolicy: props.config.removalPolicy,
      }),
      code: Code.fromInline(`
exports.handler = async () => ({
  statusCode: 501,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ error: "not_implemented" })
});
`),
    });

    const scheduledHeartbeatFunction = new NodejsFunction(
      this,
      "ScheduledHeartbeatFunction",
      {
        functionName: `apoth-${props.config.stage}-scheduled-heartbeat`,
        runtime: Runtime.NODEJS_20_X,
        handler: "handler",
        entry: path.join(__dirname, "lambda", "scheduled-heartbeat.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(10),
        bundling: {
          minify: true,
          sourceMap: false,
        },
        environment: {
          APP_TABLE_NAME: appTable.tableName,
          APOTH_STAGE: props.config.stage,
          JOB_NAME: "scheduled-heartbeat",
        },
        logGroup: new LogGroup(this, "ScheduledHeartbeatFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-scheduled-heartbeat`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );
    appTable.grant(scheduledHeartbeatFunction, "dynamodb:UpdateItem");

    const mdiCaseReconciliationFunction = new NodejsFunction(
      this,
      "MdiCaseReconciliationFunction",
      {
        functionName: `apoth-${props.config.stage}-mdi-case-reconciliation`,
        runtime: Runtime.NODEJS_20_X,
        handler: "handler",
        entry: path.join(__dirname, "lambda", "mdi-case-reconciliation.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(60),
        bundling: {
          esbuildArgs: {
            "--alias:server-only": path.join(__dirname, "lambda", "server-only-empty.ts"),
          },
          minify: true,
          sourceMap: false,
        },
        environment: {
          APP_TABLE_NAME: appTable.tableName,
          APOTH_MDI_CASE_RECONCILIATION_LIMIT: "5",
          APOTH_SECRET_MDI_API_ID: secretName(props.config.stage, "mdiApi"),
          APOTH_STAGE: props.config.stage,
          JOB_NAME: "mdi-case-reconciliation",
        },
        logGroup: new LogGroup(this, "MdiCaseReconciliationFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-mdi-case-reconciliation`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );
    appTable.grant(
      mdiCaseReconciliationFunction,
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:Query",
      "dynamodb:TransactWriteItems",
      "dynamodb:UpdateItem",
    );
    mdiCaseReconciliationFunction.addToRolePolicy(new PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        this.formatArn({
          service: "secretsmanager",
          resource: "secret",
          resourceName: `${secretName(props.config.stage, "mdiApi")}*`,
        }),
      ],
    }));

    const stripeMdiBillingReconciliationFunction = new NodejsFunction(
      this,
      "StripeMdiBillingReconciliationFunction",
      {
        functionName: `apoth-${props.config.stage}-stripe-mdi-billing-reconciliation`,
        runtime: Runtime.NODEJS_20_X,
        handler: "handler",
        entry: path.join(__dirname, "lambda", "stripe-mdi-billing-reconciliation.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(60),
        bundling: {
          esbuildArgs: {
            "--alias:server-only": path.join(__dirname, "lambda", "server-only-empty.ts"),
          },
          minify: true,
          sourceMap: false,
        },
        environment: {
          APP_TABLE_NAME: appTable.tableName,
          APOTH_SECRET_MDI_API_ID: secretName(props.config.stage, "mdiApi"),
          APOTH_SECRET_STRIPE_API_ID: secretName(props.config.stage, "stripeApi"),
          APOTH_STAGE: props.config.stage,
          APOTH_STRIPE_MDI_BILLING_RECONCILIATION_LIMIT: "5",
          JOB_NAME: "stripe-mdi-billing-reconciliation",
        },
        logGroup: new LogGroup(this, "StripeMdiBillingReconciliationFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-stripe-mdi-billing-reconciliation`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );
    appTable.grant(
      stripeMdiBillingReconciliationFunction,
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:Query",
      "dynamodb:TransactWriteItems",
      "dynamodb:UpdateItem",
    );
    stripeMdiBillingReconciliationFunction.addToRolePolicy(new PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        this.formatArn({
          service: "secretsmanager",
          resource: "secret",
          resourceName: `${secretName(props.config.stage, "mdiApi")}*`,
        }),
        this.formatArn({
          service: "secretsmanager",
          resource: "secret",
          resourceName: `${secretName(props.config.stage, "stripeApi")}*`,
        }),
      ],
    }));

    new Rule(this, "ScheduledHeartbeatRule", {
      ruleName: `apoth-${props.config.stage}-scheduled-heartbeat`,
      schedule: Schedule.rate(Duration.minutes(15)),
      targets: [
        new LambdaFunction(scheduledHeartbeatFunction, {
          retryAttempts: 1,
          maxEventAge: Duration.hours(1),
        }),
      ],
    });

    new Rule(this, "MdiCaseReconciliationRule", {
      ruleName: `apoth-${props.config.stage}-mdi-case-reconciliation`,
      schedule: Schedule.rate(Duration.hours(6)),
      targets: [
        new LambdaFunction(mdiCaseReconciliationFunction, {
          retryAttempts: 1,
          maxEventAge: Duration.hours(1),
        }),
      ],
    });

    new Rule(this, "StripeMdiBillingReconciliationRule", {
      ruleName: `apoth-${props.config.stage}-stripe-mdi-billing-reconciliation`,
      schedule: Schedule.rate(Duration.hours(6)),
      targets: [
        new LambdaFunction(stripeMdiBillingReconciliationFunction, {
          retryAttempts: 1,
          maxEventAge: Duration.hours(1),
        }),
      ],
    });

    const webhookDlqVisibleMetric = webhookDlq.metricApproximateNumberOfMessagesVisible({
      period: Duration.minutes(5),
    });
    const webhookOldestMessageAgeMetric = webhookQueue.metricApproximateAgeOfOldestMessage({
      period: Duration.minutes(5),
    });
    const scheduledHeartbeatErrorsMetric = scheduledHeartbeatFunction.metricErrors({
      period: Duration.minutes(5),
      statistic: "Sum",
    });
    const mdiCaseReconciliationErrorsMetric = mdiCaseReconciliationFunction.metricErrors({
      period: Duration.minutes(5),
      statistic: "Sum",
    });
    const stripeMdiBillingReconciliationErrorsMetric =
      stripeMdiBillingReconciliationFunction.metricErrors({
        period: Duration.minutes(5),
        statistic: "Sum",
      });
    const mdiCaseReconciliationDriftMetric = new Metric({
      namespace: "Apoth/ScheduledJobs",
      metricName: "MdiCaseReconciliationCorrections",
      dimensionsMap: {
        Stage: props.config.stage,
        Provider: "mdi",
        Outcome: "recorded",
        ReasonCode: "case_status_reconciliation",
        RouteGroup: "scheduled",
      },
      period: Duration.minutes(5),
      statistic: "Sum",
      unit: Unit.COUNT,
    });
    const stripeMdiBillingReconciliationOpsReviewMetric = new Metric({
      namespace: "Apoth/ScheduledJobs",
      metricName: "StripeMdiBillingReconciliationOpsReview",
      dimensionsMap: {
        Stage: props.config.stage,
        Provider: "stripe",
        Outcome: "recorded",
        ReasonCode: "billing_reconciliation",
        RouteGroup: "scheduled",
      },
      period: Duration.minutes(5),
      statistic: "Sum",
      unit: Unit.COUNT,
    });

    new Alarm(this, "WebhookDlqMessagesAlarm", {
      alarmName: `apoth-${props.config.stage}-webhook-dlq-visible-messages`,
      alarmDescription: launchAlarmDescription(
        "Active",
        "Webhook DLQ contains messages that need triage before replay.",
      ),
      metric: webhookDlqVisibleMetric,
      threshold: 0,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    new Alarm(this, "WebhookQueueOldestMessageAgeAlarm", {
      alarmName: `apoth-${props.config.stage}-webhook-oldest-message-age`,
      alarmDescription: launchAlarmDescription(
        "Active",
        "Webhook processing queue is falling behind.",
      ),
      metric: webhookOldestMessageAgeMetric,
      threshold: Duration.minutes(15).toSeconds(),
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    new Alarm(this, "ScheduledHeartbeatFailuresAlarm", {
      alarmName: `apoth-${props.config.stage}-scheduled-heartbeat-errors`,
      alarmDescription: launchAlarmDescription(
        "Active",
        "Scheduled heartbeat Lambda is failing.",
      ),
      metric: scheduledHeartbeatErrorsMetric,
      threshold: 0,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    new Alarm(this, "MdiCaseReconciliationFailuresAlarm", {
      alarmName: `apoth-${props.config.stage}-mdi-case-reconciliation-errors`,
      alarmDescription: launchAlarmDescription(
        "Active",
        "MDI case-status reconciliation Lambda is failing.",
      ),
      metric: mdiCaseReconciliationErrorsMetric,
      threshold: 0,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    new Alarm(this, "MdiCaseReconciliationDriftAlarm", {
      alarmName: `apoth-${props.config.stage}-mdi-case-reconciliation-drift`,
      alarmDescription: launchAlarmDescription(
        "Active",
        "MDI case-status reconciliation corrected local drift.",
      ),
      metric: mdiCaseReconciliationDriftMetric,
      threshold: 0,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    new Alarm(this, "StripeMdiBillingReconciliationFailuresAlarm", {
      alarmName: `apoth-${props.config.stage}-stripe-mdi-billing-reconciliation-errors`,
      alarmDescription: launchAlarmDescription(
        "Active",
        "Stripe-MDI billing reconciliation Lambda is failing.",
      ),
      metric: stripeMdiBillingReconciliationErrorsMetric,
      threshold: 0,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    new Alarm(this, "StripeMdiBillingReconciliationOpsReviewAlarm", {
      alarmName: `apoth-${props.config.stage}-stripe-mdi-billing-reconciliation-ops-review`,
      alarmDescription: launchAlarmDescription(
        "Active",
        "Stripe-MDI billing reconciliation found billing/care-state drift for ops review.",
      ),
      metric: stripeMdiBillingReconciliationOpsReviewMetric,
      threshold: 0,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    const apiAccessLogGroup = new LogGroup(this, "HttpApiAccessLogGroup", {
      logGroupName: `/aws/apigateway/apoth-${props.config.stage}-api-access`,
      retention: props.config.logRetention,
      removalPolicy: props.config.removalPolicy,
    });

    const api = new HttpApi(this, "HttpApi", {
      apiName: `apoth-${props.config.stage}-api`,
      createDefaultStage: false,
      corsPreflight: {
        allowHeaders: ["authorization", "content-type", "x-apoth-csrf"],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.OPTIONS],
        allowOrigins: props.config.allowedOrigins,
        allowCredentials: true,
        maxAge: Duration.days(1),
      },
    });

    const apiStage = api.addStage("DefaultStage", {
      stageName: "$default",
      autoDeploy: true,
      accessLogSettings: {
        destination: new LogGroupLogDestination(apiAccessLogGroup),
        format: AccessLogFormat.custom(
          JSON.stringify({
            requestId: "$context.requestId",
            routeKey: "$context.routeKey",
            status: "$context.status",
            integrationStatus: "$context.integrationStatus",
            responseLength: "$context.responseLength",
          }),
        ),
      },
    });

    const apiServerErrorMetric = apiStage.metricServerError({
      period: Duration.minutes(5),
      statistic: "Sum",
    });
    const apiClientErrorMetric = apiStage.metricClientError({
      period: Duration.minutes(5),
      statistic: "Sum",
    });

    new Alarm(this, "ApiServerErrorsAlarm", {
      alarmName: `apoth-${props.config.stage}-api-5xx-errors`,
      alarmDescription: launchAlarmDescription(
        "Active",
        "API Gateway returned elevated 5xx responses.",
      ),
      metric: apiServerErrorMetric,
      threshold: 5,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    new Alarm(this, "ApiClientErrorsAlarm", {
      alarmName: `apoth-${props.config.stage}-api-4xx-errors`,
      alarmDescription: launchAlarmDescription(
        "Active",
        "API Gateway returned elevated 4xx responses.",
      ),
      metric: apiClientErrorMetric,
      threshold: 50,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    const jwtAuthorizer = new HttpJwtAuthorizer(
      "PatientJwtAuthorizer",
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      {
        jwtAudience: [userPoolClient.userPoolClientId],
      },
    );

    api.addRoutes({
      path: "/health",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("HealthIntegration", healthFunction),
    });

    const dashboard = this.createLaunchObservability(
      props.config.stage,
      {
        apiClientError: apiClientErrorMetric,
        apiServerError: apiServerErrorMetric,
        scheduledHeartbeatErrors: scheduledHeartbeatErrorsMetric,
        mdiCaseReconciliationErrors: mdiCaseReconciliationErrorsMetric,
        mdiCaseReconciliationDrift: mdiCaseReconciliationDriftMetric,
        stripeMdiBillingReconciliationErrors: stripeMdiBillingReconciliationErrorsMetric,
        stripeMdiBillingReconciliationOpsReview: stripeMdiBillingReconciliationOpsReviewMetric,
        webhookDlqVisible: webhookDlqVisibleMetric,
        webhookOldestMessageAge: webhookOldestMessageAgeMetric,
      },
    );

    api.addRoutes({
      path: "/app/bootstrap",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        "AuthenticatedBootstrapIntegration",
        bootstrapFunction,
      ),
      authorizer: jwtAuthorizer,
    });

    const intakeBootstrapFunction = new NodejsFunction(
      this,
      "IntakeBootstrapFunction",
      {
        functionName: `apoth-${props.config.stage}-intake-bootstrap`,
        runtime: Runtime.NODEJS_20_X,
        handler: "bootstrapHandler",
        entry: path.join(__dirname, "lambda", "intake.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(10),
        bundling: {
          esbuildArgs: {
            "--alias:server-only": path.join(__dirname, "lambda", "server-only-empty.ts"),
          },
          minify: true,
          sourceMap: false,
        },
        environment: {
          APP_TABLE_NAME: appTable.tableName,
          APOTH_ALLOWED_ORIGIN: props.config.allowedOrigins[0] ?? "",
          APOTH_SECRET_APP_SIGNING_ID: secretName(props.config.stage, "appSigning"),
          APOTH_STAGE: props.config.stage,
          COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
        },
        logGroup: new LogGroup(this, "IntakeBootstrapFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-intake-bootstrap`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );
    appTable.grant(intakeBootstrapFunction, "dynamodb:GetItem");

    const intakePrivacyNoticeFunction = new NodejsFunction(
      this,
      "IntakePrivacyNoticeFunction",
      {
        functionName: `apoth-${props.config.stage}-intake-privacy-notice`,
        runtime: Runtime.NODEJS_20_X,
        handler: "privacyNoticeHandler",
        entry: path.join(__dirname, "lambda", "intake.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(10),
        bundling: {
          esbuildArgs: {
            "--alias:server-only": path.join(__dirname, "lambda", "server-only-empty.ts"),
          },
          minify: true,
          sourceMap: false,
        },
        environment: {
          APOTH_ALLOWED_ORIGIN: props.config.allowedOrigins[0] ?? "",
          APOTH_SECRET_APP_SIGNING_ID: secretName(props.config.stage, "appSigning"),
          APOTH_STAGE: props.config.stage,
        },
        logGroup: new LogGroup(this, "IntakePrivacyNoticeFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-intake-privacy-notice`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );

    const intakePrecheckFunction = new NodejsFunction(
      this,
      "IntakePrecheckFunction",
      {
        functionName: `apoth-${props.config.stage}-intake-precheck`,
        runtime: Runtime.NODEJS_20_X,
        handler: "precheckHandler",
        entry: path.join(__dirname, "lambda", "intake.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(10),
        bundling: {
          esbuildArgs: {
            "--alias:server-only": path.join(__dirname, "lambda", "server-only-empty.ts"),
          },
          minify: true,
          sourceMap: false,
        },
        environment: {
          APP_TABLE_NAME: appTable.tableName,
          APOTH_ALLOWED_ORIGIN: props.config.allowedOrigins[0] ?? "",
          APOTH_SECRET_APP_SIGNING_ID: secretName(props.config.stage, "appSigning"),
          APOTH_STAGE: props.config.stage,
          COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
        },
        logGroup: new LogGroup(this, "IntakePrecheckFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-intake-precheck`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );
    appTable.grant(
      intakePrecheckFunction,
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    );
    for (const fn of [
      intakeBootstrapFunction,
      intakePrivacyNoticeFunction,
      intakePrecheckFunction,
    ]) {
      fn.addToRolePolicy(new PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          this.formatArn({
            service: "secretsmanager",
            resource: "secret",
            resourceName: `${secretName(props.config.stage, "appSigning")}*`,
          }),
        ],
      }));
    }

    api.addRoutes({
      path: "/api/intake/bootstrap",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        "IntakeBootstrapIntegration",
        intakeBootstrapFunction,
      ),
    });

    api.addRoutes({
      path: "/api/intake/privacy-notice",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "IntakePrivacyNoticeIntegration",
        intakePrivacyNoticeFunction,
      ),
    });

    api.addRoutes({
      path: "/api/intake/precheck",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "IntakePrecheckIntegration",
        intakePrecheckFunction,
      ),
    });

    const mdiIntakeBootstrapFunction = new NodejsFunction(
      this,
      "MdiIntakeBootstrapFunction",
      {
        functionName: `apoth-${props.config.stage}-mdi-intake-bootstrap`,
        runtime: Runtime.NODEJS_20_X,
        handler: "bootstrapHandler",
        entry: path.join(__dirname, "lambda", "mdi-intake.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(10),
        bundling: {
          minify: true,
          sourceMap: false,
        },
        environment: {
          APP_TABLE_NAME: appTable.tableName,
          APOTH_ALLOWED_ORIGIN: props.config.allowedOrigins[0] ?? "",
          APOTH_ALLOWED_ORIGINS: props.config.allowedOrigins.join(","),
          APOTH_MDI_MODE: props.config.mdiMode,
          APOTH_MDI_QUESTIONNAIRE_ID: props.config.mdiQuestionnaireId,
          APOTH_STAGE: props.config.stage,
          APOTH_SECRET_MDI_API_ID: secretName(props.config.stage, "mdiApi"),
          COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
        },
        logGroup: new LogGroup(this, "MdiIntakeBootstrapFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-mdi-intake-bootstrap`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );
    appTable.grant(mdiIntakeBootstrapFunction, "dynamodb:GetItem");

    const mdiIntakeSubmitFunction = new NodejsFunction(
      this,
      "MdiIntakeSubmitFunction",
      {
        functionName: `apoth-${props.config.stage}-mdi-intake-submit`,
        runtime: Runtime.NODEJS_20_X,
        handler: "submitHandler",
        entry: path.join(__dirname, "lambda", "mdi-intake.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(10),
        bundling: {
          minify: true,
          sourceMap: false,
        },
        environment: {
          APP_TABLE_NAME: appTable.tableName,
          APOTH_ALLOWED_ORIGIN: props.config.allowedOrigins[0] ?? "",
          APOTH_ALLOWED_ORIGINS: props.config.allowedOrigins.join(","),
          APOTH_MDI_MODE: props.config.mdiMode,
          APOTH_MDI_QUESTIONNAIRE_ID: props.config.mdiQuestionnaireId,
          APOTH_STAGE: props.config.stage,
          APOTH_SECRET_MDI_API_ID: secretName(props.config.stage, "mdiApi"),
          COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
        },
        logGroup: new LogGroup(this, "MdiIntakeSubmitFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-mdi-intake-submit`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );
    appTable.grant(
      mdiIntakeSubmitFunction,
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:TransactWriteItems",
    );

    const mdiPatientFunction = new NodejsFunction(
      this,
      "MdiPatientFunction",
      {
        functionName: `apoth-${props.config.stage}-mdi-patient`,
        runtime: Runtime.NODEJS_20_X,
        handler: "patientHandler",
        entry: path.join(__dirname, "lambda", "mdi-intake.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(10),
        bundling: {
          minify: true,
          sourceMap: false,
        },
        environment: {
          APP_TABLE_NAME: appTable.tableName,
          APOTH_ALLOWED_ORIGIN: props.config.allowedOrigins[0] ?? "",
          APOTH_ALLOWED_ORIGINS: props.config.allowedOrigins.join(","),
          APOTH_MDI_MODE: props.config.mdiMode,
          APOTH_MDI_QUESTIONNAIRE_ID: props.config.mdiQuestionnaireId,
          APOTH_STAGE: props.config.stage,
          APOTH_SECRET_MDI_API_ID: secretName(props.config.stage, "mdiApi"),
          COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
        },
        logGroup: new LogGroup(this, "MdiPatientFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-mdi-patient`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );
    appTable.grant(
      mdiPatientFunction,
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:TransactWriteItems",
    );

    if (props.config.mdiMode === "live") {
      for (const fn of [mdiIntakeBootstrapFunction, mdiIntakeSubmitFunction, mdiPatientFunction]) {
        fn.addToRolePolicy(new PolicyStatement({
          actions: ["secretsmanager:GetSecretValue"],
          resources: [
            this.formatArn({
              service: "secretsmanager",
              resource: "secret",
              resourceName: `${secretName(props.config.stage, "mdiApi")}*`,
            }),
          ],
        }));
      }
    }

    api.addRoutes({
      path: "/api/onboarding/mdi/bootstrap",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        "MdiIntakeBootstrapIntegration",
        mdiIntakeBootstrapFunction,
      ),
    });

    api.addRoutes({
      path: "/api/onboarding/mdi/patient",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "MdiPatientIntegration",
        mdiPatientFunction,
      ),
    });

    api.addRoutes({
      path: "/api/onboarding/mdi/submit",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "MdiIntakeSubmitIntegration",
        mdiIntakeSubmitFunction,
      ),
    });

    const onboardingStartFunction = new NodejsFunction(
      this,
      "OnboardingStartFunction",
      {
        functionName: `apoth-${props.config.stage}-onboarding-start`,
        runtime: Runtime.NODEJS_20_X,
        handler: "startHandler",
        entry: path.join(__dirname, "lambda", "onboarding-start.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(10),
        bundling: {
          esbuildArgs: {
            "--alias:server-only": path.join(__dirname, "lambda", "server-only-empty.ts"),
          },
          minify: true,
          sourceMap: false,
        },
        environment: {
          APP_TABLE_NAME: appTable.tableName,
          APOTH_SECRET_APP_SIGNING_ID: secretName(props.config.stage, "appSigning"),
          APOTH_STAGE: props.config.stage,
          COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
        },
        logGroup: new LogGroup(this, "OnboardingStartFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-onboarding-start`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );
    appTable.grant(
      onboardingStartFunction,
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:TransactWriteItems",
    );
    onboardingStartFunction.addToRolePolicy(new PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        this.formatArn({
          service: "secretsmanager",
          resource: "secret",
          resourceName: `${secretName(props.config.stage, "appSigning")}*`,
        }),
      ],
    }));

    api.addRoutes({
      path: "/api/onboarding/start",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        "OnboardingStartIntegration",
        onboardingStartFunction,
      ),
    });

    const authSessionPostFunction = new NodejsFunction(
      this,
      "AuthSessionPostFunction",
      {
        functionName: `apoth-${props.config.stage}-auth-session-post`,
        runtime: Runtime.NODEJS_20_X,
        handler: "postHandler",
        entry: path.join(__dirname, "lambda", "auth-session.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(10),
        bundling: {
          minify: true,
          sourceMap: false,
        },
        environment: {
          APOTH_STAGE: props.config.stage,
          COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
        },
        logGroup: new LogGroup(this, "AuthSessionPostFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-auth-session-post`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );

    const authSessionDeleteFunction = new NodejsFunction(
      this,
      "AuthSessionDeleteFunction",
      {
        functionName: `apoth-${props.config.stage}-auth-session-delete`,
        runtime: Runtime.NODEJS_20_X,
        handler: "deleteHandler",
        entry: path.join(__dirname, "lambda", "auth-session.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(10),
        bundling: {
          minify: true,
          sourceMap: false,
        },
        environment: {
          APOTH_STAGE: props.config.stage,
          COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
        },
        logGroup: new LogGroup(this, "AuthSessionDeleteFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-auth-session-delete`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );

    api.addRoutes({
      path: "/api/auth/session",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "AuthSessionPostIntegration",
        authSessionPostFunction,
      ),
    });

    api.addRoutes({
      path: "/api/auth/session",
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration(
        "AuthSessionDeleteIntegration",
        authSessionDeleteFunction,
      ),
    });

    const consentAcceptanceFunction = new NodejsFunction(
      this,
      "ConsentAcceptanceFunction",
      {
        functionName: `apoth-${props.config.stage}-consent-acceptance`,
        runtime: Runtime.NODEJS_20_X,
        handler: "acceptHandler",
        entry: path.join(__dirname, "lambda", "consent.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(10),
        bundling: {
          minify: true,
          sourceMap: false,
        },
        environment: {
          APP_TABLE_NAME: appTable.tableName,
          APOTH_ALLOWED_ORIGIN: props.config.allowedOrigins[0] ?? "",
          APOTH_STAGE: props.config.stage,
          COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
        },
        logGroup: new LogGroup(this, "ConsentAcceptanceFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-consent-acceptance`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );
    appTable.grant(
      consentAcceptanceFunction,
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:TransactWriteItems",
      "dynamodb:UpdateItem",
    );

    api.addRoutes({
      path: "/api/onboarding/consent",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "ConsentAcceptanceIntegration",
        consentAcceptanceFunction,
      ),
    });

    const dashboardFunction = new NodejsFunction(
      this,
      "PatientDashboardFunction",
      {
        functionName: `apoth-${props.config.stage}-patient-dashboard`,
        runtime: Runtime.NODEJS_20_X,
        handler: "dashboardHandler",
        entry: path.join(__dirname, "lambda", "dashboard.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(10),
        bundling: {
          esbuildArgs: {
            "--alias:server-only": path.join(__dirname, "lambda", "server-only-empty.ts"),
          },
          minify: true,
          sourceMap: false,
        },
        environment: {
          APP_TABLE_NAME: appTable.tableName,
          APOTH_STAGE: props.config.stage,
          COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
        },
        logGroup: new LogGroup(this, "PatientDashboardFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-patient-dashboard`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );
    appTable.grant(dashboardFunction, "dynamodb:GetItem", "dynamodb:Query");

    const dashboardWorkflowFunction = new NodejsFunction(
      this,
      "PatientDashboardWorkflowFunction",
      {
        functionName: `apoth-${props.config.stage}-patient-dashboard-workflow`,
        runtime: Runtime.NODEJS_20_X,
        handler: "workflowRedirectHandler",
        entry: path.join(__dirname, "lambda", "dashboard.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(10),
        bundling: {
          esbuildArgs: {
            "--alias:server-only": path.join(__dirname, "lambda", "server-only-empty.ts"),
          },
          minify: true,
          sourceMap: false,
        },
        environment: {
          APP_TABLE_NAME: appTable.tableName,
          APOTH_STAGE: props.config.stage,
          COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
        },
        logGroup: new LogGroup(this, "PatientDashboardWorkflowFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-patient-dashboard-workflow`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );
    appTable.grant(
      dashboardWorkflowFunction,
      "dynamodb:GetItem",
      "dynamodb:TransactWriteItems",
    );

    api.addRoutes({
      path: "/api/dashboard",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        "PatientDashboardIntegration",
        dashboardFunction,
      ),
    });

    api.addRoutes({
      path: "/api/dashboard/workflows/{workflow}",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        "PatientDashboardWorkflowIntegration",
        dashboardWorkflowFunction,
      ),
    });

    const billingPaymentMethodFunction = new NodejsFunction(
      this,
      "BillingPaymentMethodFunction",
      {
        functionName: `apoth-${props.config.stage}-billing-payment-method`,
        runtime: Runtime.NODEJS_20_X,
        handler: "paymentMethodHandler",
        entry: path.join(__dirname, "lambda", "billing.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(10),
        bundling: {
          esbuildArgs: {
            "--alias:server-only": path.join(__dirname, "lambda", "server-only-empty.ts"),
          },
          minify: true,
          sourceMap: false,
        },
        environment: {
          APP_TABLE_NAME: appTable.tableName,
          APOTH_STAGE: props.config.stage,
          APOTH_SECRET_STRIPE_API_ID: secretName(props.config.stage, "stripeApi"),
          COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
          NEXT_PUBLIC_SITE_URL: props.config.allowedOrigins[0] ?? "",
        },
        logGroup: new LogGroup(this, "BillingPaymentMethodFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-billing-payment-method`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );
    appTable.grant(
      billingPaymentMethodFunction,
      "dynamodb:GetItem",
      "dynamodb:TransactWriteItems",
    );

    const billingSubscriptionCancelFunction = new NodejsFunction(
      this,
      "BillingSubscriptionCancelFunction",
      {
        functionName: `apoth-${props.config.stage}-billing-subscription-cancel`,
        runtime: Runtime.NODEJS_20_X,
        handler: "subscriptionCancelHandler",
        entry: path.join(__dirname, "lambda", "billing.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(10),
        bundling: {
          esbuildArgs: {
            "--alias:server-only": path.join(__dirname, "lambda", "server-only-empty.ts"),
          },
          minify: true,
          sourceMap: false,
        },
        environment: {
          APP_TABLE_NAME: appTable.tableName,
          APOTH_STAGE: props.config.stage,
          APOTH_SECRET_STRIPE_API_ID: secretName(props.config.stage, "stripeApi"),
          COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
        },
        logGroup: new LogGroup(this, "BillingSubscriptionCancelFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-billing-subscription-cancel`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );
    appTable.grant(
      billingSubscriptionCancelFunction,
      "dynamodb:GetItem",
      "dynamodb:TransactWriteItems",
    );

    for (const fn of [billingPaymentMethodFunction, billingSubscriptionCancelFunction]) {
      fn.addToRolePolicy(new PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          this.formatArn({
            service: "secretsmanager",
            resource: "secret",
            resourceName: `${secretName(props.config.stage, "stripeApi")}*`,
          }),
        ],
      }));
    }

    api.addRoutes({
      path: "/api/billing/payment-method",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "BillingPaymentMethodIntegration",
        billingPaymentMethodFunction,
      ),
    });

    api.addRoutes({
      path: "/api/billing/subscription/cancel",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "BillingSubscriptionCancelIntegration",
        billingSubscriptionCancelFunction,
      ),
    });

    const stripeWebhookFunction = new NodejsFunction(
      this,
      "StripeWebhookFunction",
      {
        functionName: `apoth-${props.config.stage}-stripe-webhook`,
        runtime: Runtime.NODEJS_20_X,
        handler: "stripeWebhookHandler",
        entry: path.join(__dirname, "lambda", "webhooks.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(30),
        bundling: {
          esbuildArgs: {
            "--alias:server-only": path.join(__dirname, "lambda", "server-only-empty.ts"),
          },
          minify: true,
          sourceMap: false,
        },
        environment: {
          APP_TABLE_NAME: appTable.tableName,
          APOTH_STAGE: props.config.stage,
          APOTH_SECRET_STRIPE_API_ID: secretName(props.config.stage, "stripeApi"),
          APOTH_WEBHOOK_QUEUE_URL: webhookQueue.queueUrl,
          STRIPE_RECURRING_PRICE_ID: process.env.STRIPE_RECURRING_PRICE_ID ??
            "price_launch_placeholder",
        },
        logGroup: new LogGroup(this, "StripeWebhookFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-stripe-webhook`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );
    appTable.grant(
      stripeWebhookFunction,
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:Query",
      "dynamodb:TransactWriteItems",
      "dynamodb:UpdateItem",
    );
    webhookQueue.grantSendMessages(stripeWebhookFunction);
    stripeWebhookFunction.addToRolePolicy(new PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        this.formatArn({
          service: "secretsmanager",
          resource: "secret",
          resourceName: `${secretName(props.config.stage, "stripeApi")}*`,
        }),
      ],
    }));

    const mdiWebhookFunction = new NodejsFunction(
      this,
      "MdiWebhookFunction",
      {
        functionName: `apoth-${props.config.stage}-mdi-webhook`,
        runtime: Runtime.NODEJS_20_X,
        handler: "mdiWebhookHandler",
        entry: path.join(__dirname, "lambda", "webhooks.ts"),
        depsLockFilePath: path.join(__dirname, "..", "package-lock.json"),
        timeout: Duration.seconds(30),
        bundling: {
          esbuildArgs: {
            "--alias:server-only": path.join(__dirname, "lambda", "server-only-empty.ts"),
          },
          minify: true,
          sourceMap: false,
        },
        environment: {
          APP_TABLE_NAME: appTable.tableName,
          APOTH_STAGE: props.config.stage,
          APOTH_SECRET_MDI_API_ID: secretName(props.config.stage, "mdiApi"),
          APOTH_SECRET_STRIPE_API_ID: secretName(props.config.stage, "stripeApi"),
          STRIPE_RECURRING_PRICE_ID: process.env.STRIPE_RECURRING_PRICE_ID ??
            "price_launch_placeholder",
        },
        logGroup: new LogGroup(this, "MdiWebhookFunctionLogGroup", {
          logGroupName: `/aws/lambda/apoth-${props.config.stage}-mdi-webhook`,
          retention: props.config.logRetention,
          removalPolicy: props.config.removalPolicy,
        }),
      },
    );
    appTable.grant(
      mdiWebhookFunction,
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:Query",
      "dynamodb:TransactWriteItems",
      "dynamodb:UpdateItem",
    );
    mdiWebhookFunction.addToRolePolicy(new PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        this.formatArn({
          service: "secretsmanager",
          resource: "secret",
          resourceName: `${secretName(props.config.stage, "mdiApi")}*`,
        }),
        this.formatArn({
          service: "secretsmanager",
          resource: "secret",
          resourceName: `${secretName(props.config.stage, "stripeApi")}*`,
        }),
      ],
    }));

    api.addRoutes({
      path: "/api/webhooks/stripe",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "StripeWebhookIntegration",
        stripeWebhookFunction,
      ),
    });

    api.addRoutes({
      path: "/api/webhooks/mdi",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "MdiWebhookIntegration",
        mdiWebhookFunction,
      ),
    });

    const staticAssetsBucket = new Bucket(this, "StaticAssetsBucket", {
      bucketName: `apoth-${props.config.stage}-static-assets`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: props.config.removalPolicy,
    });

    const patientAppBucket = new Bucket(this, "PatientAppBucket", {
      bucketName: `apoth-${props.config.stage}-patient-app`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: props.config.removalPolicy,
    });

    const staticCleanRouteFunction = new CloudFrontFunction(
      this,
      "StaticCleanRouteFunction",
      {
        functionName: `apoth-${props.config.stage}-static-clean-routes`,
        code: FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var staticRoutes = {
    "/": true,
    "/about": true,
    "/privacy": true,
    "/terms": true,
  };
  if (uri.length > 1 && uri.endsWith("/")) {
    uri = uri.slice(0, -1);
  }
  if (uri === "/") {
    request.uri = "/index.html";
    return request;
  }
  if (!uri.includes(".") && !uri.endsWith("/")) {
    request.uri = staticRoutes[uri] ? uri + "/index.html" : "/404.html";
    return request;
  }
  if (uri.endsWith("/")) {
    request.uri = staticRoutes[uri] ? uri + "/index.html" : "/404.html";
  }
  return request;
}
`),
      },
    );

    const patientAppRouteFunction = new CloudFrontFunction(
      this,
      "PatientAppRouteFunction",
      {
        functionName: `apoth-${props.config.stage}-patient-app-routes`,
        code: FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri === "" || uri === "/") {
    request.uri = "/patient-index.html";
    return request;
  }
  if (!uri.includes(".")) {
    request.uri = "/patient-index.html";
  }
  return request;
}
`),
      },
    );

    const patientAppOrigin = S3BucketOrigin.withOriginAccessControl(patientAppBucket);
    const patientAppBehavior = {
      origin: patientAppOrigin,
      allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      cachePolicy: CachePolicy.CACHING_OPTIMIZED,
      functionAssociations: [
        {
          eventType: FunctionEventType.VIEWER_REQUEST,
          function: patientAppRouteFunction,
        },
      ],
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    };

    const staticWebDistribution = new Distribution(this, "StaticWebDistribution", {
      comment: `Apoth ${props.config.stage} marketing, patient app, and same-origin API`,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(staticAssetsBucket),
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          {
            eventType: FunctionEventType.VIEWER_REQUEST,
            function: staticCleanRouteFunction,
          },
        ],
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        "api/*": {
          origin: new HttpOrigin(
            `${api.apiId}.execute-api.${this.region}.amazonaws.com`,
            {
              protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
            },
          ),
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        "account*": patientAppBehavior,
        "billing*": patientAppBehavior,
        "dashboard*": patientAppBehavior,
        "get-started*": patientAppBehavior,
        "intake*": patientAppBehavior,
        "medication-management*": patientAppBehavior,
        "onboarding/*": patientAppBehavior,
        "patient-assets/*": {
          origin: patientAppOrigin,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: CachePolicy.CACHING_OPTIMIZED,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        "reset-password*": patientAppBehavior,
        "sign-in*": patientAppBehavior,
        "sign-out*": patientAppBehavior,
        "sign-up*": patientAppBehavior,
        "verify-email*": patientAppBehavior,
      },
    });

    const runtimeAllowedOrigins = [
      ...props.config.allowedOrigins,
      `https://${staticWebDistribution.distributionDomainName}`,
    ].join(",");
    for (const fn of [
      intakeBootstrapFunction,
      intakePrivacyNoticeFunction,
      intakePrecheckFunction,
      mdiIntakeBootstrapFunction,
      mdiIntakeSubmitFunction,
      mdiPatientFunction,
      consentAcceptanceFunction,
    ]) {
      fn.addEnvironment("APOTH_ALLOWED_ORIGINS", runtimeAllowedOrigins);
    }

    new CfnOutput(this, "PatientUserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "PatientUserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
    new CfnOutput(this, "AppTableName", { value: appTable.tableName });
    new CfnOutput(this, "ApiEndpoint", { value: api.apiEndpoint });
    new CfnOutput(this, "StaticAssetsBucketName", {
      value: staticAssetsBucket.bucketName,
    });
    new CfnOutput(this, "PatientAppBucketName", {
      value: patientAppBucket.bucketName,
    });
    new CfnOutput(this, "StaticWebDistributionDomainName", {
      value: staticWebDistribution.distributionDomainName,
    });
    new CfnOutput(this, "StaticWebDistributionId", {
      value: staticWebDistribution.distributionId,
    });
    new CfnOutput(this, "WebhookQueueUrl", { value: webhookQueue.queueUrl });
    new CfnOutput(this, "WebhookQueueArn", { value: webhookQueue.queueArn });
    new CfnOutput(this, "WebhookDeadLetterQueueUrl", {
      value: webhookDlq.queueUrl,
    });
    new CfnOutput(this, "WebhookDeadLetterQueueArn", {
      value: webhookDlq.queueArn,
    });
    new CfnOutput(this, "ScheduledHeartbeatFunctionName", {
      value: scheduledHeartbeatFunction.functionName,
    });
    new CfnOutput(this, "StripeMdiBillingReconciliationFunctionName", {
      value: stripeMdiBillingReconciliationFunction.functionName,
    });
    new CfnOutput(this, "MdiApiSecretArn", { value: secrets.mdiApi.attrId });
    new CfnOutput(this, "StripeSecretArn", { value: secrets.stripeApi.attrId });
    new CfnOutput(this, "AppSigningSecretArn", {
      value: secrets.appSigning.attrId,
    });
    new CfnOutput(this, "ObservabilityDashboardName", {
      value: dashboard.dashboardName,
    });
  }

  private createLaunchObservability(
    stage: StageConfig["stage"],
    activeMetrics: ActiveObservabilityMetrics,
  ) {
    const customMetrics = createObservabilityMetricContracts(stage);
    for (const contract of customMetrics) {
      new Alarm(this, contract.id, {
        alarmName: contract.alarmName,
        alarmDescription: launchAlarmDescription(contract.status, contract.description),
        metric: contract.metric,
        threshold: contract.threshold,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        comparisonOperator: contract.comparisonOperator,
        treatMissingData: contract.treatMissingData,
      });
    }

    const dashboard = new Dashboard(this, "LaunchObservabilityDashboard", {
      dashboardName: `apoth-${stage}-launch-observability`,
    });
    dashboard.addWidgets(
      new GraphWidget({
        title: "API errors",
        left: [activeMetrics.apiServerError, activeMetrics.apiClientError],
      }),
      new GraphWidget({
        title: "Webhook queue health",
        left: [
          activeMetrics.webhookDlqVisible,
          activeMetrics.webhookOldestMessageAge,
        ],
      }),
      new GraphWidget({
        title: "Scheduled job failures",
        left: [
          activeMetrics.scheduledHeartbeatErrors,
          activeMetrics.mdiCaseReconciliationErrors,
          activeMetrics.mdiCaseReconciliationDrift,
          activeMetrics.stripeMdiBillingReconciliationErrors,
          activeMetrics.stripeMdiBillingReconciliationOpsReview,
        ],
      }),
      new GraphWidget({
        title: "Stripe webhook failures and lag",
        left: [
          customMetricsByName(customMetrics, "StripeSignatureFailures").metric,
          customMetricsByName(customMetrics, "StripeWebhookLagSeconds").metric,
        ],
      }),
    );
    dashboard.addWidgets(
      new SingleValueWidget({
        title: "MDI failures",
        metrics: [customMetricsByName(customMetrics, "MdiOutboundFailures").metric],
      }),
      new SingleValueWidget({
        title: "Onboarding failures",
        metrics: [customMetricsByName(customMetrics, "OnboardingFailures").metric],
      }),
      new SingleValueWidget({
        title: "Webhook processing failures",
        metrics: [customMetricsByName(customMetrics, "WebhookProcessingFailures").metric],
      }),
    );

    return dashboard;
  }

  private createStageSecret(
    id: string,
    config: StageConfig,
    kind: SecretKind,
  ) {
    const secret = new CfnSecret(this, id, {
      name: secretName(config.stage, kind),
      description: `${secretContracts[kind].purpose}. Populate the real value in AWS only.`,
    });
    const priorLogicalId = priorSecretLogicalIds[kind];
    if (priorLogicalId) {
      secret.overrideLogicalId(priorLogicalId);
    }
    secret.applyRemovalPolicy(config.removalPolicy);

    Tags.of(secret).add("apoth:secret-purpose", secretPurposeTag(kind));
    Tags.of(secret).add("apoth:secret-kind", kind);

    return secret;
  }
}

const priorSecretLogicalIds: Partial<Record<SecretKind, string>> = {
  mdiApi: "MdiApiSecretAC9EE82C",
  stripeApi: "StripeSecret80A38A68",
};

type ObservabilityMetricContract = {
  id: string;
  metricName: ObservabilityMetricName;
  alarmName: string;
  description: string;
  threshold: number;
  comparisonOperator: ComparisonOperator;
  status: "Contract-only" | "Active";
  treatMissingData: TreatMissingData;
  metric: Metric;
};

type LaunchAlarmStatus = "Active" | "Contract-only";

const launchAlarmOwner = "launch-ops";
const launchAlarmChannel = "CloudWatch manual watch until ops contact path is approved";
const launchAlarmRunbook = "docs/runbooks/serverless-iac.md#alarm-map";

function launchAlarmDescription(status: LaunchAlarmStatus, description: string) {
  return [
    `${status} alarm: ${description}`,
    `Owner: ${launchAlarmOwner}.`,
    `Channel: ${launchAlarmChannel}.`,
    `Runbook: ${launchAlarmRunbook}.`,
  ].join(" ");
}

type ActiveObservabilityMetrics = {
  apiClientError: Metric;
  apiServerError: Metric;
  mdiCaseReconciliationDrift: Metric;
  mdiCaseReconciliationErrors: Metric;
  scheduledHeartbeatErrors: Metric;
  stripeMdiBillingReconciliationErrors: Metric;
  stripeMdiBillingReconciliationOpsReview: Metric;
  webhookDlqVisible: Metric;
  webhookOldestMessageAge: Metric;
};

const observabilityDimensions = Object.fromEntries(
  observabilityMetricDimensions.map((dimension) => [dimension, ""]),
) as Record<ObservabilityMetricDimension, string>;

function createObservabilityMetricContracts(
  stage: StageConfig["stage"],
): ObservabilityMetricContract[] {
  const baseDimensions = {
    ...observabilityDimensions,
    Stage: stage,
  };

  return [
    {
      id: "StripeSignatureFailuresAlarm",
      metricName: "StripeSignatureFailures",
      alarmName: `apoth-${stage}-stripe-signature-failures`,
      description: "Stripe webhook signature verification failures. Emitter owner: T-045.",
      threshold: 0,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      status: "Contract-only",
      treatMissingData: TreatMissingData.NOT_BREACHING,
      metric: new Metric({
        namespace: observabilityNamespace,
        metricName: "StripeSignatureFailures",
        dimensionsMap: {
          ...baseDimensions,
          Provider: "stripe",
          Outcome: "rejected",
          ReasonCode: "signature_failed",
          RouteGroup: "webhook",
        },
        unit: Unit.COUNT,
        statistic: "Sum",
        period: Duration.minutes(5),
      }),
    },
    {
      id: "WebhookProcessingFailuresAlarm",
      metricName: "WebhookProcessingFailures",
      alarmName: `apoth-${stage}-webhook-processing-failures`,
      description: "Webhook handler processing failures. Emitter owner: T-045.",
      threshold: 0,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      status: "Contract-only",
      treatMissingData: TreatMissingData.NOT_BREACHING,
      metric: new Metric({
        namespace: observabilityNamespace,
        metricName: "WebhookProcessingFailures",
        dimensionsMap: {
          ...baseDimensions,
          Provider: "apoth",
          Outcome: "failure",
          ReasonCode: "processing_failed",
          RouteGroup: "webhook",
        },
        unit: Unit.COUNT,
        statistic: "Sum",
        period: Duration.minutes(5),
      }),
    },
    {
      id: "MdiOutboundFailuresAlarm",
      metricName: "MdiOutboundFailures",
      alarmName: `apoth-${stage}-mdi-outbound-failures`,
      description: "MDI outbound request failures or outage signals. Emitter owner: intake/dashboard MDI clients.",
      threshold: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      status: "Contract-only",
      treatMissingData: TreatMissingData.NOT_BREACHING,
      metric: new Metric({
        namespace: observabilityNamespace,
        metricName: "MdiOutboundFailures",
        dimensionsMap: {
          ...baseDimensions,
          Provider: "mdi",
          Outcome: "failure",
          ReasonCode: "provider_unavailable",
          RouteGroup: "authenticated_api",
        },
        unit: Unit.COUNT,
        statistic: "Sum",
        period: Duration.minutes(5),
      }),
    },
    {
      id: "OnboardingFailuresAlarm",
      metricName: "OnboardingFailures",
      alarmName: `apoth-${stage}-onboarding-failures`,
      description: "Patient onboarding failures. Emitter owner: intake/onboarding routes.",
      threshold: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      status: "Contract-only",
      treatMissingData: TreatMissingData.NOT_BREACHING,
      metric: new Metric({
        namespace: observabilityNamespace,
        metricName: "OnboardingFailures",
        dimensionsMap: {
          ...baseDimensions,
          Provider: "apoth",
          Outcome: "failure",
          ReasonCode: "validation_failed",
          RouteGroup: "authenticated_api",
        },
        unit: Unit.COUNT,
        statistic: "Sum",
        period: Duration.minutes(5),
      }),
    },
    {
      id: "StripeWebhookLagAlarm",
      metricName: "StripeWebhookLagSeconds",
      alarmName: `apoth-${stage}-stripe-webhook-lag-seconds`,
      description: "Stripe webhook age at processing time. Emitter owner: T-045.",
      threshold: Duration.minutes(5).toSeconds(),
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      status: "Contract-only",
      treatMissingData: TreatMissingData.NOT_BREACHING,
      metric: new Metric({
        namespace: observabilityNamespace,
        metricName: "StripeWebhookLagSeconds",
        dimensionsMap: {
          ...baseDimensions,
          Provider: "stripe",
          Outcome: "retry",
          ReasonCode: "delayed",
          RouteGroup: "webhook",
        },
        unit: Unit.SECONDS,
        statistic: "Maximum",
        period: Duration.minutes(5),
      }),
    },
  ];
}

function customMetricsByName(
  metrics: ObservabilityMetricContract[],
  metricName: ObservabilityMetricContract["metricName"],
) {
  const contract = metrics.find((metric) => metric.metricName === metricName);
  if (!contract) {
    throw new Error(`Missing observability metric contract: ${metricName}`);
  }
  return contract;
}
