import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  Tags,
  type StackProps,
} from "aws-cdk-lib";
import { ReadWriteType, Trail } from "aws-cdk-lib/aws-cloudtrail";
import { CfnDetector } from "aws-cdk-lib/aws-guardduty";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  BucketNamespace,
  StorageClass,
} from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import type { StageConfig } from "./config";

export type AccountBaselineStackProps = StackProps & {
  config: StageConfig;
};

export class AccountBaselineStack extends Stack {
  constructor(scope: Construct, id: string, props: AccountBaselineStackProps) {
    super(scope, id, props);

    for (const [key, value] of Object.entries(props.config.tags)) {
      Tags.of(this).add(key, value);
    }

    const cloudTrailLogBucket = new Bucket(this, "CloudTrailLogBucket", {
      bucketNamePrefix: `apoth-${props.config.stage}-cloudtrail-logs`,
      bucketNamespace: BucketNamespace.ACCOUNT_REGIONAL,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: "TransitionCloudTrailLogs",
          enabled: true,
          transitions: [
            {
              storageClass: StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(90),
            },
          ],
        },
      ],
    });

    const cloudTrail = new Trail(this, "AccountManagementTrail", {
      trailName: accountTrailName(props.config.stage),
      bucket: cloudTrailLogBucket,
      enableFileValidation: true,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: true,
      managementEvents: ReadWriteType.ALL,
      sendToCloudWatchLogs: false,
    });

    const guardDutyDetector = new CfnDetector(this, "GuardDutyDetector", {
      enable: true,
      findingPublishingFrequency: "FIFTEEN_MINUTES",
    });

    new CfnOutput(this, "CloudTrailName", {
      value: accountTrailName(props.config.stage),
      description: "Name of the CloudTrail management-events trail.",
    });
    new CfnOutput(this, "CloudTrailLogBucketName", {
      value: cloudTrailLogBucket.bucketName,
      description: "S3 bucket that retains CloudTrail management-event logs.",
    });
    new CfnOutput(this, "GuardDutyDetectorId", {
      value: guardDutyDetector.attrId,
      description: "GuardDuty detector ID for the account and region.",
    });
  }
}

function accountTrailName(stage: StageConfig["stage"]) {
  return `apoth-${stage}-management-events`;
}
