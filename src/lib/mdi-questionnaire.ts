export type MdiQuestionnaireAnswer = {
  questionId: string;
  value: string | number | boolean | string[];
};

export type SubmitMdiQuestionnaireInput = {
  patientId: string;
  caseId: string;
  answers: readonly MdiQuestionnaireAnswer[];
};

export type SubmitMdiQuestionnaire = (
  input: SubmitMdiQuestionnaireInput,
) => Promise<{ mdiSubmissionId: string }>;

export type MdiQuestionnaireHandoffResult = {
  mdiSubmissionId: string;
  retainedAnswers: null;
};

export async function submitQuestionnaireAndDiscardAnswers(
  input: SubmitMdiQuestionnaireInput,
  submit: SubmitMdiQuestionnaire,
): Promise<MdiQuestionnaireHandoffResult> {
  const result = await submit(input);

  return {
    mdiSubmissionId: result.mdiSubmissionId,
    retainedAnswers: null,
  };
}
