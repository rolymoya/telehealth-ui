export const mdiQuestionnaireFixture = {
  patientId: "mdi_patient_opaque_001",
  caseId: "mdi_case_opaque_001",
  answers: [
    { questionId: "q_height", value: "68" },
    { questionId: "q_medications", value: "No current medications" },
  ],
};

export const mdiClinicalApprovalEventFixture = {
  provider: "mdi",
  eventId: "mdi_evt_approval_001",
  type: "case_clinically_approved",
  mdiCaseId: "mdi_case_opaque_001",
  occurredAt: "2026-06-05T12:30:00.000Z",
} as const;

export const mdiCaseCreatedEventFixture = {
  provider: "mdi",
  eventId: "mdi_evt_case_created_001",
  type: "case_created",
  mdiCaseId: "mdi_case_opaque_001",
  occurredAt: "2026-06-05T12:10:00.000Z",
} as const;
