import {
  CfnOutput,
  Duration,
  Stack,
  Tags,
  type StackProps,
} from "aws-cdk-lib";
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
  TreatMissingData,
} from "aws-cdk-lib/aws-cloudwatch";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Queue, QueueEncryption } from "aws-cdk-lib/aws-sqs";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
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
        userPassword: false,
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

    const mdiSecret = new Secret(this, "MdiApiSecret", {
      secretName: `/apoth/${props.config.stage}/mdi/api`,
      description: "MDI API credentials. Populate the real value in AWS only.",
      removalPolicy: props.config.removalPolicy,
    });

    const stripeSecret = new Secret(this, "StripeSecret", {
      secretName: `/apoth/${props.config.stage}/stripe/api`,
      description: "Stripe API and webhook credentials. Populate the real value in AWS only.",
      removalPolicy: props.config.removalPolicy,
    });

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

    new Alarm(this, "WebhookDlqMessagesAlarm", {
      alarmName: `apoth-${props.config.stage}-webhook-dlq-visible-messages`,
      metric: webhookDlq.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(5),
      }),
      threshold: 0,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    new Alarm(this, "WebhookQueueOldestMessageAgeAlarm", {
      alarmName: `apoth-${props.config.stage}-webhook-oldest-message-age`,
      metric: webhookQueue.metricApproximateAgeOfOldestMessage({
        period: Duration.minutes(5),
      }),
      threshold: Duration.minutes(15).toSeconds(),
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

    api.addStage("DefaultStage", {
      stageName: "$default",
      autoDeploy: true,
      accessLogSettings: {
        destination: new LogGroupLogDestination(apiAccessLogGroup),
        format: AccessLogFormat.jsonWithStandardFields(),
      },
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
    new CfnOutput(this, "MdiApiSecretArn", { value: mdiSecret.secretArn });
    new CfnOutput(this, "StripeSecretArn", { value: stripeSecret.secretArn });
  }
}
