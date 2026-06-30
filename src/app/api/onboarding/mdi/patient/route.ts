import { type NextRequest } from "next/server";
import {
  noStoreJson,
  readJsonObject,
  resolveAppDataRepository,
  verifyJsonMutation,
} from "@/app/api/_shared/onboarding";
import { currentConsentVersion, requiredConsentsBeforeMdi } from "@/lib/consents";
import {
  createMdiQuestionnaireContextCookie,
  mdiQuestionnaireContextCookieName,
} from "@/lib/mdi-intake-context";
import { createDynamoDbMdiPatientRepository } from "@/lib/mdi-patient-dynamodb";
import { createMdiHttpPatientGateway } from "@/lib/mdi-patient-gateway";
import { createMdiPatientLinkage } from "@/lib/mdi-patient";
import { resolveMdiQuestionnaireForTreatment } from "@/lib/mdi-questionnaire-routing";
import { readOnboardingGateSnapshotAsync } from "@/lib/onboarding-status";
import { recordOnboardingTreatmentSelectionAsync } from "@/lib/onboarding-treatment-selection";
import { isUsStateCode, normalizeUsStateCode } from "../../../../../../shared/intake/us-states";

type MdiPatientProfile = {
  address: {
    address: string;
    address2?: string;
    city_name: string;
    state_name: string;
    zip_code: string;
  };
  date_of_birth: string;
  email: string;
  first_name: string;
  gender?: number;
  is_email_enabled: boolean;
  is_sms_enabled: boolean;
  last_name: string;
  phone_number: string;
  phone_type: number;
};

export async function POST(request: NextRequest) {
  const session = await verifyJsonMutation(request, {
    csrfScope: "mdi-patient",
    unavailableCode: "mdi_unavailable",
  });
  if (!session.ok) {
    return noStoreJson(errorBody(session.body), session.status);
  }

  const repository = resolveAppDataRepository(process.env);
  if (!repository.ok) {
    return noStoreJson({ code: "provider_unavailable" }, 503);
  }

  const snapshot = await readOnboardingGateSnapshotAsync(repository.value, {
    cognitoSub: session.value.session.user.cognitoSub,
    consentVersion: currentConsentVersion,
    requiredConsents: requiredConsentsBeforeMdi(),
  });
  if (!snapshot.ok) {
    return noStoreJson({ code: "provider_unavailable" }, 503);
  }
  if (!snapshot.value.consentAccepted) {
    return noStoreJson({
      code: "consent_required",
      redirect: "/onboarding/consent",
    }, 403);
  }
  if (snapshot.value.onboardingStatus !== "intake_ready") {
    return noStoreJson({
      code: "precheck_required",
      redirect: "/intake",
    }, 409);
  }

  const body = await readJsonObject(request);
  const treatment = resolveMdiQuestionnaireForTreatment(body?.treatment, process.env);
  if (!treatment.ok) {
    return noStoreJson({ code: treatment.code }, treatment.status);
  }

  const patient = parseMdiPatientProfile(body);
  if (!patient.ok) {
    return noStoreJson({ code: patient.code }, 400);
  }

  const result = await createMdiPatientLinkage(
    {
      cognitoSub: session.value.session.user.cognitoSub,
      patient: patient.value,
    },
    {
      gateway: createMdiHttpPatientGateway(),
      repository: createDynamoDbMdiPatientRepository(repository.value),
    },
  );
  if (!result.ok) {
    return noStoreJson({ code: result.error.code }, publicPatientStatus(result.error.status));
  }

  const selection = await recordOnboardingTreatmentSelectionAsync(repository.value, {
    cognitoSub: session.value.session.user.cognitoSub,
    now: new Date().toISOString(),
    questionnaireId: treatment.questionnaireId,
    treatment: treatment.treatment,
  });
  if (!selection.ok) {
    return noStoreJson({ code: "questionnaire_unavailable" }, 503);
  }

  const cookieValue = createMdiQuestionnaireContextCookie({
    questionnaireId: treatment.questionnaireId,
    sessionToken: session.value.token,
  });
  if (!cookieValue) {
    return noStoreJson({ code: "questionnaire_unavailable" }, 503);
  }

  const response = noStoreJson({
    status: "linked",
    redirect: "/onboarding/mdi",
  });
  response.cookies.set(mdiQuestionnaireContextCookieName, cookieValue, {
    httpOnly: true,
    maxAge: 30 * 60,
    path: "/",
    sameSite: "lax",
    secure: true,
  });
  return response;
}

function parseMdiPatientProfile(body: Record<string, unknown> | null):
  | { ok: true; value: MdiPatientProfile }
  | { ok: false; code: string } {
  const firstName = boundedText(body?.firstName, 1, 80);
  const lastName = boundedText(body?.lastName, 1, 80);
  const dateOfBirth = dateOnly(body?.dateOfBirth);
  const email = emailAddress(body?.email);
  const phoneNumber = phone(body?.phoneNumber);
  const address = boundedText(body?.address1, 1, 120);
  const address2 = boundedText(body?.address2, 0, 120);
  const city = boundedText(body?.city, 1, 80);
  const state = normalizeUsStateCode(stringValue(body?.state));
  const zipCode = zip(body?.zipCode);
  const gender = optionalInteger(body?.gender, 0, 9);

  if (!firstName) return { ok: false, code: "missing_first_name" };
  if (!lastName) return { ok: false, code: "missing_last_name" };
  if (!dateOfBirth) return { ok: false, code: "invalid_date_of_birth" };
  if (!email) return { ok: false, code: "invalid_email" };
  if (!phoneNumber) return { ok: false, code: "invalid_phone" };
  if (!address) return { ok: false, code: "missing_address" };
  if (!city) return { ok: false, code: "missing_city" };
  if (!state || !isUsStateCode(state)) return { ok: false, code: "invalid_state" };
  if (!zipCode) return { ok: false, code: "invalid_zip" };

  return {
    ok: true,
    value: {
      address: {
        address,
        ...(address2 ? { address2 } : {}),
        city_name: city,
        state_name: state,
        zip_code: zipCode,
      },
      date_of_birth: dateOfBirth,
      email,
      first_name: firstName,
      ...(gender === null ? {} : { gender }),
      is_email_enabled: true,
      is_sms_enabled: false,
      last_name: lastName,
      phone_number: phoneNumber,
      phone_type: 1,
    },
  };
}

function errorBody(body: Record<string, unknown>) {
  return typeof body.error === "string"
    ? { code: body.error }
    : body;
}

function publicPatientStatus(status: number) {
  if (status === 409) {
    return 409;
  }
  if (status === 429 || status === 418 || status >= 500) {
    return 503;
  }
  return 502;
}

function boundedText(value: unknown, min: number, max: number) {
  const text = stringValue(value);
  if (text.length < min || text.length > max) {
    return null;
  }
  return text;
}

function dateOnly(value: unknown) {
  const text = stringValue(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : text;
}

function emailAddress(value: unknown) {
  const text = stringValue(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) && text.length <= 254
    ? text
    : null;
}

function optionalInteger(value: unknown, min: number, max: number) {
  const text = stringValue(value);
  if (!text) {
    return null;
  }
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}

function phone(value: unknown) {
  const text = stringValue(value);
  return /^[+0-9().\-\s]{7,24}$/.test(text) ? text : null;
}

function zip(value: unknown) {
  const text = stringValue(value);
  return /^\d{5}(?:-\d{4})?$/.test(text) ? text : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
