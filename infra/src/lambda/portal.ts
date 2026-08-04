import {
  currentConsentVersion,
  requiredConsentsBeforeMdi,
} from "../../../shared/consents.js";
import { readTreatmentSelection } from "../../../src/lib/billing-disclosure-gate.js";
import {
  createDynamoDbAppDataRepository,
  resolveDynamoDbAppDataConfig,
} from "../../../src/lib/dynamodb/app-data-dynamodb.js";
import {
  createDefaultDynamoDbEnrollmentRepository,
  resolveDynamoDbEnrollmentConfig,
} from "../../../src/lib/enrollment/dynamodb-repository.js";
import { resolvePortalRuntimeConfig } from "../../../src/lib/enrollment/portal-runtime.js";
import { launchPatientPortal } from "../../../src/lib/enrollment/portal-service.js";
import { readOnboardingGateSnapshotAsync } from "../../../src/lib/onboarding-status.js";
import {
  header,
  isSameOriginMutation,
  json,
  readPatientSession,
  type ApiGatewayEvent,
  type ApiGatewayResponse,
} from "./patient-api.js";

export async function launchHandler(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  if (!isSameOriginMutation(event)) {
    return json(403, { error: "invalid_origin" });
  }
  if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(
    header(event, "content-type") ?? "",
  )) {
    return json(415, { error: "invalid_content_type" });
  }
  const form = new URLSearchParams(event.body ?? "");
  if (form.get("intent") !== "launch") {
    return json(403, { error: "invalid_request_intent" });
  }
  const session = await readPatientSession(event);
  if (!session.ok) {
    return json(session.status, { error: session.code });
  }

  const appDataConfig = resolveDynamoDbAppDataConfig(process.env);
  const enrollmentConfig = resolveDynamoDbEnrollmentConfig(process.env);
  const runtime = resolvePortalRuntimeConfig(process.env);
  const catalogCode = weightCatalogCode(process.env.APOTH_CHECKOUT_CATALOG_WEIGHT_ID);
  if (!appDataConfig.ok || !enrollmentConfig.ok || !runtime.ok || !catalogCode) {
    return json(503, { error: "portal_unavailable" });
  }
  const appData = createDynamoDbAppDataRepository(appDataConfig.value);
  const [snapshot, selection] = await Promise.all([
    readOnboardingGateSnapshotAsync(appData, {
      cognitoSub: session.session.cognitoSub,
      consentVersion: currentConsentVersion,
      requiredConsents: requiredConsentsBeforeMdi(),
    }),
    readTreatmentSelection(appData, session.session.cognitoSub),
  ]);
  if (
    !snapshot.ok ||
    !selection.ok ||
    !snapshot.value.consentAccepted ||
    !snapshot.value.residencyState ||
    snapshot.value.onboardingStatus === "profile_pending" ||
    !selection.value ||
    selection.value.treatment !== "weight"
  ) {
    return json(403, { error: "portal_not_authorized" });
  }

  const result = await launchPatientPortal({
    cognitoSub: session.session.cognitoSub,
    enrollmentBootstrap: { catalogCode },
    launchEnabled: runtime.value.launchEnabled,
    provisioningEnabled: runtime.value.provisioningEnabled,
    provider: runtime.value.provider,
    repository: createDefaultDynamoDbEnrollmentRepository(enrollmentConfig.value),
    returnOrigin: runtime.value.returnOrigin,
  });
  if (!result.ok) {
    return json(
      result.code === "portal_not_authorized" ? 403 :
        result.code === "portal_busy" ? 409 : 503,
      { error: result.code },
    );
  }
  return {
    body: "",
    headers: {
      "cache-control": "no-store, private",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      location: result.launchUrl,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
    statusCode: 303,
  };
}

function weightCatalogCode(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned && /^catalog_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(cleaned)
    ? cleaned
    : null;
}
