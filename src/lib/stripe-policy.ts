export type StripeMetadataValidation =
  | { valid: true }
  | { valid: false; offendingKey: string; reason: "disallowed_key" | "phi_value" | "unsafe_value" };

export type StripeDescriptorValidation =
  | { valid: true }
  | { valid: false; reason: "phi_value" | "unsafe_descriptor" };

export type StripeMetadataBuildResult =
  | { valid: true; metadata: Record<string, string> }
  | { valid: false; offendingKey: string; reason: "disallowed_key" | "phi_value" | "unsafe_value" };

const allowedStripeMetadataKeys = new Set([
  "app_patient_id",
  "cognito_sub",
  "mdi_patient_id",
  "mdi_case_id",
  "apoth_order_id",
  "apoth_stage",
]);

const phiValuePattern =
  /\b(weight|weight loss|hair loss|sexual health|erectile|ed|peptide|semaglutide|tirzepatide|ozempic|wegovy|mounjaro|zepbound|diagnosis|diagnosed|symptom|medication|medicine|prescription|questionnaire|answer|clinician|clinical note|medical note|condition|anxiety|depression|diabetes|pregnant|pregnancy)\b/i;

const safeDescriptorPattern = /^[A-Za-z0-9][A-Za-z0-9 ._-]{1,79}$/;

const stripeMetadataValuePatterns: Record<string, RegExp> = {
  app_patient_id: /^app_patient_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/,
  apoth_order_id: /^apoth_order_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/,
  apoth_stage: /^(?:staging|production)$/,
  cognito_sub: /^(?:cognito-sub-[A-Za-z0-9-]+|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
  mdi_case_id: /^mdi_case_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/,
  mdi_patient_id: /^mdi_patient_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/,
};

export function validateStripeMetadata(
  metadata: Record<string, string>,
): StripeMetadataValidation {
  for (const [key, value] of Object.entries(metadata)) {
    if (!allowedStripeMetadataKeys.has(key)) {
      return { valid: false, offendingKey: key, reason: "disallowed_key" };
    }

    if (phiValuePattern.test(value)) {
      return { valid: false, offendingKey: key, reason: "phi_value" };
    }

    if (!stripeMetadataValuePatterns[key].test(value)) {
      return { valid: false, offendingKey: key, reason: "unsafe_value" };
    }
  }

  return { valid: true };
}

export function buildStripeMetadata(input: {
  apothStage: "staging" | "production";
  appPatientId: string;
  apothOrderId?: string;
  cognitoSub?: string;
  mdiCaseId?: string;
  mdiPatientId?: string;
}): StripeMetadataBuildResult {
  const metadata = {
    app_patient_id: input.appPatientId,
    apoth_stage: input.apothStage,
    ...(input.apothOrderId ? { apoth_order_id: input.apothOrderId } : {}),
    ...(input.cognitoSub ? { cognito_sub: input.cognitoSub } : {}),
    ...(input.mdiCaseId ? { mdi_case_id: input.mdiCaseId } : {}),
    ...(input.mdiPatientId ? { mdi_patient_id: input.mdiPatientId } : {}),
  };
  const validation = validateStripeMetadata(metadata);
  return validation.valid
    ? { ...validation, metadata }
    : validation;
}

export function validateStripeDescriptor(value: string): StripeDescriptorValidation {
  if (phiValuePattern.test(value)) {
    return { valid: false, reason: "phi_value" };
  }
  if (!safeDescriptorPattern.test(value.trim())) {
    return { valid: false, reason: "unsafe_descriptor" };
  }
  return { valid: true };
}

export function assertStripeDescriptor(value: string): StripeDescriptorValidation {
  return validateStripeDescriptor(value);
}
