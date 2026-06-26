import { RemovalPolicy, type Environment } from "aws-cdk-lib";
import { RetentionDays } from "aws-cdk-lib/aws-logs";

export type StageName = "staging" | "production";

export type StageConfig = {
  stage: StageName;
  region?: string;
  removalPolicy: RemovalPolicy;
  logRetention: RetentionDays;
  deletionProtection: boolean;
  allowedOrigins: string[];
  authEmailDomain: string;
  authEmailFromAddress: string;
  mdiQuestionnaireId: string;
  tags: Record<string, string>;
};

export type DeployEnvironmentInput = {
  allowProductionSynth?: string;
  defaultAccount?: string;
  defaultRegion?: string;
  productionAccountId?: string;
};

export function getStageConfig(stage: string): StageConfig {
  if (stage !== "staging" && stage !== "production") {
    throw new Error(`Unsupported stage: ${stage}`);
  }

  const isProduction = stage === "production";

  return {
    stage,
    removalPolicy: isProduction ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    logRetention: isProduction ? RetentionDays.ONE_MONTH : RetentionDays.ONE_WEEK,
    deletionProtection: isProduction,
    allowedOrigins: isProduction
      ? ["https://apoth.health"]
      : ["http://localhost:3000"],
    authEmailDomain: "apothhealth.com",
    authEmailFromAddress: "contact@apothhealth.com",
    mdiQuestionnaireId: process.env.APOTH_MDI_QUESTIONNAIRE_ID ??
      "mdi_questionnaire_launch",
    tags: {
      "apoth:app": "telehealth-ui",
      "apoth:stage": stage,
      "apoth:managed-by": "cdk",
      "apoth:data-class": "thin-phi-linkage",
    },
  };
}

export function resolveDeployEnvironment(
  config: StageConfig,
  env: DeployEnvironmentInput,
): Environment {
  if (config.stage !== "production") {
    return {
      account: env.defaultAccount,
      region: config.region ?? env.defaultRegion ?? "us-east-1",
    };
  }

  if (env.allowProductionSynth !== "true") {
    throw new Error("Production synth requires APOTH_ALLOW_PRODUCTION_SYNTH=true");
  }

  if (!env.productionAccountId) {
    throw new Error("Production synth requires APOTH_PRODUCTION_ACCOUNT_ID");
  }

  if (env.defaultAccount !== env.productionAccountId) {
    throw new Error("Production synth account does not match APOTH_PRODUCTION_ACCOUNT_ID");
  }

  const region = config.region ?? env.defaultRegion;
  if (!region) {
    throw new Error("Production synth requires CDK_DEFAULT_REGION or config.region");
  }

  return {
    account: env.defaultAccount,
    region,
  };
}
