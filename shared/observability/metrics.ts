export const observabilityNamespace = "Apoth/Application";

export const observabilityMetricNames = [
  "StripeSignatureFailures",
  "WebhookProcessingFailures",
  "MdiOutboundFailures",
  "OnboardingFailures",
  "StripeWebhookLagSeconds",
] as const;

export type ObservabilityMetricName = (typeof observabilityMetricNames)[number];

export const observabilityMetricDimensions = [
  "Outcome",
  "Provider",
  "ReasonCode",
  "RouteGroup",
  "Stage",
] as const;

export type ObservabilityMetricDimension = (typeof observabilityMetricDimensions)[number];
