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

export function getConfig(scope: Construct): AppConfig {
  const env = scope.node.tryGetContext('env') as AppEnv | undefined;
  if (env !== 'staging' && env !== 'prod') {
    throw new Error(`CDK context 'env' must be 'staging' or 'prod', got: '${String(env)}'`);
  }

  const envCtx = scope.node.tryGetContext(env) as Record<string, unknown> | undefined;
  if (!envCtx) {
    throw new Error(`CDK context block '${env}' is missing — add it to cdk.json or pass --context ${env}='{...}'`);
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
    account: String(envCtx['account'] ?? ''),
    region: String(envCtx['region'] ?? ''),
    natGateways: Number(envCtx['natGateways'] ?? 1),
    rdsMultiAz: Boolean(envCtx['rdsMultiAz'] ?? false),
    redisReplicas: Number(envCtx['redisReplicas'] ?? 0),
    kmsKeyArn,
  };
}
