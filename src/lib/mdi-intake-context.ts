import { createHash } from "node:crypto";

export const mdiQuestionnaireContextCookieName = "__Host-apoth_mdi_questionnaire";

export function createMdiQuestionnaireContextCookie(input: {
  questionnaireId: string;
  sessionToken: string;
}) {
  const questionnaireId = input.questionnaireId.trim();
  if (!questionnaireId || !input.sessionToken) {
    return null;
  }
  return [
    encodeURIComponent(questionnaireId),
    signatureFor(questionnaireId, input.sessionToken),
  ].join(".");
}

export function readMdiQuestionnaireContextCookie(input: {
  value?: string | null;
  sessionToken: string;
}) {
  if (!input.value || !input.sessionToken) {
    return null;
  }
  const [rawQuestionnaireId, signature, ...extra] = input.value.split(".");
  if (!rawQuestionnaireId || !signature || extra.length > 0) {
    return null;
  }
  let questionnaireId = "";
  try {
    questionnaireId = decodeURIComponent(rawQuestionnaireId);
  } catch {
    return null;
  }
  return signature === signatureFor(questionnaireId, input.sessionToken)
    ? questionnaireId
    : null;
}

function signatureFor(questionnaireId: string, sessionToken: string) {
  return createHash("sha256")
    .update(`mdi-questionnaire:${questionnaireId}:${sessionToken}`)
    .digest("base64url");
}
