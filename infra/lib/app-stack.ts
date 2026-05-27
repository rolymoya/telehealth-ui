import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AppRunnerRole } from '../iam/app-runner-role';
import type { AppConfig } from './config';
import type { NetworkStack } from './network-stack';
import type { DataStack } from './data-stack';

export interface AppStackProps extends StackProps {
  readonly config: AppConfig;
  readonly networkStack: NetworkStack;
  readonly dataStack: DataStack;
}

export class AppStack extends Stack {
  readonly serviceUrl: string;
  readonly ecrRepo: ecr.Repository;

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);
    const { config } = props;

    // ECR repository — image scanning on push; lifecycle keeps last 10 tagged
    this.ecrRepo = new ecr.Repository(this, 'EcrRepo', {
      repositoryName: 'apoth-app',
      imageScanOnPush: true,
      lifecycleRules: [
        { maxImageCount: 10, tagStatus: ecr.TagStatus.TAGGED },
        { maxImageAge: { toDays: () => 7 } as never, tagStatus: ecr.TagStatus.UNTAGGED },
      ],
    });

    // Instance role attached to the App Runner tasks
    const appRunnerRole = new AppRunnerRole(this, 'AppRunnerRole', {
      kmsKeyArn: config.kmsKeyArn,
    });

    // Access role — allows App Runner to pull images from ECR during builds
    const accessRole = new iam.Role(this, 'AppRunnerAccessRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      roleName: 'apoth-app-runner-access',
      description: 'App Runner build role — ECR pull access',
    });
    accessRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSAppRunnerServicePolicyForECRAccess'),
    );

    // App Runner service stub — placeholder image replaced by CI pipeline
    const service = new apprunner.CfnService(this, 'AppRunnerService', {
      serviceName: `apoth-${config.env}-app`,
      sourceConfiguration: {
        imageRepository: {
          imageIdentifier: `${this.ecrRepo.repositoryUri}:latest`,
          imageRepositoryType: 'ECR',
          imageConfiguration: {
            port: '8080',
          },
        },
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        autoDeploymentsEnabled: false,
      },
      instanceConfiguration: {
        instanceRoleArn: appRunnerRole.taskRole.roleArn,
        cpu: config.env === 'staging' ? '256' : '1024',
        memory: config.env === 'staging' ? '512' : '2048',
      },
      networkConfiguration: {
        egressConfiguration: {
          egressType: 'VPC',
          vpcConnectorArn: props.networkStack.vpcConnectorArn,
        },
      },
      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/health',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
      autoScalingConfigurationArn: undefined,
      tags: [
        { key: 'Project', value: 'apoth' },
        { key: 'Env', value: config.env },
      ],
    });

    this.serviceUrl = service.attrServiceUrl;

    new CfnOutput(this, 'ServiceUrl', {
      value: `https://${this.serviceUrl}`,
      description: 'App Runner service URL',
    });
  }
}
