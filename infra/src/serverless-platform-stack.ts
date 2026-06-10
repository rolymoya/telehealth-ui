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
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup } from "aws-cdk-lib/aws-logs";
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
      mfa: Mfa.REQUIRED,
      mfaSecondFactor: {
        otp: true,
        sms: false,
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: false,
      },
      removalPolicy: props.config.removalPolicy,
    });

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

    new Alarm(this, "WebhookDlqMessagesAlarm", {
      alarmName: `apoth-${props.config.stage}-webhook-dlq-visible-messages`,
      alarmDescription: "Active alarm: webhook DLQ contains messages that need triage before replay.",
      metric: webhookDlqVisibleMetric,
      threshold: 0,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    new Alarm(this, "WebhookQueueOldestMessageAgeAlarm", {
      alarmName: `apoth-${props.config.stage}-webhook-oldest-message-age`,
      alarmDescription: "Active alarm: webhook processing queue is falling behind.",
      metric: webhookOldestMessageAgeMetric,
      threshold: Duration.minutes(15).toSeconds(),
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    new Alarm(this, "ScheduledHeartbeatFailuresAlarm", {
      alarmName: `apoth-${props.config.stage}-scheduled-heartbeat-errors`,
      alarmDescription: "Active alarm: scheduled heartbeat Lambda is failing.",
      metric: scheduledHeartbeatErrorsMetric,
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
        allowHeaders: ["authorization", "content-type"],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.OPTIONS],
        allowOrigins: props.config.allowedOrigins,
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
      alarmDescription: "Active alarm: API Gateway returned elevated 5xx responses.",
      metric: apiServerErrorMetric,
      threshold: 5,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    new Alarm(this, "ApiClientErrorsAlarm", {
      alarmName: `apoth-${props.config.stage}-api-4xx-errors`,
      alarmDescription: "Active alarm: API Gateway returned elevated 4xx responses.",
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

    new CfnOutput(this, "PatientUserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "PatientUserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
    new CfnOutput(this, "AppTableName", { value: appTable.tableName });
    new CfnOutput(this, "ApiEndpoint", { value: api.apiEndpoint });
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
        alarmDescription: `${contract.status} alarm: ${contract.description}`,
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
        left: [activeMetrics.scheduledHeartbeatErrors],
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

type ActiveObservabilityMetrics = {
  apiClientError: Metric;
  apiServerError: Metric;
  scheduledHeartbeatErrors: Metric;
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
      description: "MDI outbound request failures or outage symptoms. Emitter owner: intake/dashboard MDI clients.",
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
