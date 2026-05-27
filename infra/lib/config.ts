import { Construct } from 'constructs';

export type AppEnv = 'staging' | 'prod';

export interface AppConfig {
  readonly env: AppEnv;
  readonly account: string;
  readonly region: string;
  readonly natGateways: number;
  readonly rdsMultiAz: boolean;
  readonly redisReplicas: number;
  readonly kmsKeyArn: string;
}

const KMS_ARN_REGEX = /^arn:aws:kms:[a-z0-9-]+:\d{12}:key\/[a-f0-9-]{36}$/;
const ACCOUNT_REGEX = /^\d{12}$/;
const REGION_REGEX = /^[a-z]{2}-[a-z]+-\d+$/;

export function getConfig(scope: Construct): AppConfig {
  const env = scope.node.tryGetContext('env') as AppEnv | undefined;
  if (env !== 'staging' && env !== 'prod') {
    throw new Error(`CDK context 'env' must be 'staging' or 'prod', got: '${String(env)}'`);
  }

  const envCtx = scope.node.tryGetContext(env) as Record<string, unknown> | undefined;
  if (!envCtx) {
    throw new Error(`CDK context block '${env}' is missing — add it to cdk.json or pass --context ${env}='{...}'`);
  }

  const account = String(envCtx['account'] ?? '');
  if (!ACCOUNT_REGEX.test(account)) {
    throw new Error(
      `config.account for env '${env}' must be a 12-digit AWS account ID, got: '${account}'`,
    );
  }

  const region = String(envCtx['region'] ?? '');
  if (!REGION_REGEX.test(region)) {
    throw new Error(
      `config.region for env '${env}' must be a valid AWS region (e.g. us-east-1), got: '${region}'`,
    );
  }

  const natGateways = Number(envCtx['natGateways'] ?? 1);
  if (!Number.isInteger(natGateways) || natGateways < 0 || natGateways > 3) {
    throw new Error(
      `config.natGateways for env '${env}' must be an integer 0–3, got: '${String(envCtx['natGateways'])}'`,
    );
  }

  const redisReplicas = Number(envCtx['redisReplicas'] ?? 0);
  if (!Number.isInteger(redisReplicas) || redisReplicas < 0 || redisReplicas > 5) {
    throw new Error(
      `config.redisReplicas for env '${env}' must be an integer 0–5, got: '${String(envCtx['redisReplicas'])}'`,
    );
  }

  const kmsKeyArn = String(envCtx['kmsKeyArn'] ?? '');
  if (!KMS_ARN_REGEX.test(kmsKeyArn)) {
    throw new Error(
      `config.kmsKeyArn for env '${env}' must be a valid KMS CMK ARN ` +
        `(arn:aws:kms:<region>:<account>:key/<uuid>), got: '${kmsKeyArn}'`,
    );
  }

  return {
    env,
    account,
    region,
    natGateways,
    rdsMultiAz: Boolean(envCtx['rdsMultiAz'] ?? false),
    redisReplicas,
    kmsKeyArn,
  };
}
