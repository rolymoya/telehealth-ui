const logLevels = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof logLevels)[number];

const logProviders = ["apoth", "mdi", "stripe"] as const;
export type LogProvider = (typeof logProviders)[number];

const logOutcomes = ["success", "failure", "rejected", "retry"] as const;
export type LogOutcome = (typeof logOutcomes)[number];

const logReasonCodes = [
  "delayed",
  "processing_failed",
  "provider_unavailable",
  "signature_failed",
  "timeout",
  "unknown",
  "validation_failed",
] as const;
export type LogReasonCode = (typeof logReasonCodes)[number];

export type StructuredLogInput = {
  event: string;
  level: LogLevel;
  stage?: "staging" | "production";
  requestId?: string;
  correlationId?: string;
  provider?: LogProvider;
  outcome?: LogOutcome;
  reasonCode?: LogReasonCode;
  durationMs?: number;
  metadata?: Record<string, unknown>;
};

export type StructuredLogEvent = {
  event: string;
  level: LogLevel;
  stage?: "staging" | "production";
  requestId?: string;
  correlationId?: string;
  provider?: LogProvider;
  outcome?: LogOutcome;
  reasonCode?: LogReasonCode;
  durationMs?: number;
  metadata?: Record<string, RedactedLogValue>;
};

export type RedactedLogValue =
  | string
  | number
  | boolean
  | null
  | RedactedLogValue[]
  | { [key: string]: RedactedLogValue };

export const redactedLogValue = "[REDACTED]";
export const truncatedLogValue = "[TRUNCATED]";
export const circularLogValue = "[CIRCULAR]";

const maxDepth = 6;
const maxArrayItems = 25;
const maxKeyScanLength = 120;
const maxObjectEntries = 25;
const maxMetadataEntries = 25;
const maxRedactedNodes = 200;
const safeOpaqueTokenPattern =
  /^(?:req|corr|trace|evt|msg|job|lambda|apoth)_[A-Za-z0-9_.:-]{1,96}$/;
const clinicalFreeTextPattern =
  /allerg|anxiety|answer|asthma|birth|blood|bmi|cancer|cardiac|cardio|chest|cholesterol|clinical|condition|depression|diabetes|diabetic|diagnosis|disease|dose|dysfunction|erectile|glucose|glp|hair|heart|health|hypertension|kidney|liver|loss|medication|migraine|nausea|note|obesity|pain|pancreatitis|patient|peptide|pregnancy|pressure|question|semaglutide|symptom|tirzepatide|weight/i;

const allowedMetadataKeys = new Set([
  "attempt",
  "durationMs",
  "error",
  "httpStatus",
  "metricName",
  "metadataTruncated",
  "queueDepth",
  "redactedUnknownMetadataKeys",
  "retryable",
]);

const allowedMetricNames = new Set([
  "MdiOutboundFailures",
  "OnboardingFailures",
  "StripeSignatureFailures",
  "StripeWebhookLagSeconds",
  "WebhookProcessingFailures",
]);

const sensitiveKeyPattern =
  /answer|question|condition|medication|symptom|diagnosis|clinician|note|allerg|pregnancy|weight|height|address|phone|dob|birth|ssn|email|name|secret|token|authorization|api.?key|header|url|body|payload|metadata|message|description|cognito|mdi.*(patient|case)|stripe.*(customer|subscription)|patient|pk|sk/i;

const sensitiveValuePatterns = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+/g,
  new RegExp(`\\b${["whsec", ""].join("_")}[A-Za-z0-9_]+`, "g"),
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bASIA[0-9A-Z]{16}\b/g,
  /\bPATIENT#[A-Za-z0-9._:-]+\b/g,
  /\bMDI#(?:PATIENT|CASE)#[A-Za-z0-9._:-]+\b/g,
  /\bSTRIPE#(?:CUSTOMER|SUBSCRIPTION)#[A-Za-z0-9._:-]+\b/g,
  /\bcus_[A-Za-z0-9_]+\b/g,
  /\bsub_[A-Za-z0-9_]+\b/g,
];

