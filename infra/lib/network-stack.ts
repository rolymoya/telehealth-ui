import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import type { AppConfig } from './config';

export interface NetworkStackProps extends StackProps {
  readonly config: AppConfig;
}

export class NetworkStack extends Stack {
  readonly vpc: ec2.Vpc;
  readonly privateSubnets: ec2.ISubnet[];
  readonly isolatedSubnets: ec2.ISubnet[];
  readonly vpcConnectorArn: string;
  readonly appRunnerConnectorSg: ec2.SecurityGroup;
  readonly workerSg: ec2.SecurityGroup;
  readonly rdsSg: ec2.SecurityGroup;
  readonly redisSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);
    const { config } = props;

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: config.natGateways,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    this.privateSubnets = this.vpc.selectSubnets({ subnetGroupName: 'private' }).subnets;
    this.isolatedSubnets = this.vpc.selectSubnets({ subnetGroupName: 'isolated' }).subnets;

    // VPC Flow Logs → CloudWatch
    const flowLogGroup = new logs.LogGroup(this, 'VpcFlowLogGroup', {
      logGroupName: `/apoth/${config.env}/vpc-flow`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    new ec2.FlowLog(this, 'VpcFlowLog', {
      resourceType: ec2.FlowLogResourceType.fromVpc(this.vpc),
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup),
    });

    // Security groups — allowAllOutbound: false on database SGs to prevent
    // any egress from isolated subnets
    this.rdsSg = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc: this.vpc,
      description: 'RDS Postgres — ingress port 5432 from App Runner connector and ECS worker only',
      allowAllOutbound: false,
    });

    this.redisSg = new ec2.SecurityGroup(this, 'RedisSg', {
      vpc: this.vpc,
      description: 'ElastiCache Redis — ingress port 6379 from App Runner connector and ECS worker only',
      allowAllOutbound: false,
    });

    this.appRunnerConnectorSg = new ec2.SecurityGroup(this, 'AppRunnerConnectorSg', {
      vpc: this.vpc,
      description: 'VpcConnector for App Runner — egress to RDS and Redis only',
      allowAllOutbound: false,
    });

    this.workerSg = new ec2.SecurityGroup(this, 'WorkerSg', {
      vpc: this.vpc,
      description: 'ECS Fargate worker — egress to RDS, Redis, and AWS services via VPC endpoints',
      allowAllOutbound: false,
    });

    // Ingress: RDS port 5432 from connector and worker
    this.rdsSg.addIngressRule(this.appRunnerConnectorSg, ec2.Port.tcp(5432), 'App Runner connector');
    this.rdsSg.addIngressRule(this.workerSg, ec2.Port.tcp(5432), 'ECS worker');

    // Ingress: Redis port 6379 from connector and worker
    this.redisSg.addIngressRule(this.appRunnerConnectorSg, ec2.Port.tcp(6379), 'App Runner connector');
    this.redisSg.addIngressRule(this.workerSg, ec2.Port.tcp(6379), 'ECS worker');

    // Egress: connector → RDS and Redis
    this.appRunnerConnectorSg.addEgressRule(this.rdsSg, ec2.Port.tcp(5432), 'RDS Postgres');
    this.appRunnerConnectorSg.addEgressRule(this.redisSg, ec2.Port.tcp(6379), 'Redis');

    // Egress: worker → RDS, Redis, and HTTPS for VPC interface endpoints
    this.workerSg.addEgressRule(this.rdsSg, ec2.Port.tcp(5432), 'RDS Postgres');
    this.workerSg.addEgressRule(this.redisSg, ec2.Port.tcp(6379), 'Redis');
    this.workerSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS to VPC interface endpoints');

    // Security group for VPC interface endpoints — allow HTTPS from within the VPC
    const endpointSg = new ec2.SecurityGroup(this, 'VpcEndpointSg', {
      vpc: this.vpc,
      description: 'VPC interface endpoints — HTTPS ingress from within VPC',
      allowAllOutbound: false,
    });
    endpointSg.addIngressRule(ec2.Peer.ipv4(this.vpc.vpcCidrBlock), ec2.Port.tcp(443), 'VPC CIDR HTTPS');

    // Account-restrictive endpoint policy — prevent cross-account access via endpoints
    const endpointPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          principals: [new iam.AccountPrincipal(this.account)],
          actions: ['*'],
          resources: ['*'],
        }),
      ],
    });

    // Gateway endpoints (no SG, no interface endpoint charges)
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // Interface endpoints: keep PHI-adjacent traffic off the public internet
    const interfaceEndpoints: Array<[string, ec2.InterfaceVpcEndpointAwsService]> = [
      ['SecretsMgr', ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER],
      ['Kms', ec2.InterfaceVpcEndpointAwsService.KMS],
      ['Sqs', ec2.InterfaceVpcEndpointAwsService.SQS],
      ['EcrApi', ec2.InterfaceVpcEndpointAwsService.ECR],
      ['EcrDkr', ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER],
      ['Logs', ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS],
      ['Monitoring', ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_MONITORING],
    ];

    for (const [endpointId, service] of interfaceEndpoints) {
      const endpoint = new ec2.InterfaceVpcEndpoint(this, `${endpointId}Endpoint`, {
        vpc: this.vpc,
        service,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [endpointSg],
        privateDnsEnabled: true,
        open: false,
      });
      // Apply account-restrictive policy via L1 to prevent cross-account access
      (endpoint.node.defaultChild as ec2.CfnVPCEndpoint).policyDocument =
        endpointPolicy.toJSON();
    }

    // VpcConnector — attaches App Runner to the private subnets
    const connector = new apprunner.CfnVpcConnector(this, 'VpcConnector', {
      subnets: this.privateSubnets.map((s) => s.subnetId),
      securityGroups: [this.appRunnerConnectorSg.securityGroupId],
      vpcConnectorName: `apoth-${config.env}-connector`,
    });

    this.vpcConnectorArn = connector.attrVpcConnectorArn;
  }
}
