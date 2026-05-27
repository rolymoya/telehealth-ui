import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { GitHubActionsRole } from '../iam/github-actions-role';
import type { AppConfig } from './config';

export interface IamStackProps extends StackProps {
  readonly config: AppConfig;
}

/**
 * Standalone IAM stack — decoupled from AppStack so that CI/CD role changes
 * do not trigger App Runner service updates.
 */
export class IamStack extends Stack {
  readonly gitHubActionsRoleArn: string;

  constructor(scope: Construct, id: string, props: IamStackProps) {
    super(scope, id, props);

    const githubRole = new GitHubActionsRole(this, 'GitHubActionsRole', {
      accountId: props.config.account,
    });

    this.gitHubActionsRoleArn = githubRole.deployRole.roleArn;
  }
}
