export type SyntheticPatientFixture = {
  readonly cognitoSub: string;
  readonly email: string;
  readonly mdiCaseId: string;
  readonly mdiPatientId: string;
  readonly patientAlias: string;
  readonly stripeCustomerId: string;
};

export const syntheticPatients = {
  default: {
    cognitoSub: "cognito-sub-e2e-opaque-001",
    email: "apoth-e2e-001@example.test",
    mdiCaseId: "mdi-case-e2e-opaque-001",
    mdiPatientId: "mdi-patient-e2e-opaque-001",
    patientAlias: "synthetic-patient-001",
    stripeCustomerId: "stripe-customer-e2e-opaque-001",
  },
} satisfies Record<string, SyntheticPatientFixture>;