const sensitiveQueryValuePattern =
  /([?&](?:token|secret|signature|key|code|session)=)[^&#\s]+/gi;

export function createStructuredLogEvent(
  input: StructuredLogInput,
): StructuredLogEvent {
  try {
    const safeInput: Record<string, unknown> = isRecord(input) ? input : {};
    const event: StructuredLogEvent = {
      event:
        typeof safeInput.event === "string" &&
        allowedEventNames.has(safeInput.event)
          ? safeInput.event
          : "unknown_event",
      level: isLogLevel(safeInput.level) ? safeInput.level : "info",
    };

    copyEnum(safeInput.stage, event, "stage", allowedStages);
    copySafeToken(safeInput.requestId, event, "requestId");
    copySafeToken(safeInput.correlationId, event, "correlationId");
    copyEnum(safeInput.provider, event, "provider", allowedProviders);
    copyEnum(safeInput.outcome, event, "outcome", allowedOutcomes);
    copyEnum(safeInput.reasonCode, event, "reasonCode", allowedReasonCodes);

    if (
      typeof safeInput.durationMs === "number" &&
      Number.isFinite(safeInput.durationMs)
    ) {
      event.durationMs = safeInput.durationMs;
    }

    const metadata = redactMetadata(safeInput.metadata);
    if (metadata) {
      event.metadata = metadata;
    }

    return event;
  } catch {
    return {
      event: "unknown_event",
      level: "info",
    };
  }
}

export function redactForLog(value: unknown): RedactedLogValue {
  try {
    return redactUnknown(value, {
      depth: 0,
      remainingNodes: { count: maxRedactedNodes },
      seen: new WeakSet<object>(),
    });
  } catch {
    return truncatedLogValue;
  }
}

export function writeStructuredLog(
  event: StructuredLogEvent,
  sink: (message: string) => void = console.info,
) {
  try {
    const message = JSON.stringify(normalizeStructuredLogEvent(event));
    if (typeof message !== "string") {
      throw new Error("Structured log serialization failed");
    }
    sink(message);
  } catch {
    try {
      sink(JSON.stringify({ event: "log_write_failed", level: "error" }));
    } catch {
      return;
    }
  }
}

function redactMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || safeIsArray(metadata)) {
    return undefined;
  }

  const entrySet = safeEntries(metadata, maxMetadataEntries);
  if (!entrySet) {
    return {
      metadataReadError: truncatedLogValue,
    };
  }

  const output: Record<string, RedactedLogValue> = {};
  let unknownCount = 0;
  for (const [key, value] of entrySet.entries) {
    if (!allowedMetadataKeys.has(key)) {
      unknownCount += 1;
      continue;
    }

    output[key] = redactAllowedMetadataValue(key, value);
  }

  if (unknownCount > 0) {
    output.redactedUnknownMetadataKeys = unknownCount;
  }
  if (entrySet.truncated) {
    output.metadataTruncated = truncatedLogValue;
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

function redactUnknown(
  value: unknown,
  context: {
    depth: number;
    key?: string;
    remainingNodes: { count: number };
    seen: WeakSet<object>;
  },
): RedactedLogValue {
  if (context.remainingNodes.count <= 0) {
    return truncatedLogValue;
  }
  context.remainingNodes.count -= 1;

  if (context.key && isUnsafeKey(context.key)) {
    return redactedLogValue;
  }

  if (context.depth > maxDepth) {
    return truncatedLogValue;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return context.key && allowedGenericStringKeys.has(context.key)
      ? redactAllowedGenericString(context.key, value)
      : redactedLogValue;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : truncatedLogValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return truncatedLogValue;
  }

  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return truncatedLogValue;
  }

  if (safeIsError(value)) {
    return {
      name: redactOperationalIdentifier(value.name),
      message: redactedLogValue,
    };
  }

  if (safeIsArray(value)) {
    const items = value.slice(0, maxArrayItems).map((entry) =>
      redactUnknown(entry, {
        depth: context.depth + 1,
        remainingNodes: context.remainingNodes,
        seen: context.seen,
      }),
    );
    if (value.length > maxArrayItems) {
      items.push(truncatedLogValue);
    }
    return items;
  }

  if (typeof value === "object") {
    if (context.seen.has(value)) {
      return circularLogValue;
    }
    context.seen.add(value);

    const output: Record<string, RedactedLogValue> = {};
    const entrySet = safeEntries(value, maxObjectEntries);
    if (!entrySet) {
      context.seen.delete(value);
      return truncatedLogValue;
    }
    let redactedKeyIndex = 0;
    for (const [key, nestedValue] of entrySet.entries) {
      const outputKey = safeOutputKey(key) ?? `redactedKey${redactedKeyIndex++}`;
      output[outputKey] = redactUnknown(nestedValue, {
        depth: context.depth + 1,
        key,
        remainingNodes: context.remainingNodes,
        seen: context.seen,
      });
    }
    if (entrySet.truncated) {
      output.truncatedKeys = truncatedLogValue;
    }

    context.seen.delete(value);
    return output;
  }

  return truncatedLogValue;
}

