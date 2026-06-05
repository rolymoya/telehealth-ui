import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import {
  getStageConfig,
  resolveDeployEnvironment,
  type StageName,
} from "../src/config";
import { ServerlessPlatformStack } from "../src/serverless-platform-stack";

function synthesizeTemplate(stage: StageName = "staging") {
  const app = new cdk.App();
  const stack = new ServerlessPlatformStack(app, `Test-${stage}`, {
    config: getStageConfig(stage),
    env: { account: "111111111111", region: "us-east-1" },
  });

  return Template.fromStack(stack);
}

describe("ServerlessPlatformStack", () => {
  it("creates the required lean serverless resources", () => {
    const template = synthesizeTemplate();

    template.resourceCountIs("AWS::Cognito::UserPool", 1);
    template.resourceCountIs("AWS::Cognito::UserPoolClient", 1);
    template.resourceCountIs("AWS::DynamoDB::Table", 1);
    template.resourceCountIs("AWS::SecretsManager::Secret", 3);
    template.resourceCountIs("AWS::Lambda::Function", 2);
    template.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
    template.resourceCountIs("AWS::ApiGatewayV2::Authorizer", 1);
    template.resourceCountIs("AWS::CloudWatch::Alarm", expectedAlarmNames.length);
    template.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
    template.resourceCountIs("AWS::SQS::Queue", 2);
  });

  it("keeps health public and protects the authenticated bootstrap route", () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "GET /health",
      AuthorizationType: "NONE",
    });

    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "GET /app/bootstrap",
      AuthorizationType: "JWT",
      AuthorizerId: Match.anyValue(),
    });
  });

  it("does not configure placeholder OAuth callback URLs", () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      AllowedOAuthFlowsUserPoolClient: false,
      AllowedOAuthFlows: Match.absent(),
      AllowedOAuthScopes: Match.absent(),
      CallbackURLs: Match.absent(),
    });
  });

  it("uses MFA and stage-specific CORS origins", () => {
    const stagingTemplate = synthesizeTemplate("staging");
    const productionTemplate = synthesizeTemplate("production");

    stagingTemplate.hasResourceProperties("AWS::Cognito::UserPool", {
      MfaConfiguration: "ON",
      EnabledMfas: ["SOFTWARE_TOKEN_MFA"],
    });

    stagingTemplate.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      CorsConfiguration: {
        AllowOrigins: ["http://localhost:3000"],
      },
    });

    productionTemplate.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      CorsConfiguration: {
        AllowOrigins: ["https://apoth.health"],
      },
    });
  });

  it("captures API access logs and launch observability alarms", () => {
    const template = synthesizeTemplate();
    const templateJson = template.toJSON();
    const resources = templateJson.Resources as Record<string, SynthResource>;
    const stage = Object.values(resources).find(
      (resource) => resource.Type === "AWS::ApiGatewayV2::Stage",
    );
    expect(stage?.Properties.AccessLogSettings).toBeDefined();
    const accessLogSettings = stage?.Properties.AccessLogSettings as {
      Format: string;
    };
    expect(accessLogSettings.Format).toBe(
      JSON.stringify({
        requestId: "$context.requestId",
        routeKey: "$context.routeKey",
        status: "$context.status",
        integrationStatus: "$context.integrationStatus",
        responseLength: "$context.responseLength",
      }),
    );

    template.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      StageName: "$default",
      AccessLogSettings: {
        DestinationArn: Match.anyValue(),
      },
    });

    for (const alarmName of expectedAlarmNames) {
      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        AlarmName: alarmName,
        TreatMissingData: "notBreaching",
      });
    }
    const alarms = Object.values(resources).filter(
      (resource) => resource.Type === "AWS::CloudWatch::Alarm",
    );
    for (const alarm of alarms) {
      expect(alarm.Properties.AlarmActions).toBeUndefined();
      expect(alarm.Properties.OKActions).toBeUndefined();
      expect(alarm.Properties.InsufficientDataActions).toBeUndefined();
      expect(alarm.Properties.ActionsEnabled).not.toBe(true);
    }
    for (const contract of expectedActiveAlarmContracts) {
      template.hasResourceProperties("AWS::CloudWatch::Alarm", contract);
    }

    const accessLogFormat = accessLogSettings.Format;
    for (const forbidden of accessLogForbiddenFragments) {
      expect(accessLogFormat).not.toContain(forbidden);
    }
  });

  it("keeps custom observability metric dimensions bounded and PHI-safe", () => {
    const resources = synthesizeTemplate().toJSON().Resources as Record<
      string,
      SynthResource
    >;
    const customAlarms = Object.fromEntries(
      Object.values(resources)
        .filter(
          (resource) =>
            resource.Type === "AWS::CloudWatch::Alarm" &&
            resource.Properties.Namespace === "Apoth/Application",
        )
        .map((resource) => [
          resource.Properties.MetricName as ExpectedCustomMetricName,
          resource,
        ]),
    ) as Record<ExpectedCustomMetricName, SynthResource>;

    expect(Object.keys(customAlarms).sort()).toEqual(
      [...expectedCustomMetricNames].sort(),
    );
    for (const contract of expectedCustomMetricContracts) {
      const alarm = customAlarms[contract.metricName];
      expect(alarm.Properties).toMatchObject({
        MetricName: contract.metricName,
        Namespace: "Apoth/Application",
        Threshold: contract.threshold,
        ComparisonOperator: contract.comparisonOperator,
        EvaluationPeriods: 1,
        DatapointsToAlarm: 1,
        Period: 300,
        Statistic: contract.statistic,
        Unit: contract.unit,
      });
      expect(alarm.Properties.AlarmDescription).toMatch(/^Contract-only alarm:/);
      const dimensions = (alarm.Properties.Dimensions ?? []) as Array<{
        Name: string;
        Value: string;
      }>;
      expect(Object.fromEntries(
        dimensions.map((dimension) => [dimension.Name, dimension.Value]),
      )).toEqual(contract.dimensions);
      expect(dimensions.map((dimension) => dimension.Name).sort()).toEqual(
        allowedCustomMetricDimensions,
      );
      for (const dimension of dimensions) {
        expect(dimension.Value).not.toMatch(
          /patient|cognito|mdi_(patient|case)|stripe_(customer|subscription)|evt_|condition|medication|diagnosis|symptom|request/i,
        );
      }
    }
  });

  it("creates a launch observability dashboard", () => {
    const templateJson = synthesizeTemplate().toJSON();
    const resources = templateJson.Resources as Record<string, SynthResource>;
    const dashboard = Object.values(resources).find(
      (resource) => resource.Type === "AWS::CloudWatch::Dashboard",
    );

    expect(dashboard?.Properties.DashboardName).toBe(
      "apoth-staging-launch-observability",
    );
    const renderedDashboard = JSON.stringify(dashboard?.Properties.DashboardBody);
    for (const title of [
      "API errors",
      "Webhook queue health",
      "Stripe webhook failures and lag",
      "MDI failures",
      "Onboarding failures",
      "Webhook processing failures",
    ]) {
      expect(renderedDashboard).toContain(title);
    }
    for (const metricName of [
      "4xx",
      "5xx",
      "ApproximateAgeOfOldestMessage",
      "ApproximateNumberOfMessagesVisible",
      ...expectedCustomMetricNames,
    ]) {
      expect(renderedDashboard).toContain(metricName);
    }
  });

  it("uses stage log retention for API and Lambda log groups", () => {
    const template = synthesizeTemplate();

    for (const logGroupName of [
      "/aws/lambda/apoth-staging-health",
      "/aws/lambda/apoth-staging-authenticated-bootstrap",
      "/aws/apigateway/apoth-staging-api-access",
    ]) {
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: logGroupName,
        RetentionInDays: 7,
      });
    }
  });

  it("does not grant data permissions to the bootstrap stub", () => {
    const template = synthesizeTemplate();

    template.resourceCountIs("AWS::IAM::Policy", 0);
  });

  it("applies Apoth environment tags", () => {
    const template = synthesizeTemplate();

    for (const tag of [
      { Key: "apoth:app", Value: "telehealth-ui" },
      { Key: "apoth:stage", Value: "staging" },
      { Key: "apoth:managed-by", Value: "cdk" },
      { Key: "apoth:data-class", Value: "thin-phi-linkage" },
    ]) {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        Tags: Match.arrayWith([tag]),
      });
    }
  });

  it("creates stage-isolated Secrets Manager entries", () => {
    const template = synthesizeTemplate();

    for (const secret of expectedStagingSecrets) {
      template.hasResourceProperties("AWS::SecretsManager::Secret", {
        Name: secret.name,
        Description: Match.stringLikeRegexp(secret.purpose),
        SecretString: Match.absent(),
        Tags: Match.arrayWith([
          { Key: "apoth:secret-kind", Value: secret.kind },
          { Key: "apoth:secret-purpose", Value: secret.purpose },
          { Key: "apoth:stage", Value: "staging" },
        ]),
      });
    }
  });

  it("does not synthesize managed secret values", () => {
    const template = synthesizeTemplate();
    const rendered = JSON.stringify(template.toJSON());

    expect(rendered).not.toContain("SecretString");
    expect(rendered).not.toContain("fake_stripe_secret_key");
    expect(rendered).not.toContain("fake_mdi_client_secret");
    expect(rendered).not.toContain(secretTokenPrefix("sk", "live"));
    expect(rendered).not.toContain(["whsec", ""].join("_"));
    expect(rendered).not.toContain(secretTokenPrefix("pk", "live"));
  });

  it("omits superseded launch infrastructure", () => {
    const template = synthesizeTemplate();

    template.resourceCountIs("AWS::EC2::VPC", 0);
    template.resourceCountIs("AWS::EC2::NatGateway", 0);
    template.resourceCountIs("AWS::EC2::VPCEndpoint", 0);
    template.resourceCountIs("AWS::RDS::DBInstance", 0);
    template.resourceCountIs("AWS::RDS::DBCluster", 0);
    template.resourceCountIs("AWS::ElastiCache::CacheCluster", 0);
    template.resourceCountIs("AWS::ElastiCache::ReplicationGroup", 0);
    template.resourceCountIs("AWS::ElastiCache::ServerlessCache", 0);
    template.resourceCountIs("AWS::ECS::Cluster", 0);
    template.resourceCountIs("AWS::ECS::Service", 0);
    template.resourceCountIs("AWS::ECS::TaskDefinition", 0);
    template.resourceCountIs("AWS::AppRunner::Service", 0);
    template.resourceCountIs("AWS::ECR::Repository", 0);
    template.resourceCountIs("AWS::S3::Bucket", 0);
  });

  it("outputs app integration identifiers", () => {
    const template = synthesizeTemplate();

    for (const outputName of [
      "PatientUserPoolId",
      "PatientUserPoolClientId",
      "AppTableName",
      "ApiEndpoint",
      "WebhookQueueUrl",
      "WebhookQueueArn",
      "WebhookDeadLetterQueueUrl",
      "WebhookDeadLetterQueueArn",
      "MdiApiSecretArn",
      "StripeSecretArn",
      "AppSigningSecretArn",
      "ObservabilityDashboardName",
    ]) {
      template.hasOutput(outputName, {});
    }
  });

  it("points secret outputs at the expected secret resources", () => {
    const templateJson = synthesizeTemplate().toJSON();
    const resources = templateJson.Resources as Record<string, SynthResource>;
    expect(resources.MdiApiSecretAC9EE82C.Properties.Name).toBe(
      "/apoth/staging/mdi/api",
    );
    expect(resources.StripeSecret80A38A68.Properties.Name).toBe(
      "/apoth/staging/stripe/api",
    );

    const secretLogicalIds = Object.entries(resources)
      .filter(([, resource]) => resource.Type === "AWS::SecretsManager::Secret")
      .reduce<Record<string, string>>((accumulator, [logicalId, resource]) => {
        if (resource.Properties.Name) {
          accumulator[resource.Properties.Name] = logicalId;
        }
        return accumulator;
      }, {});

    expect(templateJson.Outputs.MdiApiSecretArn.Value).toEqual({
      "Fn::GetAtt": ["MdiApiSecretAC9EE82C", "Id"],
    });
    expect(templateJson.Outputs.StripeSecretArn.Value).toEqual({
      "Fn::GetAtt": ["StripeSecret80A38A68", "Id"],
    });
    expect(templateJson.Outputs.AppSigningSecretArn.Value).toEqual({
      "Fn::GetAtt": [secretLogicalIds["/apoth/staging/app/signing"], "Id"],
    });
  });

  it("uses retain-oriented defaults for production stateful resources", () => {
    const template = synthesizeTemplate("production");

    template.hasResourceProperties("AWS::DynamoDB::Table", {
      DeletionProtectionEnabled: true,
    });

    template.hasResource("AWS::DynamoDB::Table", {
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
    });

    template.hasResourceProperties("AWS::Cognito::UserPool", {
      DeletionProtection: "ACTIVE",
    });

    for (const resource of Object.values(
      template.findResources("AWS::SecretsManager::Secret"),
    )) {
      expect(resource).toMatchObject({
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
      });
    }

    for (const resource of Object.values(template.findResources("AWS::SQS::Queue"))) {
      expect(resource).toMatchObject({
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
      });
    }
  });

  it("uses destroy-friendly defaults for staging stateful resources", () => {
    const template = synthesizeTemplate("staging");

    template.hasResourceProperties("AWS::DynamoDB::Table", {
      DeletionProtectionEnabled: false,
    });

    template.hasResource("AWS::DynamoDB::Table", {
      DeletionPolicy: "Delete",
      UpdateReplacePolicy: "Delete",
    });

    template.hasResourceProperties("AWS::Cognito::UserPool", {
      DeletionProtection: "INACTIVE",
    });
  });

  it("guards production synth against accidental credentials", () => {
    const productionConfig = getStageConfig("production");

    expect(() =>
      resolveDeployEnvironment(productionConfig, {
        defaultAccount: "111111111111",
        defaultRegion: "us-east-1",
      }),
    ).toThrow("APOTH_ALLOW_PRODUCTION_SYNTH");

    expect(() =>
      resolveDeployEnvironment(productionConfig, {
        allowProductionSynth: "true",
        defaultAccount: "111111111111",
        defaultRegion: "us-east-1",
        productionAccountId: "222222222222",
      }),
    ).toThrow("does not match");

    expect(
      resolveDeployEnvironment(productionConfig, {
        allowProductionSynth: "true",
        defaultAccount: "111111111111",
        defaultRegion: "us-east-1",
        productionAccountId: "111111111111",
      }),
    ).toEqual({
      account: "111111111111",
      region: "us-east-1",
    });
  });
});

