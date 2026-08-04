import { RemovalPolicy, type Environment } from "aws-cdk-lib";
import { RetentionDays } from "aws-cdk-lib/aws-logs";

export type StageName = "staging" | "production";

export type SiteDomainConfig = {
  primaryDomainName: string;
  alternateDomainNames: string[];
};

export type StageConfig = {
  stage: StageName;
  checkoutSignup: {
    enabled: boolean;
    integrationIdentifier: string;
    weightCatalogId: string;
  };
  region?: string;
  removalPolicy: RemovalPolicy;
  logRetention: RetentionDays;
  deletionProtection: boolean;
  allowedOrigins: string[];
  siteDomain: SiteDomainConfig | null;
  authEmailDomain: string;
  authEmailFromAddress: string;
  mdiMode: "live" | "synthetic";
  mdiQuestionnaireId: string;
  checkoutUiMode: "custom" | "hosted";
  stripePublishableKey: string | null;
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
  const siteDomain: SiteDomainConfig = isProduction
    ? {
        primaryDomainName: "apothhealth.com",
        alternateDomainNames: ["www.apothhealth.com"],
      }
    : {
        primaryDomainName: "staging.apothhealth.com",
        alternateDomainNames: [],
      };

  return {
    stage,
    checkoutSignup: isProduction
      ? {
          enabled: false,
          integrationIdentifier: "",
          weightCatalogId: "",
        }
      : {
          enabled: true,
          integrationIdentifier: "apoth_checkout_hprmzkta",
          weightCatalogId: "catalog_weight_staging_v1",
        },
    removalPolicy: isProduction ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    logRetention: isProduction ? RetentionDays.ONE_MONTH : RetentionDays.ONE_WEEK,
    deletionProtection: isProduction,
    allowedOrigins: [
      ...[siteDomain.primaryDomainName, ...siteDomain.alternateDomainNames].map(
        (domainName) => `https://${domainName}`,
      ),
      ...(isProduction ? [] : ["http://localhost:3000"]),
    ],
    siteDomain,
    authEmailDomain: "apothhealth.com",
    authEmailFromAddress: "contact@apothhealth.com",
    mdiMode: resolveMdiMode(stage),
    mdiQuestionnaireId: process.env.APOTH_MDI_QUESTIONNAIRE_ID ??
      "mdi_questionnaire_launch",
    checkoutUiMode: resolveCheckoutUiMode(stage),
    stripePublishableKey: resolveStripePublishableKey(stage),
    tags: {
      "apoth:app": "telehealth-ui",
      "apoth:stage": stage,
      "apoth:managed-by": "cdk",
      "apoth:data-class": "thin-phi-linkage",
    },
  };
}

function resolveCheckoutUiMode(stage: StageName): "custom" | "hosted" {
  const configured = process.env.APOTH_CHECKOUT_UI_MODE?.trim();
  if (configured && configured !== "custom" && configured !== "hosted") {
    throw new Error("APOTH_CHECKOUT_UI_MODE must be custom or hosted");
  }
  const mode: "custom" | "hosted" = configured === "custom" ||
      configured === "hosted"
    ? configured
    : stage === "production" ? "hosted" : "custom";
  if (
    stage === "production" &&
    mode === "custom" &&
    process.env.APOTH_ALLOW_PRODUCTION_CUSTOM_CHECKOUT !== "true"
  ) {
    throw new Error(
      "Production custom checkout requires APOTH_ALLOW_PRODUCTION_CUSTOM_CHECKOUT=true",
    );
  }
  return mode;
}

function resolveStripePublishableKey(stage: StageName) {
  const key = process.env.APOTH_STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ||
    null;
  if (!key) {
    return null;
  }
  const expectedPrefix = stage === "production" ? "pk_live_" : "pk_test_";
  if (!key.startsWith(expectedPrefix)) {
    throw new Error(
      `${stage} Stripe publishable key must start with ${expectedPrefix}`,
    );
  }
  return key;
}

function resolveMdiMode(stage: StageName): "live" | "synthetic" {
  const configured = process.env.APOTH_MDI_MODE?.trim();
  if (configured === "live" || configured === "synthetic") {
    if (stage === "production" && configured === "synthetic") {
      throw new Error("Production MDI mode must be live");
    }
    return configured;
  }
  if (configured) {
    throw new Error("APOTH_MDI_MODE must be live or synthetic");
  }
  return stage === "production" ? "live" : "synthetic";
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
