import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import {
  getStageConfig,
  resolveDeployEnvironment,
  type StageName,
} from "../src/config";
import { ServerlessPlatformStack } from "../src/serverless-platform-stack";
import {
  observabilityMetricDimensions,
  observabilityMetricNames,
  observabilityNamespace,
  type ObservabilityMetricDimension,
  type ObservabilityMetricName,
} from "../../shared/observability/metrics";

function synthesizeTemplate(stage: StageName = "staging") {
  const app = new cdk.App();
  const stack = new ServerlessPlatformStack(app, `Test-${stage}`, {
    config: getStageConfig(stage),
    env: { account: "111111111111", region: "us-east-1" },
  });

  return Template.fromStack(stack);
}

describe("ServerlessPlatformStack", () => {
  it("imports neutral shared secret contracts instead of app runtime modules", () => {
    const stackSource = readFileSync(
      join(process.cwd(), "src/serverless-platform-stack.ts"),
      "utf8",
    );

    expect(stackSource).toContain("../../shared/secrets/contracts");
    expect(stackSource).not.toContain("../../src/lib/secrets/contracts");
  });

  it("creates the required lean serverless resources", () => {
    const template = synthesizeTemplate();
    const resources = template.toJSON().Resources as Record<string, SynthResource>;

    template.resourceCountIs("AWS::Cognito::UserPool", 1);
    template.resourceCountIs("AWS::Cognito::UserPoolClient", 1);
    template.resourceCountIs("AWS::DynamoDB::Table", 1);
    template.resourceCountIs("AWS::SecretsManager::Secret", 3);
    template.resourceCountIs("AWS::Lambda::Function", 11);
    template.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
    template.resourceCountIs("AWS::ApiGatewayV2::Authorizer", 1);
    template.resourceCountIs("AWS::CloudWatch::Alarm", expectedAlarmNames.length);
    template.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
    template.resourceCountIs("AWS::CloudFront::Distribution", 1);
    template.resourceCountIs("AWS::CloudFront::Function", 1);
    template.resourceCountIs("AWS::CloudFront::OriginAccessControl", 1);
    template.resourceCountIs("AWS::Events::Rule", 1);
    template.resourceCountIs("AWS::S3::Bucket", 1);
    template.resourceCountIs("AWS::SQS::Queue", 2);

    const queues = Object.values(resources).filter(
      (resource) => resource.Type === "AWS::SQS::Queue",
    );
    const redriveQueues = queues.filter(
      (resource) => resource.Properties.RedrivePolicy !== undefined,
    );
    const processingQueue = queues.find(
      (resource) => resource.Properties.QueueName === "apoth-staging-webhook-processing",
    );
    const dlqEntry = Object.entries(resources).find(([, resource]) =>
      resource.Type === "AWS::SQS::Queue" &&
      resource.Properties.QueueName === "apoth-staging-webhook-dlq"
    );
    const dlq = dlqEntry?.[1];

    expect(redriveQueues).toHaveLength(1);
    expect(processingQueue).toBeDefined();
    expect(dlq).toBeDefined();
    expect(processingQueue?.Properties.RedrivePolicy?.maxReceiveCount).toBe(3);
    expect(JSON.stringify(processingQueue?.Properties.RedrivePolicy?.deadLetterTargetArn))
      .toContain(dlqEntry?.[0]);
    expect(dlq?.Properties.RedrivePolicy).toBeUndefined();
  });

  it("keeps health public and protects authenticated API routes", () => {
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

    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "GET /api/intake/bootstrap",
      AuthorizationType: "NONE",
    });

    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "POST /api/intake/precheck",
      AuthorizationType: "NONE",
    });

    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "GET /api/onboarding/mdi/bootstrap",
      AuthorizationType: "NONE",
    });

    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "POST /api/onboarding/mdi/submit",
      AuthorizationType: "NONE",
    });

    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "GET /api/onboarding/start",
      AuthorizationType: "NONE",
    });

    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "POST /api/auth/session",
      AuthorizationType: "NONE",
    });

    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "DELETE /api/auth/session",
      AuthorizationType: "NONE",
    });

    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "POST /api/onboarding/consent",
      AuthorizationType: "NONE",
    });
  });

  it("creates cookie-verified intake API lambdas with bounded table access", () => {
    const template = synthesizeTemplate();

    for (const [functionName, handler] of [
      ["apoth-staging-intake-bootstrap", "index.bootstrapHandler"],
      ["apoth-staging-intake-precheck", "index.precheckHandler"],
    ]) {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: functionName,
        Handler: handler,
        Runtime: "nodejs20.x",
        Timeout: 10,
        Environment: {
          Variables: {
            APOTH_ALLOWED_ORIGIN: "http://localhost:3000",
            APOTH_ALLOWED_ORIGINS: Match.anyValue(),
            APOTH_STAGE: "staging",
            APP_TABLE_NAME: Match.anyValue(),
            COGNITO_USER_POOL_CLIENT_ID: Match.anyValue(),
            COGNITO_USER_POOL_ID: Match.anyValue(),
          },
        },
      });
    }

    const policies = JSON.stringify(
      Object.values(template.findResources("AWS::IAM::Policy")),
    );
    expect(policies).toContain("dynamodb:GetItem");
    expect(policies).toContain("dynamodb:PutItem");
    expect(policies).toContain("dynamodb:UpdateItem");
    expect(policies).not.toContain("dynamodb:DeleteItem");
  });

  it("creates MDI intake API lambdas that use cookie auth and pointer-only table writes", () => {
    const template = synthesizeTemplate();

    for (const [functionName, handler] of [
      ["apoth-staging-mdi-intake-bootstrap", "index.bootstrapHandler"],
      ["apoth-staging-mdi-intake-submit", "index.submitHandler"],
    ]) {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: functionName,
        Handler: handler,
        Runtime: "nodejs20.x",
        Timeout: 10,
        Environment: {
          Variables: {
            APOTH_ALLOWED_ORIGIN: "http://localhost:3000",
            APOTH_ALLOWED_ORIGINS: Match.anyValue(),
            APOTH_MDI_QUESTIONNAIRE_ID: "mdi_questionnaire_launch",
            APOTH_STAGE: "staging",
            APOTH_SECRET_MDI_API_ID: "/apoth/staging/mdi/api",
            APP_TABLE_NAME: Match.anyValue(),
            COGNITO_USER_POOL_CLIENT_ID: Match.anyValue(),
            COGNITO_USER_POOL_ID: Match.anyValue(),
          },
        },
      });
    }

    const policies = JSON.stringify(
      Object.values(template.findResources("AWS::IAM::Policy")),
    );
    expect(policies).toContain("dynamodb:GetItem");
    expect(policies).toContain("dynamodb:PutItem");
    expect(policies).toContain("dynamodb:TransactWriteItems");
    expect(policies).toContain("secretsmanager:GetSecretValue");
    expect(policies).not.toContain("dynamodb:DeleteItem");
  });

  it("creates profile-only onboarding start API lambda", () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "apoth-staging-onboarding-start",
      Handler: "index.startHandler",
      Runtime: "nodejs20.x",
      Timeout: 10,
      Environment: {
        Variables: {
          APOTH_STAGE: "staging",
          APP_TABLE_NAME: Match.anyValue(),
          COGNITO_USER_POOL_CLIENT_ID: Match.anyValue(),
          COGNITO_USER_POOL_ID: Match.anyValue(),
        },
      },
    });

    const templateJson = template.toJSON();
    const startFunctionResource = Object.entries(templateJson.Resources as Record<string, SynthResource>)
      .find(([, resource]) =>
        resource.Type === "AWS::Lambda::Function" &&
        resource.Properties.FunctionName === "apoth-staging-onboarding-start"
      );
    expect(JSON.stringify(startFunctionResource)).not.toMatch(
      /MDI|STRIPE|BILLING|PERSONA|KYC|QUESTIONNAIRE/i,
    );
  });

  it("creates static auth session API lambdas for same-origin cookie management", () => {
    const template = synthesizeTemplate();

    for (const [functionName, handler] of [
      ["apoth-staging-auth-session-post", "index.postHandler"],
      ["apoth-staging-auth-session-delete", "index.deleteHandler"],
    ]) {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: functionName,
        Handler: handler,
        Runtime: "nodejs20.x",
        Timeout: 10,
        Environment: {
          Variables: {
            APOTH_STAGE: "staging",
            COGNITO_USER_POOL_CLIENT_ID: Match.anyValue(),
            COGNITO_USER_POOL_ID: Match.anyValue(),
          },
        },
      });
    }
  });

  it("creates static consent acceptance API lambda with bounded table access", () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "apoth-staging-consent-acceptance",
      Handler: "index.acceptHandler",
      Runtime: "nodejs20.x",
      Timeout: 10,
      Environment: {
        Variables: {
          APP_TABLE_NAME: Match.anyValue(),
          APOTH_ALLOWED_ORIGIN: "http://localhost:3000",
          APOTH_ALLOWED_ORIGINS: Match.anyValue(),
          APOTH_STAGE: "staging",
          COGNITO_USER_POOL_CLIENT_ID: Match.anyValue(),
          COGNITO_USER_POOL_ID: Match.anyValue(),
        },
      },
    });

    const policies = JSON.stringify(
      Object.values(template.findResources("AWS::IAM::Policy")),
    );
    expect(policies).toContain("dynamodb:TransactWriteItems");
    expect(policies).not.toContain("dynamodb:DeleteItem");
  });

  it("serves static assets and same-origin API paths through CloudFront", () => {
    const template = synthesizeTemplate();
    const resources = template.toJSON().Resources as Record<string, SynthResource>;

    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: "apoth-staging-static-assets",
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: "AES256",
            },
          },
        ],
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });

    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          FunctionAssociations: [
            {
              EventType: "viewer-request",
              FunctionARN: Match.anyValue(),
            },
          ],
          ViewerProtocolPolicy: "redirect-to-https",
        }),
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            AllowedMethods: [
              "GET",
              "HEAD",
              "OPTIONS",
              "PUT",
              "PATCH",
              "POST",
              "DELETE",
            ],
            PathPattern: "api/*",
            ViewerProtocolPolicy: "redirect-to-https",
          }),
        ]),
        CustomErrorResponses: Match.absent(),
      }),
    });

    const distribution = Object.values(resources).find(
      (resource) => resource.Type === "AWS::CloudFront::Distribution",
    ) as SynthResource & {
      Properties: { DistributionConfig: { Origins: unknown[] } };
    } | undefined;
    expect(JSON.stringify(distribution?.Properties.DistributionConfig.Origins))
      .toContain("execute-api");

    template.hasResourceProperties("AWS::CloudFront::Function", {
      Name: "apoth-staging-static-clean-routes",
      FunctionCode: Match.stringLikeRegexp('/index\\.html'),
    });
    template.hasResourceProperties("AWS::CloudFront::Function", {
      Name: "apoth-staging-static-clean-routes",
      FunctionCode: Match.stringLikeRegexp('/404\\.html'),
    });
    template.hasResourceProperties("AWS::CloudFront::Function", {
      Name: "apoth-staging-static-clean-routes",
      FunctionCode: Match.stringLikeRegexp('"/account"'),
    });
  });

  it("allows runtime API posts from the generated static distribution origin", () => {
    const template = synthesizeTemplate();
    const rendered = JSON.stringify(
      Object.values(template.findResources("AWS::Lambda::Function")),
    );

    expect(rendered).toContain("APOTH_ALLOWED_ORIGINS");
    expect(rendered).toContain("http://localhost:3000");
    expect(rendered).toContain("StaticWebDistribution");
    expect(rendered).toContain("DomainName");
  });

  it("creates a bounded scheduled heartbeat job", () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "apoth-staging-scheduled-heartbeat",
      Runtime: "nodejs20.x",
      Handler: "index.handler",
      Timeout: 10,
      Environment: {
        Variables: {
          APOTH_STAGE: "staging",
          APP_TABLE_NAME: Match.anyValue(),
          JOB_NAME: "scheduled-heartbeat",
        },
      },
    });

    template.hasResourceProperties("AWS::Events::Rule", {
      Name: "apoth-staging-scheduled-heartbeat",
      ScheduleExpression: "rate(15 minutes)",
      State: "ENABLED",
      Targets: Match.arrayWith([
        Match.objectLike({
          RetryPolicy: {
            MaximumEventAgeInSeconds: 3600,
            MaximumRetryAttempts: 1,
          },
        }),
      ]),
    });

    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "dynamodb:UpdateItem",
            Effect: "Allow",
          }),
        ]),
      },
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

  it("configures the Cognito launch auth posture without hosted UI", () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties("AWS::Cognito::UserPool", {
      AccountRecoverySetting: {
        RecoveryMechanisms: [
          {
            Name: "verified_email",
            Priority: 1,
          },
        ],
      },
      AdminCreateUserConfig: {
        AllowAdminCreateUserOnly: false,
      },
      AutoVerifiedAttributes: ["email"],
      EmailConfiguration: {
        EmailSendingAccount: "COGNITO_DEFAULT",
        From: "Apoth <contact@apothhealth.com>",
        ReplyToEmailAddress: "contact@apothhealth.com",
        SourceArn: Match.anyValue(),
      },
      EnabledMfas: Match.absent(),
      MfaConfiguration: "OFF",
      Policies: {
        PasswordPolicy: {
          MinimumLength: 12,
          RequireLowercase: true,
          RequireNumbers: true,
          RequireSymbols: false,
          RequireUppercase: true,
        },
      },
      UsernameAttributes: ["email"],
    });

    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      AllowedOAuthFlowsUserPoolClient: false,
      ExplicitAuthFlows: Match.arrayWith([
        "ALLOW_USER_PASSWORD_AUTH",
        "ALLOW_USER_SRP_AUTH",
        "ALLOW_REFRESH_TOKEN_AUTH",
      ]),
      GenerateSecret: Match.absent(),
      PreventUserExistenceErrors: "ENABLED",
    });
    expect(JSON.stringify(template.toJSON())).toContain("identity/apothhealth.com");
  });

  it("keeps the auth email sender on the verified Apoth domain", () => {
    expect(getStageConfig("staging")).toMatchObject({
      authEmailDomain: "apothhealth.com",
      authEmailFromAddress: "contact@apothhealth.com",
      authEmailFromName: "Apoth",
    });
    expect(getStageConfig("production")).toMatchObject({
      authEmailDomain: "apothhealth.com",
      authEmailFromAddress: "contact@apothhealth.com",
      authEmailFromName: "Apoth",
    });
  });

  it("uses no required MFA and stage-specific CORS origins", () => {
    const stagingTemplate = synthesizeTemplate("staging");
    const productionTemplate = synthesizeTemplate("production");

    stagingTemplate.hasResourceProperties("AWS::Cognito::UserPool", {
      MfaConfiguration: "OFF",
      EnabledMfas: Match.absent(),
    });

    stagingTemplate.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      CorsConfiguration: {
        AllowCredentials: true,
        AllowHeaders: Match.arrayWith(["x-apoth-csrf"]),
        AllowOrigins: ["http://localhost:3000"],
      },
    });

    productionTemplate.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      CorsConfiguration: {
        AllowCredentials: true,
        AllowHeaders: Match.arrayWith(["x-apoth-csrf"]),
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
            resource.Properties.Namespace === observabilityNamespace,
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
        Namespace: observabilityNamespace,
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
    const parsedDashboard = parseDashboardBody(dashboard?.Properties.DashboardBody);
    const metricsByTitle = dashboardMetricsByTitle(parsedDashboard);

    expect([...metricsByTitle.keys()].sort()).toEqual([
      "API errors",
      "MDI failures",
      "Onboarding failures",
      "Scheduled job failures",
      "Stripe webhook failures and lag",
      "Webhook processing failures",
      "Webhook queue health",
    ]);
    expect(metricsByTitle.get("API errors")).toEqual([
      [
        "AWS/ApiGateway",
        "5xx",
        "ApiId",
        cloudFormationToken,
        "Stage",
        "$default",
        { stat: "Sum" },
      ],
      [
        "AWS/ApiGateway",
        "4xx",
        "ApiId",
        cloudFormationToken,
        "Stage",
        "$default",
        { stat: "Sum" },
      ],
    ]);
    expect(metricsByTitle.get("Webhook queue health")).toEqual([
      [
        "AWS/SQS",
        "ApproximateNumberOfMessagesVisible",
        "QueueName",
        cloudFormationToken,
        { stat: "Maximum" },
      ],
      [
        "AWS/SQS",
        "ApproximateAgeOfOldestMessage",
        "QueueName",
        cloudFormationToken,
        { stat: "Maximum" },
      ],
    ]);
    expect(metricsByTitle.get("Scheduled job failures")).toEqual([
      [
        "AWS/Lambda",
        "Errors",
        "FunctionName",
        cloudFormationToken,
        { stat: "Sum" },
      ],
    ]);
    expect(metricsByTitle.get("Stripe webhook failures and lag")).toEqual([
      expectedDashboardCustomMetric("StripeSignatureFailures"),
      expectedDashboardCustomMetric("StripeWebhookLagSeconds"),
    ]);
    expect(metricsByTitle.get("MDI failures")).toEqual([
      expectedDashboardCustomMetric("MdiOutboundFailures"),
    ]);
    expect(metricsByTitle.get("Onboarding failures")).toEqual([
      expectedDashboardCustomMetric("OnboardingFailures"),
    ]);
    expect(metricsByTitle.get("Webhook processing failures")).toEqual([
      expectedDashboardCustomMetric("WebhookProcessingFailures"),
    ]);
  });

  it("uses stage log retention for API and Lambda log groups", () => {
    const template = synthesizeTemplate();

    for (const logGroupName of [
      "/aws/lambda/apoth-staging-health",
      "/aws/lambda/apoth-staging-authenticated-bootstrap",
      "/aws/lambda/apoth-staging-intake-bootstrap",
      "/aws/lambda/apoth-staging-intake-precheck",
      "/aws/lambda/apoth-staging-scheduled-heartbeat",
      "/aws/apigateway/apoth-staging-api-access",
    ]) {
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: logGroupName,
        RetentionInDays: 7,
      });
    }
  });

  it("grants bounded DynamoDB data permissions to runtime jobs", () => {
    const resources = synthesizeTemplate().toJSON().Resources as Record<
      string,
      SynthResource
    >;
    const policies = Object.values(resources).filter(
      (resource) => resource.Type === "AWS::IAM::Policy",
    );

    const statements = policies.flatMap((policy) =>
      Array.isArray(policy.Properties.PolicyDocument?.Statement)
        ? policy.Properties.PolicyDocument.Statement
        : [],
    );
    const rendered = JSON.stringify(statements);
    expect(rendered).toContain("dynamodb:GetItem");
    expect(rendered).toContain("dynamodb:PutItem");
    expect(rendered).toContain("dynamodb:UpdateItem");
    expect(rendered).not.toContain("dynamodb:DeleteItem");
    expect(rendered).not.toContain("dynamodb:Scan");
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

  it("uses managed encryption for launch stateful services", () => {
    const template = synthesizeTemplate();
    const templateJson = template.toJSON();
    const resources = templateJson.Resources as Record<string, SynthResource>;

    template.hasResourceProperties("AWS::DynamoDB::Table", {
      SSESpecification: {
        SSEEnabled: true,
      },
    });

    for (const resource of Object.values(resources)) {
      if (resource.Type === "AWS::DynamoDB::Table") {
        expect(resource.Properties.SSESpecification?.SSEEnabled).toBe(true);
        expect(resource.Properties.SSESpecification?.KMSMasterKeyId).toBeUndefined();
        expect(resource.Properties.SSESpecification?.SSEType).toBeUndefined();
      }
      if (resource.Type === "AWS::SQS::Queue") {
        expect(resource.Properties.SqsManagedSseEnabled).toBe(true);
        expect(resource.Properties.KmsMasterKeyId).toBeUndefined();
      }
      if (resource.Type === "AWS::SecretsManager::Secret") {
        expect(resource.Properties.KmsKeyId).toBeUndefined();
      }
    }
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
  });

  it("outputs app integration identifiers", () => {
    const template = synthesizeTemplate();

    for (const outputName of [
      "PatientUserPoolId",
      "PatientUserPoolClientId",
      "AppTableName",
      "ApiEndpoint",
      "StaticAssetsBucketName",
      "StaticWebDistributionDomainName",
      "StaticWebDistributionId",
      "WebhookQueueUrl",
      "WebhookQueueArn",
      "WebhookDeadLetterQueueUrl",
      "WebhookDeadLetterQueueArn",
      "ScheduledHeartbeatFunctionName",
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
    Environment?: {
      Variables?: Record<string, unknown>;
    };
    EvaluationPeriods?: number;
    FunctionName?: string;
    Handler?: string;
    InsufficientDataActions?: unknown;
    KmsKeyId?: string;
    KmsMasterKeyId?: string;
    MetricName?: string;
    Name?: string;
    Namespace?: string;
    OKActions?: unknown;
    Period?: number;
    PolicyDocument?: {
      Statement?: Array<Record<string, unknown>>;
    };
    QueueName?: string;
    RedrivePolicy?: {
      deadLetterTargetArn?: unknown;
      maxReceiveCount?: number;
    };
    SqsManagedSseEnabled?: boolean;
    SSESpecification?: {
      KMSMasterKeyId?: string;
      SSEEnabled?: boolean;
      SSEType?: string;
    };
    Runtime?: string;
    ScheduleExpression?: string;
    Statistic?: string;
    Threshold?: number;
    TreatMissingData?: string;
  };
};

const cloudFormationToken = "__CLOUDFORMATION_TOKEN__";

type DashboardMetricRow = unknown[];

type DashboardBody = {
  widgets: Array<{
    properties?: {
      metrics?: DashboardMetricRow[];
      title?: string;
    };
  }>;
};

function parseDashboardBody(value: unknown): DashboardBody {
  const rendered = renderDashboardBody(value);
  const parsed = JSON.parse(rendered) as DashboardBody;
  expect(Array.isArray(parsed.widgets)).toBe(true);
  return parsed;
}

function renderDashboardBody(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "Fn::Join" in value &&
    Array.isArray(value["Fn::Join"])
  ) {
    const [, parts] = value["Fn::Join"] as [unknown, unknown];
    if (Array.isArray(parts)) {
      return parts.map((part) => (
        typeof part === "string" ? part : cloudFormationToken
      )).join("");
    }
  }

  throw new Error("Dashboard body was not a string or Fn::Join");
}

function dashboardMetricsByTitle(body: DashboardBody) {
  const metrics = new Map<string, DashboardMetricRow[]>();
  for (const widget of body.widgets) {
    const title = widget.properties?.title;
    if (!title || !widget.properties?.metrics) {
      continue;
    }
    metrics.set(title, widget.properties.metrics);
  }
  return metrics;
}

function expectedDashboardCustomMetric(metricName: ExpectedCustomMetricName) {
  const contract = expectedCustomMetricContracts.find((contract) =>
    contract.metricName === metricName
  );
  if (!contract) {
    throw new Error(`Missing expected custom metric contract: ${metricName}`);
  }

  return [
    observabilityNamespace,
    contract.metricName,
    ...observabilityMetricDimensions.flatMap((dimension) => [
      dimension,
      contract.dimensions[dimension],
    ]),
    { stat: contract.statistic },
  ];
}

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
  "apoth-staging-scheduled-heartbeat-errors",
] as const;

const expectedCustomMetricNames = observabilityMetricNames;

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
  {
    AlarmName: "apoth-staging-scheduled-heartbeat-errors",
    MetricName: "Errors",
    Namespace: "AWS/Lambda",
    Threshold: 0,
    ComparisonOperator: "GreaterThanThreshold",
    EvaluationPeriods: 1,
    DatapointsToAlarm: 1,
    Period: 300,
    Statistic: "Sum",
    TreatMissingData: "notBreaching",
    Dimensions: Match.arrayWith([
      {
        Name: "FunctionName",
        Value: Match.anyValue(),
      },
    ]),
  },
] as const;

const allowedCustomMetricDimensions = observabilityMetricDimensions;

type ExpectedCustomMetricName = ObservabilityMetricName;

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
  dimensions: Record<ObservabilityMetricDimension, string>;
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