type SynthResource = {
  Type: string;
  Properties: {
    AccessLogSettings?: {
      Format: string;
    };
    AlarmDescription?: string;
    AlarmName?: string;
    ActionsEnabled?: boolean;
    AlarmActions?: unknown;
    ComparisonOperator?: string;
    DashboardBody?: unknown;
    DashboardName?: string;
    DatapointsToAlarm?: number;
    Dimensions?: unknown;
    EvaluationPeriods?: number;
    InsufficientDataActions?: unknown;
    MetricName?: string;
    Name?: string;
    Namespace?: string;
    OKActions?: unknown;
    Period?: number;
    Statistic?: string;
    Threshold?: number;
    TreatMissingData?: string;
  };
};

const expectedAlarmNames = [
  "apoth-staging-webhook-dlq-visible-messages",
  "apoth-staging-webhook-oldest-message-age",
  "apoth-staging-api-5xx-errors",
  "apoth-staging-api-4xx-errors",
  "apoth-staging-stripe-signature-failures",
  "apoth-staging-webhook-processing-failures",
  "apoth-staging-mdi-outbound-failures",
  "apoth-staging-onboarding-failures",
  "apoth-staging-stripe-webhook-lag-seconds",
] as const;

const expectedCustomMetricNames = [
  "StripeSignatureFailures",
  "WebhookProcessingFailures",
  "MdiOutboundFailures",
  "OnboardingFailures",
  "StripeWebhookLagSeconds",
] as const;

