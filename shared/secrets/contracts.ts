export type RuntimeStage = "staging" | "production";

export type SecretKind = "mdiApi" | "stripeApi" | "appSigning";

export type SecretField = {
  name: string;
  description: string;
  confidential: boolean;
  required?: boolean;
};

export type SecretContract = {
  kind: SecretKind;
  nameSuffix: string;
  purpose: string;
  rotation: {
    owner: string;
    cadence: string;
    emergency: string;
    rollout: string;
    revocation: string;
  };
  fields: SecretField[];
};

export type SecretPayloadBase = {
  apothStage: RuntimeStage;
  secretKind: SecretKind;
  schemaVersion: 1;
};

export type MdiApiSecretPayload = SecretPayloadBase & {
  secretKind: "mdiApi";
  clientId: string;
  clientSecret: string;
  apiBaseUrl: string;
};

export type StripeApiSecretPayload = SecretPayloadBase & {
  secretKind: "stripeApi";
  secretKey: string;
  webhookSigningSecret: string;
  webhookSigningSecretPrevious?: string;
  webhookSigningSecretPreviousExpiresAt?: string;
};

export type AppSigningSecretPayload = SecretPayloadBase & {
  secretKind: "appSigning";
  signingSecret: string;
  signingSecretPrevious?: string;
  signingSecretPreviousExpiresAt?: string;
};

export type AppSecretPayload =
  | MdiApiSecretPayload
  | StripeApiSecretPayload
  | AppSigningSecretPayload;

export const fakeSecretPrefix = "fake_";

export const secretContracts = {
  mdiApi: {
    kind: "mdiApi",
    nameSuffix: "mdi/api",
    purpose: "MDI API client credentials",
    rotation: {
      owner: "Engineering with MDI account owner",
      cadence: "Rotate at least every 180 days or sooner if MDI requires it.",
      emergency: "Create replacement credentials in MDI, update the stage secret, deploy/restart consumers, then disable the old credentials.",
      rollout: "No dual-read expected for launch; coordinate a short maintenance window if MDI cannot support parallel credentials.",
      revocation: "Revoke old MDI credentials after successful health checks against the new credentials.",
    },
    fields: [
      {
        name: "apothStage",
        description: "Non-secret stage sentinel used to prevent cross-stage copies.",
        confidential: false,
      },
      {
        name: "secretKind",
        description: "Contract discriminator.",
        confidential: false,
      },
      {
        name: "schemaVersion",
        description: "Payload schema version.",
        confidential: false,
      },
      {
        name: "clientId",
        description: "MDI API client identifier.",
        confidential: true,
      },
      {
        name: "clientSecret",
        description: "MDI API client secret.",
        confidential: true,
      },
      {
        name: "apiBaseUrl",
        description: "MDI API base URL for this stage.",
        confidential: false,
      },
    ],
  },
  stripeApi: {
    kind: "stripeApi",
    nameSuffix: "stripe/api",
    purpose: "Stripe API key and webhook signing secret",
    rotation: {
      owner: "Engineering with Stripe account administrator",
      cadence: "Rotate API keys at least every 180 days and webhook signing secrets after endpoint changes or suspected exposure.",
      emergency: "Create a restricted replacement key and webhook secret, update the stage secret, deploy/restart consumers, then revoke exposed material.",
      rollout: "Publish the replacement as webhookSigningSecret, move the old value to webhookSigningSecretPrevious, set webhookSigningSecretPreviousExpiresAt to the overlap cutoff, then deploy/restart consumers.",
      revocation: "Revoke old API keys and remove previous webhook endpoint secrets after successful payment and webhook smoke tests plus the configured overlap cutoff.",
    },
    fields: [
      {
        name: "apothStage",
        description: "Non-secret stage sentinel used to prevent cross-stage copies.",
        confidential: false,
      },
      {
        name: "secretKind",
        description: "Contract discriminator.",
        confidential: false,
      },
      {
        name: "schemaVersion",
        description: "Payload schema version.",
        confidential: false,
      },
      {
        name: "secretKey",
        description: "Stripe secret API key.",
        confidential: true,
      },
      {
        name: "webhookSigningSecret",
        description: "Current Stripe webhook endpoint signing secret.",
        confidential: true,
      },
      {
        name: "webhookSigningSecretPrevious",
        description: "Previous Stripe webhook endpoint signing secret accepted only until the paired expiry.",
        confidential: true,
        required: false,
      },
      {
        name: "webhookSigningSecretPreviousExpiresAt",
        description: "ISO timestamp after which the previous Stripe webhook signing secret must not be accepted.",
        confidential: false,
        required: false,
      },
    ],
  },
  appSigning: {
    kind: "appSigning",
    nameSuffix: "app/signing",
    purpose: "Application-level signing material",
    rotation: {
      owner: "Engineering",
      cadence: "Rotate at least annually and after suspected exposure.",
      emergency: "Generate replacement signing material, update the stage secret, deploy/restart consumers, then invalidate old signatures when safe.",
      rollout: "Publish the replacement as signingSecret, move the old value to signingSecretPrevious, set signingSecretPreviousExpiresAt to the maximum token/callback lifetime cutoff, then deploy/restart consumers.",
      revocation: "Remove previous signing material after the configured overlap cutoff has elapsed.",
    },
    fields: [
      {
        name: "apothStage",
        description: "Non-secret stage sentinel used to prevent cross-stage copies.",
        confidential: false,
      },
      {
        name: "secretKind",
        description: "Contract discriminator.",
        confidential: false,
      },
      {
        name: "schemaVersion",
        description: "Payload schema version.",
        confidential: false,
      },
      {
        name: "signingSecret",
        description: "Current application signing secret.",
        confidential: true,
      },
      {
        name: "signingSecretPrevious",
        description: "Previous application signing secret accepted only until the paired expiry.",
        confidential: true,
        required: false,
      },
      {
        name: "signingSecretPreviousExpiresAt",
        description: "ISO timestamp after which the previous application signing secret must not be accepted.",
        confidential: false,
        required: false,
      },
    ],
  },
} satisfies Record<SecretKind, SecretContract>;

export function secretName(stage: RuntimeStage, kind: SecretKind) {
  return `/apoth/${stage}/${secretContracts[kind].nameSuffix}`;
}

export function secretPurposeTag(kind: SecretKind) {
  return secretContracts[kind].purpose;
}

export function secretTemplate(stage: RuntimeStage, kind: SecretKind) {
  return {
    apothStage: stage,
    secretKind: kind,
    schemaVersion: 1,
  } satisfies SecretPayloadBase;
}

export function placeholderSecretPayload(
  stage: RuntimeStage,
  kind: SecretKind,
): AppSecretPayload {
  const base = secretTemplate(stage, kind);

  switch (kind) {
    case "mdiApi":
      return {
        ...base,
        secretKind: "mdiApi",
        clientId: `${fakeSecretPrefix}mdi_client_id`,
        clientSecret: `${fakeSecretPrefix}mdi_client_secret`,
        apiBaseUrl: "https://example.invalid/mdi",
      };
    case "stripeApi":
      return {
        ...base,
        secretKind: "stripeApi",
        secretKey: `${fakeSecretPrefix}stripe_secret_key`,
        webhookSigningSecret: `${fakeSecretPrefix}stripe_webhook_signing_secret`,
      };
    case "appSigning":
      return {
        ...base,
        secretKind: "appSigning",
        signingSecret: `${fakeSecretPrefix}app_signing_secret`,
      };
  }
}
