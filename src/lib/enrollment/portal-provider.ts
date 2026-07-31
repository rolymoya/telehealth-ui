import { createHash } from "node:crypto";

export type PortalProviderFailureCode =
  | "provider_unavailable"
  | "provider_rejected"
  | "invalid_provider_response";

export type PortalProviderResult<T> =
  | { ok: true; value: T }
  | {
    ok: false;
    code: PortalProviderFailureCode;
    retryable: boolean;
  };

export interface PortalProvider {
  readonly providerCode: string;
  readonly allowedLaunchOrigins: ReadonlySet<string>;
  provisionPatient(input: {
    patientReference: string;
    enrollmentReference: string;
    catalogReference: string;
    idempotencyKey: string;
  }): Promise<PortalProviderResult<{
    providerPatientId: string;
    providerCaseId?: string;
  }>>;
  mintPatientLaunch(input: {
    providerPatientId: string;
    providerCaseId?: string;
    returnOrigin: string;
    idempotencyKey: string;
  }): Promise<PortalProviderResult<{
    launchUrl: string;
    launchReference: string;
  }>>;
}

export function createSyntheticPortalProvider(input: {
  launchOrigin: string;
}): PortalProvider {
  const launchOrigin = canonicalHttpsOrigin(input.launchOrigin);
  if (!launchOrigin) {
    throw new Error("Synthetic portal launch origin must be HTTPS");
  }

  return {
    providerCode: "synthetic",
    allowedLaunchOrigins: new Set([launchOrigin]),
    async provisionPatient(request) {
      return {
        ok: true,
        value: {
          providerPatientId: opaqueId("patient", request.patientReference),
          providerCaseId: opaqueId(
            "case",
            `${request.enrollmentReference}:${request.catalogReference}`,
          ),
        },
      };
    },
    async mintPatientLaunch(request) {
      const launchReference = opaqueId(
        "launch",
        `${request.providerPatientId}:${request.providerCaseId ?? "none"}:${request.idempotencyKey}`,
      );
      return {
        ok: true,
        value: {
          launchReference,
          launchUrl: new URL(`/session/${launchReference}`, launchOrigin).toString(),
        },
      };
    },
  };
}

export function validatePortalLaunchUrl(
  value: string,
  allowedOrigins: ReadonlySet<string>,
): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== "" ||
      !allowedOrigins.has(url.origin)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function opaqueId(kind: string, input: string) {
  return `synthetic_${kind}_${createHash("sha256").update(input).digest("hex").slice(0, 32)}`;
}

function canonicalHttpsOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
