import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cognitoAuthEnv } from "@/lib/auth";
import {
  fakeSecretPrefix,
  placeholderSecretPayload,
  secretContracts,
  secretName,
} from "../contracts";
import {
  assertNoPublicSecretConfig,
  parseSecretPayload,
  validateSecretPayload,
} from "../index";
import {
  assertPublicServerStartupConfig,
  assertServerStartupConfig,
  createAwsSecretsManagerStartupSecretSource,
  resolveAwsSecretsManagerStartupConfig,
  resolveStartupSecretSource,
  secretIdentifierEnvName,
  validateConfiguredServerStartupSecrets,
  validateServerStartupSecrets,
} from "../startup";

describe("secret contracts", () => {
  it("uses stage-scoped names and fake placeholders for local fixtures", () => {
    expect(secretName("staging", "mdiApi")).toBe("/apoth/staging/mdi/api");
    expect(secretName("production", "stripeApi")).toBe("/apoth/production/stripe/api");

    const mdiPayload = placeholderSecretPayload("staging", "mdiApi");
    expect(mdiPayload).toMatchObject({
      apothStage: "staging",
      secretKind: "mdiApi",
      schemaVersion: 1,
      webhookAuthorizationSecret: `${fakeSecretPrefix}mdi_webhook_authorization_secret`,
      webhookSigningSecret: `${fakeSecretPrefix}mdi_webhook_signing_secret`,
    });

    const payload = placeholderSecretPayload("staging", "stripeApi");
    expect(payload).toMatchObject({
      apothStage: "staging",
      secretKind: "stripeApi",
      schemaVersion: 1,
      secretKey: `${fakeSecretPrefix}stripe_secret_key`,
    });
  });

  it("keeps public Cognito/client config out of the secret contract", () => {
    const fields = Object.values(secretContracts).flatMap((contract) =>
      contract.fields.map((field) => field.name),
    );

    expect(fields).not.toContain("userPoolId");
    expect(fields).not.toContain("userPoolClientId");
    expect(fields).not.toContain("appUrl");
  });

  it("keeps the runbook aligned to the shared secret contract", () => {
    const runbook = readFileSync(
      join(process.cwd(), "docs/runbooks/serverless-iac.md"),
      "utf8",
    );

    for (const kind of Object.keys(secretContracts) as Array<keyof typeof secretContracts>) {
      expect(runbook).toContain(secretName("staging", kind).replace("/staging/", "/{stage}/"));
      expect(runbook).toContain(secretContracts[kind].kind);
    }
  });
});

