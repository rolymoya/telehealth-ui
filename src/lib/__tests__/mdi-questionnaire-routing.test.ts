import { describe, expect, it } from "vitest";
import { resolveMdiQuestionnaireForTreatment } from "@/lib/mdi-questionnaire-routing";

describe("MDI questionnaire routing", () => {
  it("maps launch treatments to explicit questionnaire IDs", () => {
    const env = {
      APOTH_MDI_QUESTIONNAIRE_IDS: JSON.stringify({
        hair: "mdi_questionnaire_hair",
        "sexual-health": "mdi_questionnaire_sexual_health",
        weight: "mdi_questionnaire_weight",
      }),
    };

    expect(resolveMdiQuestionnaireForTreatment("weight", env)).toEqual({
      ok: true,
      questionnaireId: "mdi_questionnaire_weight",
      treatment: "weight",
    });
  });

  it("fails closed when a configured mapping omits the selected treatment", () => {
    expect(resolveMdiQuestionnaireForTreatment("hair", {
      APOTH_MDI_QUESTIONNAIRE_IDS: JSON.stringify({
        weight: "mdi_questionnaire_weight",
      }),
    })).toEqual({
      ok: false,
      code: "questionnaire_unavailable",
      status: 503,
    });
  });

  it("keeps the legacy single-questionnaire fallback available", () => {
    expect(resolveMdiQuestionnaireForTreatment("sexual-health", {
      APOTH_MDI_QUESTIONNAIRE_ID: "mdi_questionnaire_launch",
    })).toEqual({
      ok: true,
      questionnaireId: "mdi_questionnaire_launch",
      treatment: "sexual-health",
    });
  });
});
