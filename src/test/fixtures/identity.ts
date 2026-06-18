import { currentConsentVersion } from "@/lib/consents";

export const cognitoUserFixture = {
  sub: "cognito-sub-0123456789abcdef",
  email: "patient@example.test",
};

export const patientLinkageFixture = {
  cognitoSub: cognitoUserFixture.sub,
  mdiPatientId: "mdi_patient_opaque_001",
  mdiCaseId: "mdi_case_opaque_001",
  stripeCustomerId: "cus_opaque_001",
  stripeSubscriptionId: null,
  onboardingStatus: "intake_started",
  billingStatus: "payment_method_pending",
  consentVersion: currentConsentVersion,
  consentAcceptedAt: "2026-06-05T12:00:00.000Z",
};
