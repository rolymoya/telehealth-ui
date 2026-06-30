import type { LaunchOfferingSlug } from "../../shared/intake/precheck";

export type MdiQuestionnaireRouteResult =
  | { ok: true; questionnaireId: string; treatment: LaunchOfferingSlug }
  | {
      ok: false;
      code: "invalid_treatment" | "questionnaire_unavailable";
      status: number;
    };

export function resolveMdiQuestionnaireForTreatment(
  treatment: unknown,
  env: Record<string, string | undefined> = process.env,
): MdiQuestionnaireRouteResult {
  const normalized = normalizeTreatment(treatment);
  if (!normalized) {
    return { ok: false, code: "invalid_treatment", status: 400 };
  }

  const mapping = parseQuestionnaireMapping(env.APOTH_MDI_QUESTIONNAIRE_IDS);
  if (mapping) {
    const mapped = mapping[normalized]?.trim();
    return mapped
      ? { ok: true, questionnaireId: mapped, treatment: normalized }
      : { ok: false, code: "questionnaire_unavailable", status: 503 };
  }

  const fallback = env.APOTH_MDI_QUESTIONNAIRE_ID?.trim();
  return fallback
    ? { ok: true, questionnaireId: fallback, treatment: normalized }
    : { ok: false, code: "questionnaire_unavailable", status: 503 };
}

function normalizeTreatment(value: unknown): LaunchOfferingSlug | null {
  if (
    value === "sexual-health" ||
    value === "hair" ||
    value === "weight"
  ) {
    return value;
  }
  return null;
}

function parseQuestionnaireMapping(
  value: string | undefined,
): Partial<Record<LaunchOfferingSlug, string>> | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    return {
      ...(typeof record["sexual-health"] === "string"
        ? { "sexual-health": record["sexual-health"] }
        : {}),
      ...(typeof record.hair === "string" ? { hair: record.hair } : {}),
      ...(typeof record.weight === "string" ? { weight: record.weight } : {}),
    };
  } catch {
    return null;
  }
}
