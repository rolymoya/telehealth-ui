import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  assertServerStartupConfig,
  validateServerStartupSecrets,
} from "../startup";

describe("secret contracts", () => {
  it("uses stage-scoped names and fake placeholders for local fixtures", () => {
    expect(secretName("staging", "mdiApi")).toBe("/apoth/staging/mdi/api");
    expect(secretName("production", "stripeApi")).toBe("/apoth/production/stripe/api");

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

  it("fails actual server startup config when production secrets are missing", () => {
    expect(() =>
      assertServerStartupConfig({
        env: {
          APOTH_STAGE: "production",
        },
      }),
    ).toThrow("Required secret mdiApi is missing");
  });

  it("fails actual server startup config for wrong-stage configured secrets", () => {
    expect(() =>
      assertServerStartupConfig({
        env: {
          APOTH_STAGE: "staging",
          APOTH_REQUIRED_SERVER_SECRETS: "appSigning",
          APOTH_SECRET_APP_SIGNING_JSON: JSON.stringify(
            placeholderSecretPayload("production", "appSigning"),
          ),
        },
      }),
    ).toThrow("Secret appSigning is tagged for the wrong Apoth stage");
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
    ).toThrow("Required secret mdiApi is missing");

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
      "assertServerStartupConfig({ env: process.env });",
    );
  });
});

function secretLike(prefix: "sk", mode: "live" | "test") {
  return [prefix, mode, "accidentally_secret"].join("_");
}
