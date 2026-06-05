export type StripeMetadataValidation =
  | { valid: true }
  | { valid: false; offendingKey: string; reason: "disallowed_key" | "phi_value" };

const allowedStripeMetadataKeys = new Set([
  "app_patient_id",
  "cognito_sub",
  "mdi_patient_id",
  "mdi_case_id",
  "apoth_order_id",
]);

const phiValuePattern =
  /\b(weight|hair loss|sexual health|erectile|peptide|semaglutide|tirzepatide|diagnosis|symptom|medication|prescription)\b/i;

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
  }

  return { valid: true };
}