describe("secret validation", () => {
  it("parses fake staging fixtures only when fake values are allowed", () => {
    const raw = JSON.stringify(placeholderSecretPayload("staging", "mdiApi"));

    expect(
      parseSecretPayload(raw, {
        expectedStage: "staging",
        expectedKind: "mdiApi",
        allowFakeValues: true,
      }).ok,
    ).toBe(true);

    expect(
      parseSecretPayload(raw, {
        expectedStage: "staging",
        expectedKind: "mdiApi",
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "placeholder_value",
        message: "Secret mdiApi contains an unpopulated placeholder for clientId",
      },
    });
  });

  it("fails closed for malformed JSON, missing fields, and wrong-stage sentinels", () => {
    expect(
      parseSecretPayload("{", {
        expectedStage: "staging",
        expectedKind: "stripeApi",
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "malformed_json",
        message: "Secret stripeApi is not valid JSON",
      },
    });

    expect(
      validateSecretPayload(
        {
          ...placeholderSecretPayload("staging", "stripeApi"),
          webhookSigningSecret: "",
        },
        {
          expectedStage: "staging",
          expectedKind: "stripeApi",
          allowFakeValues: true,
        },
      ),
    ).toEqual({
      ok: false,
      error: {
        kind: "invalid_secret",
        message: "Secret stripeApi is missing webhookSigningSecret",
      },
    });

    expect(
      validateSecretPayload(placeholderSecretPayload("production", "appSigning"), {
        expectedStage: "staging",
        expectedKind: "appSigning",
        allowFakeValues: true,
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "wrong_stage",
        message: "Secret appSigning is tagged for the wrong Apoth stage",
      },
    });

    expect(
      validateSecretPayload(
        {
          ...placeholderSecretPayload("staging", "appSigning"),
          apothStage: undefined,
        },
        {
          expectedStage: "staging",
          expectedKind: "appSigning",
          allowFakeValues: true,
        },
      ),
    ).toEqual({
      ok: false,
      error: {
        kind: "invalid_secret",
        message: "Secret appSigning has an invalid Apoth stage sentinel",
      },
    });

    expect(
      validateSecretPayload(
        {
          ...placeholderSecretPayload("staging", "mdiApi"),
          patientName: "not allowed here",
        },
        {
          expectedStage: "staging",
          expectedKind: "mdiApi",
          allowFakeValues: true,
        },
      ),
    ).toEqual({
      ok: false,
      error: {
        kind: "invalid_secret",
        message: "Secret mdiApi contains an unknown field",
      },
    });
  });

  it("does not include unknown field names in validation errors", () => {
    const secretFieldName = "clientSecretShouldNotLeak";
    const result = validateSecretPayload(
      {
        ...placeholderSecretPayload("staging", "mdiApi"),
        [secretFieldName]: "not allowed here",
      },
      {
        expectedStage: "staging",
        expectedKind: "mdiApi",
        allowFakeValues: true,
      },
    );

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(secretFieldName);
  });

  it("does not include secret values in validation errors", () => {
    const secretValue = "fake_mdi_client_secret";
    const result = validateSecretPayload(
      {
        ...placeholderSecretPayload("staging", "mdiApi"),
        clientSecret: secretValue,
        apiBaseUrl: "not-a-url",
      },
      {
        expectedStage: "staging",
        expectedKind: "mdiApi",
        allowFakeValues: true,
      },
    );

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(secretValue);
  });

  it("rejects whitespace-only credential fields", () => {
    expect(
      validateSecretPayload(
        {
          ...placeholderSecretPayload("staging", "appSigning"),
          signingSecret: "   ",
        },
        {
          expectedStage: "staging",
          expectedKind: "appSigning",
          allowFakeValues: true,
        },
      ),
    ).toEqual({
      ok: false,
      error: {
        kind: "invalid_secret",
        message: "Secret appSigning is missing signingSecret",
      },
    });
  });

  it("trims accepted secret values before returning them", () => {
    const result = validateSecretPayload(
      {
        ...placeholderSecretPayload("staging", "appSigning"),
        signingSecret: "  fake_trimmed_app_signing_secret  ",
      },
      {
        expectedStage: "staging",
        expectedKind: "appSigning",
        allowFakeValues: true,
      },
    );

    expect(result.ok && result.value).toMatchObject({
      signingSecret: "fake_trimmed_app_signing_secret",
    });
  });

  it("accepts complete current and previous rotation windows", () => {
    const mdiResult = validateSecretPayload(
      {
        ...placeholderSecretPayload("staging", "mdiApi"),
        webhookSigningSecret: "  fake_current_mdi_webhook_secret  ",
        webhookSigningSecretPrevious: "  fake_previous_mdi_webhook_secret  ",
        webhookSigningSecretPreviousExpiresAt: "  2030-01-01T00:00:00.000Z  ",
      },
      {
        expectedStage: "staging",
        expectedKind: "mdiApi",
        allowFakeValues: true,
      },
    );
    expect(mdiResult.ok && mdiResult.value).toMatchObject({
      webhookSigningSecret: "fake_current_mdi_webhook_secret",
      webhookSigningSecretPrevious: "fake_previous_mdi_webhook_secret",
      webhookSigningSecretPreviousExpiresAt: "2030-01-01T00:00:00.000Z",
    });

    const stripeResult = validateSecretPayload(
      {
        ...placeholderSecretPayload("staging", "stripeApi"),
        webhookSigningSecret: "  fake_current_stripe_webhook_secret  ",
        webhookSigningSecretPrevious: "  fake_previous_stripe_webhook_secret  ",
        webhookSigningSecretPreviousExpiresAt: "  2030-01-01T00:00:00.000Z  ",
      },
      {
        expectedStage: "staging",
        expectedKind: "stripeApi",
        allowFakeValues: true,
      },
    );
    expect(stripeResult.ok && stripeResult.value).toMatchObject({
      webhookSigningSecret: "fake_current_stripe_webhook_secret",
      webhookSigningSecretPrevious: "fake_previous_stripe_webhook_secret",
      webhookSigningSecretPreviousExpiresAt: "2030-01-01T00:00:00.000Z",
    });

    const appSigningResult = validateSecretPayload(
      {
        ...placeholderSecretPayload("staging", "appSigning"),
        signingSecret: "fake_current_app_signing_secret",
        signingSecretPrevious: "fake_previous_app_signing_secret",
        signingSecretPreviousExpiresAt: "2030-01-01T00:00:00.000Z",
      },
      {
        expectedStage: "staging",
        expectedKind: "appSigning",
        allowFakeValues: true,
      },
    );
    expect(appSigningResult.ok && appSigningResult.value).toMatchObject({
      signingSecretPrevious: "fake_previous_app_signing_secret",
      signingSecretPreviousExpiresAt: "2030-01-01T00:00:00.000Z",
    });
  });

  it("rejects incomplete or invalid previous secret windows", () => {
    expect(
      validateSecretPayload(
        {
          ...placeholderSecretPayload("staging", "mdiApi"),
          webhookSigningSecretPrevious: "fake_previous_mdi_webhook_secret",
        },
        {
          expectedStage: "staging",
          expectedKind: "mdiApi",
          allowFakeValues: true,
        },
      ),
    ).toEqual({
      ok: false,
      error: {
        kind: "invalid_secret",
        message: "Secret mdiApi previous webhook signing secret window is incomplete",
      },
    });

    expect(
      validateSecretPayload(
        {
          ...placeholderSecretPayload("staging", "stripeApi"),
          webhookSigningSecretPrevious: "fake_previous_stripe_webhook_secret",
        },
        {
          expectedStage: "staging",
          expectedKind: "stripeApi",
          allowFakeValues: true,
        },
      ),
    ).toEqual({
      ok: false,
      error: {
        kind: "invalid_secret",
        message: "Secret stripeApi previous webhook signing secret window is incomplete",
      },
    });

    expect(
      validateSecretPayload(
        {
          ...placeholderSecretPayload("staging", "appSigning"),
          signingSecretPreviousExpiresAt: "2030-01-01T00:00:00.000Z",
        },
        {
          expectedStage: "staging",
          expectedKind: "appSigning",
          allowFakeValues: true,
        },
      ),
    ).toEqual({
      ok: false,
      error: {
        kind: "invalid_secret",
        message: "Secret appSigning previous signing secret window is incomplete",
      },
    });

    expect(
      validateSecretPayload(
        {
          ...placeholderSecretPayload("staging", "stripeApi"),
          webhookSigningSecretPrevious: "fake_previous_stripe_webhook_secret",
          webhookSigningSecretPreviousExpiresAt: "2030-01-01",
        },
        {
          expectedStage: "staging",
          expectedKind: "stripeApi",
          allowFakeValues: true,
        },
      ),
    ).toEqual({
      ok: false,
      error: {
        kind: "invalid_secret",
        message: "Secret stripeApi previous webhook signing secret expiry must be an ISO timestamp",
      },
    });

    expect(
      validateSecretPayload(
        {
          ...placeholderSecretPayload("staging", "appSigning"),
          signingSecretPrevious: `${fakeSecretPrefix}app_signing_secret`,
          signingSecretPreviousExpiresAt: "2030-01-01T00:00:00.000Z",
        },
        {
          expectedStage: "staging",
          expectedKind: "appSigning",
          allowFakeValues: true,
        },
      ),
    ).toEqual({
      ok: false,
      error: {
        kind: "invalid_secret",
        message: "Secret appSigning previous signing secret must differ from current",
      },
    });
  });

  it("requires fake prefixes for optional previous secrets in local fixtures", () => {
    expect(
      validateSecretPayload(
        {
          ...placeholderSecretPayload("staging", "stripeApi"),
          webhookSigningSecretPrevious: "whsec_previous",
          webhookSigningSecretPreviousExpiresAt: "2030-01-01T00:00:00.000Z",
        },
        {
          expectedStage: "staging",
          expectedKind: "stripeApi",
          allowFakeValues: true,
        },
      ),
    ).toEqual({
      ok: false,
      error: {
        kind: "placeholder_value",
        message: "Secret stripeApi test value for webhookSigningSecretPrevious must use fake_",
      },
    });
  });


  it("rejects partially populated MDI placeholder URLs at runtime", () => {
    expect(
      validateSecretPayload(
        {
          ...placeholderSecretPayload("staging", "mdiApi"),
          clientId: "realistic-client-id",
          clientSecret: "realistic-client-secret",
        },
        {
          expectedStage: "staging",
          expectedKind: "mdiApi",
        },
      ),
    ).toEqual({
      ok: false,
      error: {
        kind: "placeholder_value",
        message: "Secret mdiApi contains an unpopulated placeholder for apiBaseUrl",
      },
    });
  });

  it("rejects secret-looking public environment variables", () => {
    expect(
      assertNoPublicSecretConfig({
        NEXT_PUBLIC_STRIPE_SECRET: "fake_secret",
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "invalid_secret",
        message: "Public environment variable NEXT_PUBLIC_STRIPE_SECRET must not contain secret material",
      },
    });

    expect(
      assertNoPublicSecretConfig({
        NEXT_PUBLIC_COGNITO_USER_POOL_ID: "us-east-1_fake",
      }).ok,
    ).toBe(true);

    expect(
      assertNoPublicSecretConfig({
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: secretLike("sk", "live"),
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "invalid_secret",
        message: "Public environment variable NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must not contain secret material",
      },
    });
  });

  it("validates required secrets before server startup continues", async () => {
    await expect(
      validateServerStartupSecrets({
        stage: "staging",
        requiredSecrets: ["stripeApi"],
        source: {
          getSecretValue: async () => null,
        },
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        kind: "missing_secret",
        message: "Required secret stripeApi is missing",
      },
    });

    await expect(
      validateServerStartupSecrets({
        stage: "staging",
        requiredSecrets: ["appSigning"],
        source: {
          getSecretValue: async () =>
            JSON.stringify(placeholderSecretPayload("production", "appSigning")),
        },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        kind: "wrong_stage",
      },
    });

    await expect(
      validateServerStartupSecrets({
        stage: "staging",
        requiredSecrets: ["stripeApi"],
        source: {
          getSecretValue: async () =>
            JSON.stringify(placeholderSecretPayload("staging", "stripeApi")),
        },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        kind: "placeholder_value",
      },
    });

    await expect(
      validateServerStartupSecrets({
        stage: "staging",
        requiredSecrets: ["mdiApi"],
        source: {
          getSecretValue: async () => {
            throw new Error("upstream secret value should not leak");
          },
        },
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        kind: "invalid_secret",
        message: "Required secret mdiApi could not be loaded",
      },
    });
  });

  it("fails server startup config for unsafe public environment values", () => {
    expect(() =>
      assertServerStartupConfig({
        env: {
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: secretLike("sk", "test"),
        },
      }),
    ).toThrow(
      "Public environment variable NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must not contain secret material",
    );
  });

  it("does not gate public startup on backend runtime secret identifiers", () => {
    expect(() =>
      assertPublicServerStartupConfig({
        env: {
          APOTH_STAGE: "production",
          NODE_ENV: "production",
        },
      }),
    ).not.toThrow();

    expect(() =>
      assertPublicServerStartupConfig({
        env: {
          APOTH_STAGE: "production",
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: secretLike("sk", "live"),
        },
      }),
    ).toThrow(
      "Public environment variable NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must not contain secret material",
    );
  });

  it("validates optional public Cognito auth config during server startup", () => {
    expect(() =>
      assertServerStartupConfig({
        env: {
          [cognitoAuthEnv.region]: "us-east-1",
          [cognitoAuthEnv.userPoolId]: "us-east-1_urOM8PctH",
          [cognitoAuthEnv.userPoolClientId]: "2i8kvm8c840gfou4qvlm67u2be",
        },
      }),
    ).not.toThrow();

    expect(() =>
      assertServerStartupConfig({
        env: {
          [cognitoAuthEnv.region]: "us-east-1",
          [cognitoAuthEnv.userPoolId]: "us-west-2_urOM8PctH",
          [cognitoAuthEnv.userPoolClientId]: "2i8kvm8c840gfou4qvlm67u2be",
        },
      }),
    ).toThrow(
      "NEXT_PUBLIC_COGNITO_USER_POOL_ID must be a Cognito user pool ID for us-east-1",
    );
  });

  it("fails actual server startup config when production secrets are missing", () => {
    expect(() =>
      assertServerStartupConfig({
        env: {
          APOTH_STAGE: "production",
        },
      }),
    ).toThrow("Required secret mdiApi identifier is missing");
  });

  it("fails explicit env-payload startup fallback for wrong-stage configured secrets", () => {
    expect(() =>
      assertServerStartupConfig({
        env: {
          APOTH_ALLOW_ENV_SECRET_PAYLOADS: "true",
          APOTH_STAGE: "staging",
          APOTH_REQUIRED_SERVER_SECRETS: "appSigning",
          APOTH_SECRET_APP_SIGNING_JSON: JSON.stringify(
            placeholderSecretPayload("production", "appSigning"),
          ),
        },
      }),
    ).toThrow("Secret appSigning is tagged for the wrong Apoth stage");
  });

  it("accepts Secrets Manager identifiers without requiring full secret JSON in env", () => {
    expect(() =>
      assertServerStartupConfig({
        env: {
          APOTH_STAGE: "production",
          AWS_ACCESS_KEY_ID: "access",
          AWS_REGION: "us-east-1",
          AWS_SECRET_ACCESS_KEY: "secret",
          [secretIdentifierEnvName("mdiApi")]: "arn:aws:secretsmanager:us-east-1:123:secret:/apoth/production/mdi/api",
          [secretIdentifierEnvName("stripeApi")]: "arn:aws:secretsmanager:us-east-1:123:secret:/apoth/production/stripe/api",
          [secretIdentifierEnvName("appSigning")]: "arn:aws:secretsmanager:us-east-1:123:secret:/apoth/production/app/signing",
        },
      }),
    ).not.toThrow();
  });

  it("resolves an AWS Secrets Manager startup source from secret identifiers", () => {
    expect(
      resolveAwsSecretsManagerStartupConfig({
        APOTH_SECRET_STRIPE_API_ID: "/apoth/staging/stripe/api",
        AWS_ACCESS_KEY_ID: "access",
        AWS_REGION: "us-east-1",
        AWS_SECRET_ACCESS_KEY: "secret",
      }, ["stripeApi"]),
    ).toMatchObject({
      ok: true,
      value: {
        region: "us-east-1",
        secretIdentifiers: {
          stripeApi: "/apoth/staging/stripe/api",
        },
      },
    });

    expect(
      resolveStartupSecretSource({
        env: {
          APOTH_SECRET_STRIPE_API_ID: "/apoth/staging/stripe/api",
          AWS_REGION: "us-east-1",
        },
        requiredSecrets: ["stripeApi"],
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "invalid_secret",
        message: "AWS credentials are unavailable for Secrets Manager",
      },
    });
  });

  it("fetches and validates configured secrets through AWS Secrets Manager", async () => {
    const fetchMock = async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      expect(init.headers.authorization).toContain("AWS4-HMAC-SHA256");
      expect(init.headers["x-amz-target"]).toBe("secretsmanager.GetSecretValue");
      expect(JSON.parse(init.body)).toEqual({ SecretId: "/apoth/staging/stripe/api" });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            SecretString: JSON.stringify({
              apothStage: "staging",
              schemaVersion: 1,
              secretKind: "stripeApi",
              secretKey: "sk_test_runtime_secret",
              webhookSigningSecret: "whsec_runtime_secret",
            }),
          };
        },
      };
    };
    const source = createAwsSecretsManagerStartupSecretSource({
      accessKeyId: "access",
      region: "us-east-1",
      secretAccessKey: "secret",
      secretIdentifiers: {
        stripeApi: "/apoth/staging/stripe/api",
      },
    }, {
      fetch: fetchMock,
      now: () => new Date("2026-06-10T00:00:00.000Z"),
    });

    await expect(
      validateServerStartupSecrets({
        stage: "staging",
        requiredSecrets: ["stripeApi"],
        source,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: [{
        secretKind: "stripeApi",
        secretKey: "sk_test_runtime_secret",
      }],
    });
  });

  it("validates configured startup secrets with explicit env payload fallback only", async () => {
    await expect(
      validateConfiguredServerStartupSecrets({
        env: {
          APOTH_ALLOW_ENV_SECRET_PAYLOADS: "true",
          APOTH_REQUIRED_SERVER_SECRETS: "appSigning",
          APOTH_SECRET_APP_SIGNING_JSON: JSON.stringify({
            apothStage: "staging",
            schemaVersion: 1,
            secretKind: "appSigning",
            signingSecret: "runtime_signing_secret",
          }),
          APOTH_STAGE: "staging",
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: [{
        secretKind: "appSigning",
      }],
    });

    await expect(
      validateConfiguredServerStartupSecrets({
        env: {
          APOTH_REQUIRED_SERVER_SECRETS: "appSigning",
          APOTH_SECRET_APP_SIGNING_JSON: JSON.stringify({
            apothStage: "staging",
            schemaVersion: 1,
            secretKind: "appSigning",
            signingSecret: "runtime_signing_secret",
          }),
          APOTH_STAGE: "staging",
        },
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        kind: "missing_secret",
        message: "Required secret appSigning identifier is missing",
      },
    });
  });

  it("fails closed for unsupported startup stage values", () => {
    expect(() =>
      assertServerStartupConfig({
        env: {
          APOTH_STAGE: "prod",
        },
      }),
    ).toThrow("Unsupported APOTH_STAGE: prod");
  });

  it("requires an explicit stage in production runtime", () => {
    expect(() =>
      assertServerStartupConfig({
        env: {
          NODE_ENV: "production",
        },
      }),
    ).toThrow("APOTH_STAGE must be set in production");
  });

  it("requires production secrets for production runtime but not Next build phase", () => {
    expect(() =>
      assertServerStartupConfig({
        env: {
          APOTH_STAGE: "production",
          NODE_ENV: "production",
        },
      }),
    ).toThrow("Required secret mdiApi identifier is missing");

    expect(() =>
      assertServerStartupConfig({
        env: {
          APOTH_STAGE: "production",
          NODE_ENV: "production",
          NEXT_PHASE: "phase-production-build",
        },
      }),
    ).not.toThrow();
  });

  it("fails closed for invalid required secret configuration", () => {
    expect(() =>
      assertServerStartupConfig({
        env: {
          APOTH_REQUIRED_SERVER_SECRETS: "stripeAPI",
        },
      }),
    ).toThrow("Unsupported required secret kind: stripeAPI");

    expect(() =>
      assertServerStartupConfig({
        env: {
          APOTH_REQUIRED_SERVER_SECRETS: " , ",
        },
      }),
    ).toThrow("APOTH_REQUIRED_SERVER_SECRETS must include at least one secret kind");

    expect(() =>
      assertServerStartupConfig({
        env: {
          APOTH_REQUIRE_SERVER_SECRETS: "TRUE",
        },
      }),
    ).toThrow("APOTH_REQUIRE_SERVER_SECRETS must be true or false");

    expect(() =>
      assertServerStartupConfig({
        env: {
          APOTH_ALLOW_ENV_SECRET_PAYLOADS: "TRUE",
          APOTH_REQUIRED_SERVER_SECRETS: "stripeApi",
        },
      }),
    ).toThrow("APOTH_ALLOW_ENV_SECRET_PAYLOADS must be true or false");
  });

  it("reads required startup secrets concurrently but reports in required order", async () => {
    const calls: string[] = [];
    const pending = new Map<string, () => void>();
    const result = validateServerStartupSecrets({
      stage: "staging",
      requiredSecrets: ["mdiApi", "stripeApi"],
      source: {
        getSecretValue: (kind) =>
          new Promise((resolve) => {
            calls.push(kind);
            pending.set(kind, () => resolve(null));
          }),
      },
    });

    expect(calls).toEqual(["mdiApi", "stripeApi"]);
    pending.get("stripeApi")?.();
    pending.get("mdiApi")?.();

    await expect(result).resolves.toEqual({
      ok: false,
      error: {
        kind: "missing_secret",
        message: "Required secret mdiApi is missing",
      },
    });
  });

  it("keeps the runtime secret modules server-only", () => {
    const runtimeSource = readFileSync(
      join(process.cwd(), "src/lib/secrets/index.ts"),
      "utf8",
    );
    const startupSource = readFileSync(
      join(process.cwd(), "src/lib/secrets/startup.ts"),
      "utf8",
    );
    const layoutSource = readFileSync(
      join(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );

    expect(runtimeSource.startsWith('import "server-only";')).toBe(true);
    expect(startupSource.startsWith('import "server-only";')).toBe(true);
    expect(layoutSource).toContain(
      "assertPublicServerStartupConfig({ env: process.env });",
    );
  });
});

function secretLike(prefix: "sk", mode: "live" | "test") {
  return [prefix, mode, "accidentally_secret"].join("_");
}
