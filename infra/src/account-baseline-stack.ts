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
  OidcProviderNative,
  OpenIdConnectPrincipal,
  PolicyStatement,
  Role,
} from "aws-cdk-lib/aws-iam";
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

    const githubProvider = new OidcProviderNative(this, "GithubActionsOidcProvider", {
      url: githubActionsOidcProviderUrl,
      clientIds: [githubActionsOidcAudience],
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const githubTrustSubject = githubActionsTrustSubject();
    const githubDeployRole = new Role(this, "GithubActionsDeployRole", {
      roleName: `apoth-${props.config.stage}-github-oidc-cdk-deploy`,
      assumedBy: new OpenIdConnectPrincipal(githubProvider, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": githubActionsOidcAudience,
          "token.actions.githubusercontent.com:sub": githubTrustSubject,
        },
      }),
      description: [
        "GitHub Actions OIDC role for Apoth CDK deploys.",
        "Trust is restricted to rolymoya/telehealth-ui main branch.",
      ].join(" "),
    });
    githubDeployRole.addToPolicy(new PolicyStatement({
      actions: ["sts:AssumeRole"],
      resources: cdkBootstrapRoleArns(this.account, this.region, this.partition),
    }));
    githubDeployRole.addToPolicy(new PolicyStatement({
      actions: [
        "cloudformation:DescribeStacks",
        "ssm:GetParameter",
      ],
      resources: [
        `arn:${this.partition}:cloudformation:${this.region}:${this.account}:stack/CDKToolkit/*`,
        `arn:${this.partition}:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/hnb659fds/version`,
      ],
    }));

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
    new CfnOutput(this, "GithubActionsOidcProviderArn", {
      value: githubProvider.oidcProviderArn,
      description: "IAM OIDC provider ARN for GitHub Actions.",
    });
    new CfnOutput(this, "GithubActionsDeployRoleArn", {
      value: githubDeployRole.roleArn,
      description: "IAM role ARN assumed by GitHub Actions through OIDC.",
    });
    new CfnOutput(this, "GithubActionsDeployTrustSubject", {
      value: githubTrustSubject,
      description: "GitHub OIDC subject allowed to assume the deploy role.",
    });
  }
}

function cdkBootstrapRoleArns(account: string, region: string, partition: string) {
  return [
    "deploy",
    "file-publishing",
    "image-publishing",
    "lookup",
  ].map((role) =>
    `arn:${partition}:iam::${account}:role/cdk-hnb659fds-${role}-role-${account}-${region}`
  );
}

function accountTrailName(stage: StageConfig["stage"]) {
  return `apoth-${stage}-management-events`;
}

function githubActionsTrustSubject() {
  return "repo:rolymoya/telehealth-ui:ref:refs/heads/main";
}

const githubActionsOidcProviderUrl = "https://token.actions.githubusercontent.com";
const githubActionsOidcAudience = "sts.amazonaws.com";