const expectedActiveAlarmContracts = [
  {
    AlarmName: "apoth-staging-webhook-dlq-visible-messages",
    MetricName: "ApproximateNumberOfMessagesVisible",
    Namespace: "AWS/SQS",
    Threshold: 0,
    ComparisonOperator: "GreaterThanThreshold",
    EvaluationPeriods: 1,
    DatapointsToAlarm: 1,
    Period: 300,
    Statistic: "Maximum",
    TreatMissingData: "notBreaching",
    Dimensions: Match.arrayWith([
      {
        Name: "QueueName",
        Value: Match.anyValue(),
      },
    ]),
  },
  {
    AlarmName: "apoth-staging-webhook-oldest-message-age",
    MetricName: "ApproximateAgeOfOldestMessage",
    Namespace: "AWS/SQS",
    Threshold: 900,
    ComparisonOperator: "GreaterThanOrEqualToThreshold",
    EvaluationPeriods: 1,
    DatapointsToAlarm: 1,
    Period: 300,
    Statistic: "Maximum",
    TreatMissingData: "notBreaching",
    Dimensions: Match.arrayWith([
      {
        Name: "QueueName",
        Value: Match.anyValue(),
      },
    ]),
  },
  {
    AlarmName: "apoth-staging-api-5xx-errors",
    MetricName: "5xx",
    Namespace: "AWS/ApiGateway",
    Threshold: 5,
    ComparisonOperator: "GreaterThanOrEqualToThreshold",
    EvaluationPeriods: 1,
    DatapointsToAlarm: 1,
    Period: 300,
    Statistic: "Sum",
    TreatMissingData: "notBreaching",
    Dimensions: Match.arrayWith([
      { Name: "ApiId", Value: Match.anyValue() },
      { Name: "Stage", Value: "$default" },
    ]),
  },
  {
    AlarmName: "apoth-staging-api-4xx-errors",
    MetricName: "4xx",
    Namespace: "AWS/ApiGateway",
    Threshold: 50,
    ComparisonOperator: "GreaterThanOrEqualToThreshold",
    EvaluationPeriods: 1,
    DatapointsToAlarm: 1,
    Period: 300,
    Statistic: "Sum",
    TreatMissingData: "notBreaching",
    Dimensions: Match.arrayWith([
      { Name: "ApiId", Value: Match.anyValue() },
      { Name: "Stage", Value: "$default" },
    ]),
  },
] as const;

