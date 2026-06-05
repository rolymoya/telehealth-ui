import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookProvider = "stripe" | "mdi";

export type VerifyWebhookSignatureInput = {
  provider: WebhookProvider;
  payload: string | Buffer;
  secret: string;
  signatureHeader: string;
};

export type WebhookRecordStatus = "processing" | "processed" | "failed";

export type ExistingWebhookRecord = {
  provider: WebhookProvider;
  eventId: string;
  status: WebhookRecordStatus;
  retryable: boolean;
};

export type WebhookIdempotencyDecision =
  | { action: "process"; reason: "first_seen" }
  | { action: "skip"; reason: "duplicate_processed" | "duplicate_processing" }
  | { action: "retry"; reason: "prior_retryable_failure" }
  | { action: "skip"; reason: "prior_terminal_failure" };

export function verifyWebhookSignature({
  provider,
  payload,
  secret,
  signatureHeader,
}: VerifyWebhookSignatureInput): boolean {
  const parsed = parseSignatureHeader(provider, signatureHeader);

  if (!parsed) {
    return false;
  }

  const signedPayload =
    provider === "stripe" ? `${parsed.timestamp}.${payload.toString()}` : payload;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");

  return timingSafeHexEqual(expected, parsed.signature);
}

export function decideWebhookIdempotency(
  existing: ExistingWebhookRecord | null,
): WebhookIdempotencyDecision {
  if (!existing) {
    return { action: "process", reason: "first_seen" };
  }

  if (existing.status === "processed") {
    return { action: "skip", reason: "duplicate_processed" };
  }

  if (existing.status === "processing") {
    return { action: "skip", reason: "duplicate_processing" };
  }

  if (existing.retryable) {
    return { action: "retry", reason: "prior_retryable_failure" };
  }

  return { action: "skip", reason: "prior_terminal_failure" };
}

function parseSignatureHeader(
  provider: WebhookProvider,
  signatureHeader: string,
): { signature: string; timestamp?: string } | null {
  if (provider === "stripe") {
    const parts = new Map(
      signatureHeader.split(",").map((part) => {
        const [key, value] = part.split("=");
        return [key, value] as const;
      }),
    );
    const timestamp = parts.get("t");
    const signature = parts.get("v1");

    if (!timestamp || !signature) {
      return null;
    }

    return { signature, timestamp };
  }

  const signature = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

  return signature ? { signature } : null;
}

function timingSafeHexEqual(expectedHex: string, actualHex: string) {
  if (!/^[a-f0-9]+$/i.test(actualHex)) {
    return false;
  }

  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}