function redactErrorMetadata(value: unknown): RedactedLogValue {
  if (safeIsError(value)) {
    return {
      name: redactOperationalIdentifier(value.name),
      message: redactedLogValue,
    };
  }

  if (isRecord(value)) {
    const entrySet = safeEntries(value, maxObjectEntries);
    if (!entrySet) {
      return {
        message: redactedLogValue,
      };
    }

    const output: Record<string, RedactedLogValue> = {};
    let redactedKeyIndex = 0;
    for (const [key, nestedValue] of entrySet.entries) {
      const outputKey = safeOutputKey(key) ?? `redactedKey${redactedKeyIndex++}`;
      if (key === "name" || key === "code" || key === "kind") {
        output[outputKey] = redactOperationalIdentifier(nestedValue);
        continue;
      }
      output[outputKey] = redactedLogValue;
    }
    return output;
  }

  return redactedLogValue;
}

function redactAllowedMetadataValue(
  key: string,
  value: unknown,
): RedactedLogValue {
  switch (key) {
    case "attempt":
    case "durationMs":
    case "httpStatus":
    case "queueDepth":
      return typeof value === "number" && Number.isFinite(value)
        ? value
        : redactedLogValue;
    case "retryable":
      return typeof value === "boolean" ? value : redactedLogValue;
    case "redactedUnknownMetadataKeys":
      return typeof value === "number" && Number.isFinite(value)
        ? value
        : redactedLogValue;
    case "metadataTruncated":
      return value === truncatedLogValue ? truncatedLogValue : redactedLogValue;
    case "metricName":
      return redactMetricName(value);
    case "error":
      return redactErrorMetadata(value);
    default:
      return redactedLogValue;
  }
}