const allowedCustomMetricDimensions = [
  "Outcome",
  "Provider",
  "ReasonCode",
  "RouteGroup",
  "Stage",
] as const;

type ExpectedCustomMetricName = (typeof expectedCustomMetricNames)[number];

const expectedCustomMetricContracts = [
  {
    metricName: "StripeSignatureFailures",
    threshold: 0,
    comparisonOperator: "GreaterThanThreshold",
    statistic: "Sum",
    unit: "Count",
    dimensions: {
      Outcome: "rejected",
      Provider: "stripe",
      ReasonCode: "signature_failed",
      RouteGroup: "webhook",
      Stage: "staging",
    },
  },
  {
    metricName: "WebhookProcessingFailures",
    threshold: 0,
    comparisonOperator: "GreaterThanThreshold",
    statistic: "Sum",
    unit: "Count",
    dimensions: {
      Outcome: "failure",
      Provider: "apoth",
      ReasonCode: "processing_failed",
      RouteGroup: "webhook",
      Stage: "staging",
    },
  },
  {
    metricName: "MdiOutboundFailures",
    threshold: 2,
    comparisonOperator: "GreaterThanOrEqualToThreshold",
    statistic: "Sum",
    unit: "Count",
    dimensions: {
      Outcome: "failure",
      Provider: "mdi",
      ReasonCode: "provider_unavailable",
      RouteGroup: "authenticated_api",
      Stage: "staging",
    },
  },
  {
    metricName: "OnboardingFailures",
    threshold: 2,
    comparisonOperator: "GreaterThanOrEqualToThreshold",
    statistic: "Sum",
    unit: "Count",
    dimensions: {
      Outcome: "failure",
      Provider: "apoth",
      ReasonCode: "validation_failed",
      RouteGroup: "authenticated_api",
      Stage: "staging",
    },
  },
  {
    metricName: "StripeWebhookLagSeconds",
    threshold: 300,
    comparisonOperator: "GreaterThanOrEqualToThreshold",
    statistic: "Maximum",
    unit: "Seconds",
    dimensions: {
      Outcome: "retry",
      Provider: "stripe",
      ReasonCode: "delayed",
      RouteGroup: "webhook",
      Stage: "staging",
    },
  },
] as const satisfies Array<{
  metricName: ExpectedCustomMetricName;
  threshold: number;
  comparisonOperator: string;
  statistic: string;
  unit: string;
  dimensions: Record<(typeof allowedCustomMetricDimensions)[number], string>;
}>;

const accessLogForbiddenFragments = [
  "authorizer",
  "body",
  "claims",
  "email",
  "header",
  "identity",
  "ip",
  "name",
  "path",
  "query",
  "requestOverride",
  "responseOverride",
  "source",
  "user",
] as const;

const expectedStagingSecrets = [
  {
    name: "/apoth/staging/mdi/api",
    kind: "mdiApi",
    purpose: "MDI API client credentials",
  },
  {
    name: "/apoth/staging/stripe/api",
    kind: "stripeApi",
    purpose: "Stripe API key and webhook signing secret",
  },
  {
    name: "/apoth/staging/app/signing",
    kind: "appSigning",
    purpose: "Application-level signing material",
  },
] as const;

function secretTokenPrefix(prefix: "pk" | "sk", mode: "live") {
  return [prefix, mode, ""].join("_");
}
