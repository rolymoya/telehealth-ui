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
  ManagedPolicy,
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
    const cdkExecutionPolicy = new ManagedPolicy(
      this,
      "CdkCloudFormationExecutionPolicy",
      {
        managedPolicyName: cdkExecutionPolicyName(props.config.stage),
        description: [
          "Launch-scoped policy for the CDK bootstrap CloudFormation execution role.",
          "Use this instead of a broad AWS-managed admin policy when bootstrapping Apoth deploys.",
        ].join(" "),
        statements: cdkExecutionPolicyStatements(
          props.config.stage,
          this.account,
          this.region,
          this.partition,
        ),
      },
    );

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
    new CfnOutput(this, "CdkCloudFormationExecutionPolicyArn", {
      value: cdkExecutionPolicy.managedPolicyArn,
      description: "Managed policy ARN for CDK bootstrap CloudFormation execution.",
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

function cdkExecutionPolicyName(stage: StageConfig["stage"]) {
  return `apoth-${stage}-cdk-cloudformation-execution-launch`;
}

function cdkExecutionPolicyStatements(
  stage: StageConfig["stage"],
  account: string,
  region: string,
  partition: string,
) {
  const stagePrefix = `apoth-${stage}`;
  const stackPrefix = `Apoth-${stage}`;

  return [
    new PolicyStatement({
      actions: [
        "cloudformation:Describe*",
        "cloudformation:Get*",
        "cloudformation:List*",
      ],
      resources: [
        `arn:${partition}:cloudformation:${region}:${account}:stack/${stackPrefix}-*/*`,
        `arn:${partition}:cloudformation:${region}:${account}:stack/CDKToolkit/*`,
      ],
    }),
    new PolicyStatement({
      actions: [
        "apigateway:*",
        "cloudfront:*",
        "cloudtrail:*",
        "cloudwatch:DeleteAlarms",
        "cloudwatch:DeleteDashboards",
        "cloudwatch:DescribeAlarms",
        "cloudwatch:GetDashboard",
        "cloudwatch:ListDashboards",
        "cloudwatch:PutDashboard",
        "cloudwatch:PutMetricAlarm",
        "cognito-idp:*",
        "dynamodb:*",
        "events:*",
        "guardduty:*",
        "lambda:*",
        "logs:*",
        "s3:*",
        "secretsmanager:*",
        "sqs:*",
      ],
      resources: ["*"],
    }),
    new PolicyStatement({
      actions: ["ssm:GetParameter"],
      resources: [
        `arn:${partition}:ssm:${region}:${account}:parameter/cdk-bootstrap/hnb659fds/version`,
      ],
    }),
    new PolicyStatement({
      actions: [
        "iam:AttachRolePolicy",
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:DeleteRolePolicy",
        "iam:DetachRolePolicy",
        "iam:GetRole",
        "iam:GetRolePolicy",
        "iam:PassRole",
        "iam:PutRolePolicy",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:UpdateAssumeRolePolicy",
      ],
      resources: [
        `arn:${partition}:iam::${account}:role/${stagePrefix}-*`,
        `arn:${partition}:iam::${account}:role/${stackPrefix}-*`,
      ],
    }),
    new PolicyStatement({
      actions: [
        "iam:CreateOpenIDConnectProvider",
        "iam:DeleteOpenIDConnectProvider",
        "iam:GetOpenIDConnectProvider",
        "iam:TagOpenIDConnectProvider",
        "iam:UntagOpenIDConnectProvider",
        "iam:UpdateOpenIDConnectProviderThumbprint",
      ],
      resources: [
        `arn:${partition}:iam::${account}:oidc-provider/token.actions.githubusercontent.com`,
      ],
    }),
    new PolicyStatement({
      actions: [
        "iam:CreatePolicy",
        "iam:CreatePolicyVersion",
        "iam:DeletePolicy",
        "iam:DeletePolicyVersion",
        "iam:GetPolicy",
        "iam:GetPolicyVersion",
        "iam:ListPolicyVersions",
        "iam:SetDefaultPolicyVersion",
        "iam:TagPolicy",
        "iam:UntagPolicy",
      ],
      resources: [
        `arn:${partition}:iam::${account}:policy/${stagePrefix}-*`,
      ],
    }),
  ];
}

function accountTrailName(stage: StageConfig["stage"]) {
  return `apoth-${stage}-management-events`;
}

function githubActionsTrustSubject() {
  return "repo:rolymoya/telehealth-ui:ref:refs/heads/main";
}

const githubActionsOidcProviderUrl = "https://token.actions.githubusercontent.com";
const githubActionsOidcAudience = "sts.amazonaws.com";
