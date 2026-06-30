import { type NextRequest } from "next/server";
import {
  isJsonRequest,
  isSameOriginMutation,
  noStoreJson,
  readJsonObject,
} from "@/app/api/_shared/onboarding";
import { resolveAppSigningSecret } from "@/lib/app-signing-secret";
import {
  consentAcknowledgementFieldName,
  requiredConsentsForPrecheck,
} from "@/lib/consents";
import {
  createPrivacyNoticeGateContext,
  privacyNoticeGateSetCookieHeader,
} from "../../../../../shared/intake/anonymous-precheck-context";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ code: "invalid_origin" }, 403);
  }
  if (!isJsonRequest(request)) {
    return noStoreJson({ code: "invalid_content_type" }, 415);
  }

  const secret = await resolveAppSigningSecret(process.env);
  if (!secret.ok) {
    return noStoreJson({ error: "intake_unavailable" }, 503);
  }

  const body = await readJsonObject(request);
  if (!hasCurrentPrivacyNoticeAcknowledgement(body)) {
    return noStoreJson({ code: "privacy_notice_required" }, 400);
  }

  const cookie = privacyNoticeGateSetCookieHeader(
    createPrivacyNoticeGateContext({ secret: secret.value }),
  );
  return noStoreJson({ status: "privacy_notice_accepted" }, 200, {
    "Set-Cookie": cookie,
  });
}

function hasCurrentPrivacyNoticeAcknowledgement(body: Record<string, unknown> | null) {
  if (!body) {
    return false;
  }
  const acknowledgements = body.acknowledgements;
  if (
    !acknowledgements ||
    typeof acknowledgements !== "object" ||
    Array.isArray(acknowledgements)
  ) {
    return false;
  }
  const privacyNotice = requiredConsentsForPrecheck().find((consent) =>
    consent.consentKind === "privacy_notice"
  );
  if (!privacyNotice) {
    return false;
  }
  const value = (acknowledgements as Record<string, unknown>)[
    consentAcknowledgementFieldName(privacyNotice)
  ];
  return value === "accepted" || value === true;
}
