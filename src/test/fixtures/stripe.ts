export const stripeOpaqueMetadataFixture = {
  app_patient_id: "app_patient_opaque_001",
  mdi_patient_id: "mdi_patient_opaque_001",
  mdi_case_id: "mdi_case_opaque_001",
};

export const stripeWebhookEventFixture = {
  provider: "stripe",
  eventId: "evt_opaque_001",
  type: "customer.subscription.created",
  metadata: stripeOpaqueMetadataFixture,
};
