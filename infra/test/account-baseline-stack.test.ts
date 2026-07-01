import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { AccountBaselineStack } from "../src/account-baseline-stack";
import { getStageConfig, type StageName } from "../src/config";

function synthesizeTemplate(stage: StageName = "staging") {
  const app = new cdk.App();
  const stack = new AccountBaselineStack(app, `Test-${stage}`, {
    config: getStageConfig(stage),
    env: { account: "111111111111", region: "us-east-1" },
  });

  return Template.fromStack(stack);
}

describe("AccountBaselineStack", () => {
  it("creates a lean account security baseline", () => {
    const template = synthesizeTemplate();

    template.resourceCountIs("AWS::S3::Bucket", 1);
    template.resourceCountIs("AWS::CloudTrail::Trail", 1);
    template.resourceCountIs("AWS::GuardDuty::Detector", 1);
    template.resourceCountIs("AWS::IAM::OIDCProvider", 1);
    template.resourceCountIs("AWS::IAM::Role", 1);
    template.resourceCountIs("AWS::IAM::AccessKey", 0);
    template.resourceCountIs("AWS::IAM::User", 0);
    template.resourceCountIs("AWS::SecurityHub::Hub", 0);
    template.resourceCountIs("AWS::EC2::VPC", 0);
  });

  it("configures CloudTrail management events with retained S3 logs", () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties("AWS::CloudTrail::Trail", {
      TrailName: "apoth-staging-management-events",
      EnableLogFileValidation: true,
      IncludeGlobalServiceEvents: true,
      IsMultiRegionTrail: true,
      IsLogging: true,
      EventSelectors: Match.arrayWith([
        Match.objectLike({
          IncludeManagementEvents: true,
          ReadWriteType: "All",
        }),
      ]),
    });

    template.hasResource("AWS::S3::Bucket", {
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
    });

    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: "AES256",
            },
          },
        ],
      },
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            Id: "TransitionCloudTrailLogs",
            Status: "Enabled",
            Transitions: Match.arrayWith([
              {
                StorageClass: "STANDARD_IA",
                TransitionInDays: 90,
              },
            ]),
          }),
        ]),
      },
      OwnershipControls: Match.absent(),
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      VersioningConfiguration: {
        Status: "Enabled",
      },
    });

    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "s3:*",
            Condition: {
              Bool: {
                "aws:SecureTransport": "false",
              },
            },
            Effect: "Deny",
            Principal: {
              AWS: "*",
            },
          }),
          Match.objectLike({
            Action: "s3:PutObject",
            Effect: "Allow",
            Principal: {
              Service: "cloudtrail.amazonaws.com",
            },
          }),
        ]),
      },
    });
  });

  it("enables GuardDuty in the target region", () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties("AWS::GuardDuty::Detector", {
      Enable: true,
      FindingPublishingFrequency: "FIFTEEN_MINUTES",
    });
  });

  it("creates a GitHub Actions OIDC deploy role restricted to the main branch", () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties("AWS::IAM::OIDCProvider", {
      Url: "https://token.actions.githubusercontent.com",
      ClientIdList: ["sts.amazonaws.com"],
    });

    template.hasResourceProperties("AWS::IAM::Role", {
      RoleName: "apoth-staging-github-oidc-cdk-deploy",
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: {
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                "token.actions.githubusercontent.com:sub":
                  "repo:rolymoya/telehealth-ui:ref:refs/heads/main",
              },
            },
            Effect: "Allow",
          }),
        ]),
      },
    });

    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "sts:AssumeRole",
            Effect: "Allow",
          }),
          Match.objectLike({
            Action: [
              "cloudformation:DescribeStacks",
              "ssm:GetParameter",
            ],
            Effect: "Allow",
          }),
          Match.objectLike({
            Action: [
              "s3:GetBucketLocation",
              "s3:ListBucket",
            ],
            Effect: "Allow",
          }),
          Match.objectLike({
            Action: [
              "s3:DeleteObject",
              "s3:GetObject",
              "s3:PutObject",
            ],
            Effect: "Allow",
          }),
          Match.objectLike({
            Action: [
              "cloudfront:CreateInvalidation",
              "cloudfront:GetInvalidation",
            ],
            Effect: "Allow",
          }),
        ]),
      },
    });

    const policies = Object.values(
      template.findResources("AWS::IAM::Policy"),
    );
    const renderedPolicy = JSON.stringify(policies);
    for (const bootstrapRole of [
      "cdk-hnb659fds-deploy-role-",
      "cdk-hnb659fds-file-publishing-role-",
      "cdk-hnb659fds-image-publishing-role-",
      "cdk-hnb659fds-lookup-role-",
      "apoth-staging-static-assets",
      "apoth-staging-patient-app",
      "cloudfront",
      "distribution/*",
      "stack/Apoth-staging-ServerlessPlatform/*",
      "stack/CDKToolkit/*",
      "parameter/cdk-bootstrap/hnb659fds/version",
    ]) {
      expect(renderedPolicy).toContain(bootstrapRole);
    }
    expect(renderedPolicy).not.toContain("AdministratorAccess");
    expect(renderedPolicy).not.toContain('"Action":"*"');
  });

  it("defines a launch-scoped CDK CloudFormation execution policy", () => {
    const template = synthesizeTemplate();

    template.hasResourceProperties("AWS::IAM::ManagedPolicy", {
      ManagedPolicyName: "apoth-staging-cdk-cloudformation-execution-launch",
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              "apigateway:*",
              "cognito-idp:*",
              "dynamodb:*",
              "lambda:*",
              "secretsmanager:*",
              "sqs:*",
            ]),
            Effect: "Allow",
          }),
          Match.objectLike({
            Action: Match.arrayWith([
              "iam:CreateRole",
              "iam:PassRole",
              "iam:PutRolePolicy",
            ]),
            Effect: "Allow",
          }),
        ]),
      },
    });

    const policies = Object.values(
      template.findResources("AWS::IAM::ManagedPolicy"),
    );
    const renderedPolicy = JSON.stringify(policies);
    expect(renderedPolicy).not.toContain("AdministratorAccess");
    expect(renderedPolicy).not.toContain('"Action":"*"');
    expect(renderedPolicy).toContain("role/apoth-staging-*");
    expect(renderedPolicy).toContain("role/Apoth-staging-*");
  });

  it("applies Apoth environment tags", () => {
    const template = synthesizeTemplate();

    for (const tag of [
      { Key: "apoth:app", Value: "telehealth-ui" },
      { Key: "apoth:stage", Value: "staging" },
      { Key: "apoth:managed-by", Value: "cdk" },
      { Key: "apoth:data-class", Value: "thin-phi-linkage" },
    ]) {
      template.hasResourceProperties("AWS::CloudTrail::Trail", {
        Tags: Match.arrayWith([tag]),
      });
      template.hasResourceProperties("AWS::GuardDuty::Detector", {
        Tags: Match.arrayWith([tag]),
      });
      template.hasResourceProperties("AWS::S3::Bucket", {
        Tags: Match.arrayWith([tag]),
      });
      template.hasResourceProperties("AWS::IAM::Role", {
        Tags: Match.arrayWith([tag]),
      });
    }
  });

  it("outputs security baseline identifiers", () => {
    const template = synthesizeTemplate();

    for (const outputName of [
      "CloudTrailName",
      "CloudTrailLogBucketName",
      "CdkCloudFormationExecutionPolicyArn",
      "GuardDutyDetectorId",
      "GithubActionsOidcProviderArn",
      "GithubActionsDeployRoleArn",
      "GithubActionsDeployTrustSubject",
    ]) {
      template.hasOutput(outputName, {});
    }
  });
});
