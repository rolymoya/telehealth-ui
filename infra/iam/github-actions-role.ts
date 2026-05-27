import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface GitHubActionsRoleProps {
  /** 12-digit AWS account ID where the OIDC provider lives */
  readonly accountId: string;
}

/**
 * OIDC-based deploy role for GitHub Actions.
 * No long-lived access keys — the workflow exchanges a GitHub OIDC token for
 * short-lived AWS credentials via STS AssumeRoleWithWebIdentity.
 *
 * Trust is scoped to the exact repo and main branch only. Wildcards are
 * deliberately excluded to prevent privilege escalation from sibling repos.
 */
export class GitHubActionsRole extends Construct {
  readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: GitHubActionsRoleProps) {
    super(scope, id);

    if (!/^\d{12}$/.test(props.accountId)) {
      throw new Error(
        `GitHubActionsRoleProps.accountId must be a 12-digit AWS account ID, got: '${props.accountId}'`,
      );
    }

    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GitHubOidcProvider',
      `arn:aws:iam::${props.accountId}:oidc-provider/token.actions.githubusercontent.com`,
    );

    this.deployRole = new iam.Role(this, 'Role', {
      assumedBy: new iam.WebIdentityPrincipal(
        provider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub':
              'repo:rolymoya/telehealth-ui:ref:refs/heads/main',
          },
        },
      ),
      roleName: 'apoth-gha-deploy',
      description:
        'GitHub Actions OIDC deploy role — scoped to rolymoya/telehealth-ui main branch',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // CloudFormation stack management — scoped to apoth-* stacks
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CdkCloudFormation',
        actions: [
          'cloudformation:CreateStack',
          'cloudformation:UpdateStack',
          'cloudformation:DeleteStack',
          'cloudformation:DescribeStacks',
          'cloudformation:DescribeStackEvents',
          'cloudformation:GetTemplate',
          'cloudformation:ValidateTemplate',
        ],
        resources: [
          `arn:aws:cloudformation:*:${props.accountId}:stack/apoth-*/*`,
          `arn:aws:cloudformation:*:${props.accountId}:stack/CDKToolkit/*`,
        ],
      }),
    );

    // CDK bootstrap role assumption — scoped to standard CDK bootstrap role name patterns
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CdkBootstrapAssume',
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:aws:iam::${props.accountId}:role/cdk-*-deploy-role-*`,
          `arn:aws:iam::${props.accountId}:role/cdk-*-file-publishing-role-*`,
          `arn:aws:iam::${props.accountId}:role/cdk-*-image-publishing-role-*`,
          `arn:aws:iam::${props.accountId}:role/cdk-*-lookup-role-*`,
        ],
      }),
    );

    // ECR auth token — must be on * (account-level API, no resource support)
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'EcrAuth',
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      }),
    );

    // ECR image push — scoped to apoth-* repositories
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'EcrPush',
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:InitiateLayerUpload',
          'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload',
          'ecr:PutImage',
        ],
        resources: [`arn:aws:ecr:*:${props.accountId}:repository/apoth-*`],
      }),
    );

    // App Runner service update (rolling deploy)
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AppRunnerDeploy',
        actions: ['apprunner:UpdateService', 'apprunner:DescribeService'],
        resources: ['arn:aws:apprunner:*:*:service/apoth-*'],
      }),
    );

    // S3 sync for static assets
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AssetSync',
        actions: [
          's3:PutObject',
          's3:DeleteObject',
          's3:GetObject',
          's3:ListBucket',
        ],
        resources: [
          'arn:aws:s3:::apoth-assets-*',
          'arn:aws:s3:::apoth-assets-*/*',
        ],
      }),
    );
  }
}
