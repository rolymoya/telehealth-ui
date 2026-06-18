import { describe, expect, it, vi } from "vitest";
import { createSqsWebhookEnqueue, resolveWebhookQueueConfig } from "@/lib/sqs";
import type { WebhookQueueMessage } from "@/lib/webhooks";

describe("SQS webhook queue adapter", () => {
  it("resolves queue config from launch environment variables", () => {
    expect(resolveWebhookQueueConfig({
      APOTH_WEBHOOK_QUEUE_URL: " https://sqs.us-east-1.amazonaws.com/123/webhook ",
      AWS_ACCESS_KEY_ID: " access-key ",
      AWS_REGION: " us-east-1 ",
      AWS_SECRET_ACCESS_KEY: " secret-key ",
      AWS_SESSION_TOKEN: " session-token ",
    })).toEqual({
      ok: true,
      value: {
        accessKeyId: "access-key",
        queueUrl: "https://sqs.us-east-1.amazonaws.com/123/webhook",
        region: "us-east-1",
        secretAccessKey: "secret-key",
        sessionToken: "session-token",
      },
    });
  });

  it("reports missing queue adapter settings before runtime use", () => {
    expect(resolveWebhookQueueConfig({
      AWS_ACCESS_KEY_ID: "access-key",
      AWS_REGION: "us-east-1",
      AWS_SECRET_ACCESS_KEY: "secret-key",
    })).toEqual({ ok: false, error: "Webhook queue URL is unavailable" });
    expect(resolveWebhookQueueConfig({
      APOTH_WEBHOOK_QUEUE_URL: "https://sqs.us-east-1.amazonaws.com/123/webhook",
      AWS_ACCESS_KEY_ID: "access-key",
      AWS_SECRET_ACCESS_KEY: "secret-key",
    })).toEqual({ ok: false, error: "AWS region is unavailable" });
    expect(resolveWebhookQueueConfig({
      APOTH_WEBHOOK_QUEUE_URL: "https://sqs.us-east-1.amazonaws.com/123/webhook",
      AWS_REGION: "us-east-1",
    })).toEqual({ ok: false, error: "AWS credentials are unavailable" });
  });

  it("sends a signed SQS SendMessage request with only the queue message contract", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const enqueue = createSqsWebhookEnqueue({
      accessKeyId: "AKIDEXAMPLE",
      queueUrl: "https://sqs.us-east-1.amazonaws.com/123/webhook",
      region: "us-east-1",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      sessionToken: "opaque-session-token",
    }, {
      fetch,
      now: () => new Date("2026-06-09T12:00:00.000Z"),
    });
    const message = webhookQueueMessage();

    await enqueue(message);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://sqs.us-east-1.amazonaws.com/123/webhook");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "content-type": "application/x-www-form-urlencoded",
      host: "sqs.us-east-1.amazonaws.com",
      "x-amz-date": "20260609T120000Z",
      "x-amz-security-token": "opaque-session-token",
    });
    expect(init.headers.authorization).toContain(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20260609/us-east-1/sqs/aws4_request",
    );
    expect(init.headers.authorization).toContain(
      "SignedHeaders=content-type;host;x-amz-date;x-amz-security-token",
    );
    expect(init.headers.authorization).toMatch(/Signature=[a-f0-9]{64}$/);
    expect(new URLSearchParams(init.body).get("Action")).toBe("SendMessage");
    expect(new URLSearchParams(init.body).get("Version")).toBe("2012-11-05");
    expect(JSON.parse(new URLSearchParams(init.body).get("MessageBody") ?? "{}")).toEqual(message);
  });

  it("surfaces SQS send failures to the webhook retry path", async () => {
    const enqueue = createSqsWebhookEnqueue({
      accessKeyId: "AKIDEXAMPLE",
      queueUrl: "https://sqs.us-east-1.amazonaws.com/123/webhook",
      region: "us-east-1",
      secretAccessKey: "secret",
    }, {
      fetch: vi.fn().mockResolvedValue({ ok: false, status: 503 }),
      now: () => new Date("2026-06-09T12:00:00.000Z"),
    });

    await expect(enqueue(webhookQueueMessage())).rejects.toThrow(
      "SQS SendMessage failed with 503",
    );
  });
});

function webhookQueueMessage(): WebhookQueueMessage {
  return {
    attempt: 1,
    correlationId: "stripe:evt_opaque_001",
    eventCategory: "billing",
    eventId: "evt_opaque_001",
    provider: "stripe",
    receivedAt: "2026-06-09T12:00:00.000Z",
    routeCode: "stripe.billing",
  };
}