function safeEntries(
  value: object,
  limit: number,
): { entries: Array<[string, unknown]>; truncated: boolean } | null {
  try {
    const entries: Array<[string, unknown]> = [];
    for (const key in value as Record<string, unknown>) {
      if (entries.length >= limit) {
        return { entries, truncated: true };
      }
      try {
        entries.push([key, (value as Record<string, unknown>)[key]]);
      } catch {
        entries.push([key, truncatedLogValue]);
      }
    }
    return { entries, truncated: false };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !safeIsArray(value);
}

function isLogLevel(value: unknown): value is LogLevel {
  return allowedLevels.has(value as LogLevel);
}

function copySafeToken<T extends keyof StructuredLogEvent>(
  value: unknown,
  target: StructuredLogEvent,
  key: T,
) {
  if (
    typeof value === "string" &&
    safeOpaqueTokenPattern.test(value) &&
    !hasUnsafeStringContent(value)
  ) {
    target[key] = value as StructuredLogEvent[T];
  }
}

function copyEnum<T extends keyof StructuredLogEvent>(
  value: unknown,
  target: StructuredLogEvent,
  key: T,
  allowedValues: ReadonlySet<string>,
) {
  if (typeof value === "string" && allowedValues.has(value)) {
    target[key] = value as StructuredLogEvent[T];
  }
}

function redactMetricName(value: unknown): RedactedLogValue {
  return typeof value === "string" && allowedMetricNames.has(value)
    ? value
    : redactedLogValue;
}

function redactAllowedGenericString(
  key: string,
  value: string,
): RedactedLogValue {
  return key === "metricName"
    ? redactMetricName(value)
    : redactOperationalIdentifier(value);
}

function redactOperationalIdentifier(value: unknown): RedactedLogValue {
  return typeof value === "string" &&
    allowedOperationalIdentifiers.has(value) &&
    !hasUnsafeStringContent(value)
    ? value
    : redactedLogValue;
}

function normalizeStructuredLogEvent(event: StructuredLogEvent) {
  return createStructuredLogEvent({
    correlationId: event.correlationId,
    durationMs: event.durationMs,
    event: event.event,
    level: event.level,
    metadata: event.metadata,
    outcome: event.outcome,
    provider: event.provider,
    reasonCode: event.reasonCode,
    requestId: event.requestId,
    stage: event.stage,
  });
}

function safeOutputKey(key: string) {
  return allowedOutputKeys.has(key) && !hasUnsafeStringContent(key)
    ? key
    : null;
}

function isUnsafeKey(key: string) {
  if (key.length > maxKeyScanLength) {
    return true;
  }
  return sensitiveKeyPattern.test(key);
}

function hasUnsafeStringContent(value: string) {
  if (clinicalFreeTextPattern.test(value)) {
    return true;
  }

  if (sensitiveQueryValuePattern.test(value)) {
    sensitiveQueryValuePattern.lastIndex = 0;
    return true;
  }
  sensitiveQueryValuePattern.lastIndex = 0;

  for (const pattern of sensitiveValuePatterns) {
    pattern.lastIndex = 0;
    const matched = pattern.test(value);
    pattern.lastIndex = 0;
    if (matched) {
      return true;
    }
  }

  return false;
}

const allowedLevels = new Set<LogLevel>(logLevels);
const allowedStages = new Set(["staging", "production"]);
const allowedProviders = new Set<LogProvider>(logProviders);
const allowedOutcomes = new Set<LogOutcome>(logOutcomes);
const allowedReasonCodes = new Set<LogReasonCode>(logReasonCodes);
const allowedGenericStringKeys = new Set(["code", "kind", "metricName", "name"]);
const allowedOperationalIdentifiers = new Set([
  "Error",
  "MDI_503",
  "ProviderError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
]);
const allowedOutputKeys = new Set([
  "attempt",
  "callback",
  "code",
  "count",
  "durationMs",
  "error",
  "httpStatus",
  "kind",
  "message",
  "metadataReadError",
  "metadataTruncated",
  "metricName",
  "multiline",
  "name",
  "queueDepth",
  "redactedUnknownMetadataKeys",
  "retryable",
  "self",
  "stack",
  "symbol",
  "truncatedKeys",
  "type",
]);
const allowedEventNames = new Set([
  "intake_submission_rejected",
  "log_write_failed",
  "metadata_shape_check",
  "mdi_call_failed",
  "stripe_signature_failed",
  "webhook_processed",
]);

function safeIsArray(value: unknown): value is unknown[] {
  try {
    return Array.isArray(value);
  } catch {
    return false;
  }
}

function safeIsError(value: unknown): value is Error {
  try {
    return value instanceof Error;
  } catch {
    return false;
  }
}
