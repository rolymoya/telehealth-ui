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
    }
  });

  it("outputs security baseline identifiers", () => {
    const template = synthesizeTemplate();

    for (const outputName of [
      "CloudTrailName",
      "CloudTrailLogBucketName",
      "GuardDutyDetectorId",
    ]) {
      template.hasOutput(outputName, {});
    }
  });
});
