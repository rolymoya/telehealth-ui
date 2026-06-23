import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
  type AppDataKey,
  type AppDataRecord,
  type AppDataResult,
  createInMemoryAppDataRepository,
  createPatientProfileRecord,
  claimWebhookEvent,
  getStripeLinkage,
  linkMdiPatientCase,
  linkStripeCustomer,
  markWebhookEventStatus,
  recordCurrentMdiCaseStatusEvidence,
  webhookIdempotencyKey,
} from "@/lib/dynamodb/app-data";
import { claimWebhookEventDynamoDb } from "@/lib/dynamodb/app-data-dynamodb";
import {
  createInMemoryStripeMirrorRepository,
  handleStripeWebhook,
  stripeWebhookEventContracts,
} from "@/lib/stripe-webhooks";
import { createWebhookProcessingRepository } from "@/lib/webhook-processing-repository";
import type { WebhookProcessingRepository } from "@/lib/webhooks";

describe("Stripe webhook receiver service", () => {
  it("rejects invalid signatures before claiming idempotency or mutating app data", async () => {
    const repository = createInMemoryAppDataRepository();
    const stripe = stripeVerifier(() => {
      throw new Error("invalid signature");
    });

    const result = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=bad",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      body: { error: "invalid_signature" },
    });
    expect(repository.get(webhookIdempotencyKey("stripe", "evt_opaque_001"))).toEqual({
      ok: true,
      value: null,
    });
  });

  it("rejects oversized payloads before Stripe signature construction or idempotency claims", async () => {
    const repository = createInMemoryAppDataRepository();
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_opaque_001",
      type: "customer.subscription.updated",
      object: {},
    }));

    const result = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}".padEnd(64 * 1024 + 1, " "),
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      body: { error: "invalid_signature" },
    });
    expect(stripe.webhooks.constructEvent).not.toHaveBeenCalled();
    expect(repository.get(webhookIdempotencyKey("stripe", "evt_opaque_001"))).toEqual({
      ok: true,
      value: null,
    });
  });

  it("durably queues a retry when the billing mirror hits a concurrent write conflict", async () => {
    const repository = createInMemoryAppDataRepository();
    seedStripeLinkage(repository, "active");
    const enqueue = vi.fn();
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_opaque_006",
      type: "customer.subscription.updated",
      object: {
        id: "sub_opaque_001",
        customer: "cus_opaque_001",
        status: "active",
      },
    }));

    const result = await handleStripeWebhook({
      stripeMirrorRepository: {
        ...createInMemoryStripeMirrorRepository(repository),
        async linkStripeCustomer() {
          return {
            ok: false,
            error: {
              kind: "conditional_conflict",
              message: "Concurrent Stripe linkage update",
            },
          };
        },
      },
      enqueue,
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, status: 200, body: { action: "queued" } });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      eventId: "evt_opaque_006",
      provider: "stripe",
    }));
    expect(repository.get(webhookIdempotencyKey("stripe", "evt_opaque_006"))).toMatchObject({
      ok: true,
      value: {
        retryOwner: "queue",
        retryable: true,
        status: "failed",
      },
    });
  });

  it("terminal-fails non-retryable validation failures from Stripe mirror updates", async () => {
    const repository = createInMemoryAppDataRepository();
    seedStripeLinkage(repository, "active");
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_opaque_007",
      type: "customer.subscription.updated",
      object: {
        id: "sub_opaque_001",
        customer: "cus_opaque_001",
        status: "active",
      },
    }));

    const result = await handleStripeWebhook({
      stripeMirrorRepository: {
        ...createInMemoryStripeMirrorRepository(repository),
        async linkStripeCustomer() {
          return {
            ok: false,
            error: {
              kind: "validation_failed",
              message: "Invalid Stripe linkage",
            },
          };
        },
      },
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({
      ok: true,
      status: 200,
      body: { action: "terminal_failed" },
    });
  });

  it("processes subscription events once and treats duplicates as idempotent skips", async () => {
    const repository = createInMemoryAppDataRepository();
    seedStripeLinkage(repository);
    const event = stripeEvent({
      id: "evt_opaque_001",
      type: "customer.subscription.updated",
      object: {
        id: "sub_opaque_001",
        customer: "cus_opaque_001",
        status: "active",
      },
    });
    const stripe = stripeVerifier(() => event);

    const first = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });
    const duplicate = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:01.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(first).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(duplicate).toMatchObject({ ok: true, body: { action: "skipped" } });
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: {
        billingStatus: "active",
        stripeCustomerId: "cus_opaque_001",
        stripeSubscriptionId: "sub_opaque_001",
      },
    });
    expect(repository.get(webhookIdempotencyKey("stripe", "evt_opaque_001"))).toMatchObject({
      ok: true,
      value: {
        attempts: 1,
        status: "processed",
      },
    });
  });

  it("does not mirror active subscription billing before the MDI clinical unlock state", async () => {
    const repository = createInMemoryAppDataRepository();
    seedStripeCustomerLinkage(repository, "payment_method_collected");
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_preapproval_active_001",
      type: "customer.subscription.updated",
      object: {
        id: "sub_opaque_001",
        customer: "cus_opaque_001",
        status: "active",
      },
    }));

    const result = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, body: { action: "processed" } });
  expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
    ok: true,
    value: {
      billingStatus: "payment_method_collected",
      stripeSubscriptionId: undefined,
    },
  });
});

  it("does not mirror active subscription billing after ordinary case approval without clinical unlock", async () => {
    const repository = createInMemoryAppDataRepository();
    seedMdiCaseStatusContext(repository, "approved", 25);
    seedStripeCustomerLinkage(repository, "payment_method_collected");
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_case_approved_active_001",
      type: "customer.subscription.updated",
      object: {
        id: "sub_opaque_001",
        customer: "cus_opaque_001",
        status: "active",
      },
    }));

    const result = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: {
        billingStatus: "payment_method_collected",
        stripeSubscriptionId: undefined,
      },
    });
  });

  it("does not mirror incomplete subscription state before the MDI clinical unlock state", async () => {
    const repository = createInMemoryAppDataRepository();
    seedMdiCaseStatusContext(repository, "approved", 25);
    seedStripeCustomerLinkage(repository, "payment_method_collected");
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_preapproval_incomplete_subscription_001",
      type: "customer.subscription.created",
      object: {
        id: "sub_opaque_preapproval_001",
        customer: "cus_opaque_001",
        status: "incomplete",
      },
    }));

    const result = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: {
        billingStatus: "payment_method_collected",
        stripeSubscriptionId: undefined,
      },
    });
  });

  it("does not mirror deleted subscription state before the MDI clinical unlock state", async () => {
    const repository = createInMemoryAppDataRepository();
    seedMdiCaseStatusContext(repository, "approved", 25);
    seedStripeCustomerLinkage(repository, "payment_method_collected");
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_preapproval_deleted_subscription_001",
      type: "customer.subscription.deleted",
      object: {
        id: "sub_opaque_preapproval_001",
        customer: "cus_opaque_001",
      },
    }));

    const result = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: {
        billingStatus: "payment_method_collected",
        stripeSubscriptionId: undefined,
      },
    });
  });

  it("does not mirror payment intent failure state before the MDI clinical unlock state", async () => {
    const repository = createInMemoryAppDataRepository();
    seedMdiCaseStatusContext(repository, "approved", 25);
    seedStripeCustomerLinkage(repository, "payment_method_collected");
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_preapproval_payment_intent_failed_001",
      type: "payment_intent.payment_failed",
      object: {
        customer: "cus_opaque_001",
        id: "pi_opaque_preapproval_001",
      },
    }));

    const result = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, body: { action: "queued" } });
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: {
        billingStatus: "payment_method_collected",
        stripeSubscriptionId: undefined,
      },
    });
  });

  it("does not fail when a different Stripe event repeats an already-recorded billing status", async () => {
    const repository = createInMemoryAppDataRepository();
    seedStripeLinkage(repository);
    const constructEvent = vi.fn<() => Stripe.Event>()
      .mockReturnValueOnce(stripeEvent({
        id: "evt_opaque_001",
        type: "customer.subscription.updated",
        object: {
          id: "sub_opaque_001",
          customer: "cus_opaque_001",
          status: "active",
        },
      }))
      .mockReturnValueOnce(stripeEvent({
        id: "evt_opaque_002",
        type: "invoice.payment_succeeded",
        object: {
          customer: "cus_opaque_001",
          subscription: "sub_opaque_001",
        },
      }));
    const stripe = stripeVerifier(constructEvent);

    const first = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });
    const second = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:01:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(first).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(second).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(repository.get(webhookIdempotencyKey("stripe", "evt_opaque_002"))).toMatchObject({
      ok: true,
      value: { status: "processed" },
    });
  });

  it("does not let an older invoice payment success reactivate a canceled subscription", async () => {
    const repository = createInMemoryAppDataRepository();
    seedStripeLinkage(repository, "active");
    const constructEvent = vi.fn<() => Stripe.Event>()
      .mockReturnValueOnce(stripeEvent({
        id: "evt_opaque_008",
        type: "customer.subscription.deleted",
        object: {
          id: "sub_opaque_001",
          customer: "cus_opaque_001",
        },
      }))
      .mockReturnValueOnce(stripeEvent({
        id: "evt_opaque_009",
        type: "invoice.payment_succeeded",
        object: {
          customer: "cus_opaque_001",
          subscription: "sub_opaque_001",
        },
      }));
    const stripe = stripeVerifier(constructEvent);

    const canceled = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });
    const staleInvoice = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:01:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(canceled).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(staleInvoice).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: {
        billingStatus: "canceled",
      },
    });
  });

  it("does not let older active subscription events revive a canceled subscription", async () => {
    const repository = createInMemoryAppDataRepository();
    seedStripeLinkage(repository, "active");
    const constructEvent = vi.fn<() => Stripe.Event>()
      .mockReturnValueOnce(stripeEvent({
        created: 1781020900,
        id: "evt_opaque_012",
        type: "customer.subscription.deleted",
        object: {
          id: "sub_opaque_001",
          customer: "cus_opaque_001",
        },
      }))
      .mockReturnValueOnce(stripeEvent({
        created: 1781020800,
        id: "evt_opaque_013",
        type: "customer.subscription.updated",
        object: {
          id: "sub_opaque_001",
          customer: "cus_opaque_001",
          status: "active",
        },
      }));
    const stripe = stripeVerifier(constructEvent);

    const canceled = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });
    const staleActive = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:01:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(canceled).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(staleActive).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: {
        billingStatus: "canceled",
        stripeBillingStatusObservedAt: "2026-06-09T16:01:40.000Z",
      },
    });
  });

	it("does not let same-second active subscription events revive a canceled subscription", async () => {
		const repository = createInMemoryAppDataRepository();
		seedStripeLinkage(repository, "active");
    const constructEvent = vi.fn<() => Stripe.Event>()
      .mockReturnValueOnce(stripeEvent({
        created: 1781020900,
        id: "evt_opaque_017",
        type: "customer.subscription.deleted",
        object: {
          id: "sub_opaque_001",
          customer: "cus_opaque_001",
        },
      }))
      .mockReturnValueOnce(stripeEvent({
        created: 1781020900,
        id: "evt_opaque_018",
        type: "customer.subscription.updated",
        object: {
          id: "sub_opaque_001",
          customer: "cus_opaque_001",
          status: "active",
        },
      }));
    const stripe = stripeVerifier(constructEvent);

    await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });
    const staleActive = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:01:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(staleActive).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: { billingStatus: "canceled" },
		});
	});

	it("does not let same-second lower-priority subscription events overwrite canceled", async () => {
		const repository = createInMemoryAppDataRepository();
		seedStripeLinkage(repository, "active");
		const constructEvent = vi.fn<() => Stripe.Event>()
			.mockReturnValueOnce(stripeEvent({
				created: 1781020900,
				id: "evt_opaque_021",
				type: "customer.subscription.deleted",
				object: {
					id: "sub_opaque_001",
					customer: "cus_opaque_001",
				},
			}))
			.mockReturnValueOnce(stripeEvent({
				created: 1781020900,
				id: "evt_opaque_022",
				type: "customer.subscription.updated",
				object: {
					id: "sub_opaque_001",
					customer: "cus_opaque_001",
					status: "past_due",
				},
			}))
			.mockReturnValueOnce(stripeEvent({
				created: 1781020900,
				id: "evt_opaque_023",
				type: "customer.subscription.updated",
				object: {
					id: "sub_opaque_001",
					customer: "cus_opaque_001",
					status: "incomplete",
				},
			}));
		const stripe = stripeVerifier(constructEvent);

		await handleStripeWebhook({
			stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
			enqueue: vi.fn(),
			payload: "{}",
			receivedAt: "2026-06-09T12:00:00.000Z",
			secret: { webhookSigningSecret: "whsec_current" },
			signature: "t=123,v1=good",
			stripe,
			webhookRepository: createWebhookProcessingRepository(repository),
		});
		await handleStripeWebhook({
			stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
			enqueue: vi.fn(),
			payload: "{}",
			receivedAt: "2026-06-09T12:01:00.000Z",
			secret: { webhookSigningSecret: "whsec_current" },
			signature: "t=123,v1=good",
			stripe,
			webhookRepository: createWebhookProcessingRepository(repository),
		});
		const stalePending = await handleStripeWebhook({
			stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
			enqueue: vi.fn(),
			payload: "{}",
			receivedAt: "2026-06-09T12:02:00.000Z",
			secret: { webhookSigningSecret: "whsec_current" },
			signature: "t=123,v1=good",
			stripe,
			webhookRepository: createWebhookProcessingRepository(repository),
		});

		expect(stalePending).toMatchObject({ ok: true, body: { action: "processed" } });
		expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
			ok: true,
			value: { billingStatus: "canceled" },
		});
	});

	it("does not let older active subscription events overwrite past_due", async () => {
		const repository = createInMemoryAppDataRepository();
		seedStripeLinkage(repository, "active");
    const constructEvent = vi.fn<() => Stripe.Event>()
      .mockReturnValueOnce(stripeEvent({
        created: 1781020900,
        id: "evt_opaque_014",
        type: "customer.subscription.updated",
        object: {
          id: "sub_opaque_001",
          customer: "cus_opaque_001",
          status: "past_due",
        },
      }))
      .mockReturnValueOnce(stripeEvent({
        created: 1781020800,
        id: "evt_opaque_015",
        type: "customer.subscription.updated",
        object: {
          id: "sub_opaque_001",
          customer: "cus_opaque_001",
          status: "active",
        },
      }));
    const stripe = stripeVerifier(constructEvent);

    const pastDue = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });
    const staleActive = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:01:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(pastDue).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(staleActive).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: {
        billingStatus: "past_due",
        stripeBillingStatusObservedAt: "2026-06-09T16:01:40.000Z",
      },
    });
  });

  it("does not let same-second active subscription events overwrite past_due", async () => {
    const repository = createInMemoryAppDataRepository();
    seedStripeLinkage(repository, "active");
    const constructEvent = vi.fn<() => Stripe.Event>()
      .mockReturnValueOnce(stripeEvent({
        created: 1781020900,
        id: "evt_opaque_019",
        type: "customer.subscription.updated",
        object: {
          id: "sub_opaque_001",
          customer: "cus_opaque_001",
          status: "past_due",
        },
      }))
      .mockReturnValueOnce(stripeEvent({
        created: 1781020900,
        id: "evt_opaque_020",
        type: "customer.subscription.updated",
        object: {
          id: "sub_opaque_001",
          customer: "cus_opaque_001",
          status: "active",
        },
      }));
    const stripe = stripeVerifier(constructEvent);

    await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });
    const staleActive = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:01:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(staleActive).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: { billingStatus: "past_due" },
    });
  });

  it("does not let pre-subscription payment method events downgrade an active subscription", async () => {
    const repository = createInMemoryAppDataRepository();
    seedStripeLinkage(repository, "active");
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_opaque_010",
      type: "payment_method.attached",
      object: {
        customer: "cus_opaque_001",
        id: "pm_opaque_001",
      },
    }));

    const result = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: {
        billingStatus: "active",
      },
    });
  });

  it("activates billing after late payment method collection when MDI is already billing_ready", async () => {
    const repository = createInMemoryAppDataRepository();
    seedMdiCaseStatusContext(repository, "billing_ready", 30);
    seedStripeCustomerLinkage(repository, "payment_method_pending");
    const billingActivation = billingActivationMock();
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_latepm_001",
      type: "payment_method.attached",
      object: {
        customer: "cus_opaque_001",
        id: "pm_opaque_001",
      },
    }));

    const result = await handleStripeWebhook({
      billingActivation,
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: { billingStatus: "payment_method_collected" },
    });
    expect(billingActivation.activate).toHaveBeenCalledTimes(1);
    expect(billingActivation.activate).toHaveBeenCalledWith({
      cognitoSub: "cognito-sub-0123456789abcdef",
      mdiCaseId: "mdi_case_stripe_webhook_001",
      now: "2026-06-09T12:00:00.000Z",
      webhookEventId: "evt_latepm_001",
    });
  });

  it("does not activate billing after payment method collection before MDI billing_ready", async () => {
    const repository = createInMemoryAppDataRepository();
    seedMdiCaseStatusContext(repository, "approved", 25);
    seedStripeCustomerLinkage(repository, "payment_method_pending");
    const billingActivation = billingActivationMock();
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_prepaypm_001",
      type: "setup_intent.succeeded",
      object: {
        customer: "cus_opaque_001",
        id: "seti_opaque_001",
      },
    }));

    const result = await handleStripeWebhook({
      billingActivation,
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: {
        billingStatus: "payment_method_collected",
        stripeSubscriptionId: undefined,
      },
    });
    expect(billingActivation.activate).not.toHaveBeenCalled();
  });

  it("mirrors Stripe subscription current period timestamps without clinical metadata", async () => {
    const repository = createInMemoryAppDataRepository();
    seedStripeLinkage(repository, "active");
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_periodmirror_001",
      type: "customer.subscription.updated",
      object: {
        current_period_end: 1784808000,
        current_period_start: 1782216000,
        id: "sub_opaque_001",
        customer: "cus_opaque_001",
        status: "active",
      },
    }));

    const result = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: {
        stripeCurrentPeriodEnd: "2026-07-23T12:00:00.000Z",
        stripeCurrentPeriodStart: "2026-06-23T12:00:00.000Z",
      },
    });
    const evidence = getStripeLinkage(repository, "cognito-sub-0123456789abcdef");
    expect(JSON.stringify(evidence)).not.toMatch(/condition|diagnosis|medication|questionnaire|answer/i);
  });

  it("continues mirroring subscription state after MDI advances to completed post-unlock", async () => {
    const repository = createInMemoryAppDataRepository();
    seedMdiCaseStatusContext(repository, "completed", 40);
    seedStripeCustomerLinkage(repository, "active", "sub_opaque_001");
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_completed_subscription_failed_001",
      type: "invoice.payment_failed",
      object: {
        customer: "cus_opaque_001",
        lines: {
          data: [{
            period: {
              end: 1784808000,
              start: 1782216000,
            },
          }],
        },
        subscription: "sub_opaque_001",
      },
    }));

    const result = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, status: 200, body: { action: "queued" } });
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: {
        billingStatus: "past_due",
        stripeCurrentPeriodEnd: "2026-07-23T12:00:00.000Z",
        stripeCurrentPeriodStart: "2026-06-23T12:00:00.000Z",
        stripeSubscriptionId: "sub_opaque_001",
      },
    });
  });

  it("does not mark subscription billing active for invoice success without a subscription", async () => {
    const repository = createInMemoryAppDataRepository();
    seedStripeCustomerLinkage(repository, "payment_method_collected");
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_opaque_011",
      type: "invoice.payment_succeeded",
      object: {
        customer: "cus_opaque_001",
      },
    }));

    const result = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, body: { action: "processed" } });
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: {
        billingStatus: "payment_method_collected",
        stripeSubscriptionId: undefined,
      },
    });
  });

  it("queues refund and dispute events without mutating billing linkage inline", async () => {
    const repository = createInMemoryAppDataRepository();
    seedStripeLinkage(repository, "active");
    const enqueue = vi.fn();
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_opaque_002",
      type: "charge.refunded",
      object: {
        customer: "cus_opaque_001",
        id: "ch_opaque_001",
      },
    }));

    const result = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue,
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toMatchObject({ ok: true, body: { action: "queued" } });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      correlationId: "stripe:evt_opaque_002",
      eventId: "evt_opaque_002",
      provider: "stripe",
    }));
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: {
        billingStatus: "active",
      },
    });
    expect(repository.get(webhookIdempotencyKey("stripe", "evt_opaque_002"))).toMatchObject({
      ok: true,
      value: {
        retryOwner: "queue",
        retryable: true,
        status: "failed",
      },
    });
  });

  it("keeps provider retry ownership when queue handoff fails", async () => {
    const repository = createInMemoryAppDataRepository();
    seedStripeLinkage(repository, "active");
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_opaque_003",
      type: "invoice.payment_failed",
      object: {
        customer: "cus_opaque_001",
        subscription: "sub_opaque_001",
      },
    }));

    const result = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: async () => {
        throw new Error("sqs unavailable");
      },
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: createWebhookProcessingRepository(repository),
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      body: { error: "retry_later" },
    });
    expect(getStripeLinkage(repository, "cognito-sub-0123456789abcdef")).toMatchObject({
      ok: true,
      value: {
        billingStatus: "past_due",
      },
    });
    expect(repository.get(webhookIdempotencyKey("stripe", "evt_opaque_003"))).toMatchObject({
      ok: true,
      value: {
        retryOwner: "provider",
        retryable: true,
        status: "failed",
      },
    });
  });

  it("returns 500 instead of acknowledging Stripe when idempotency claim storage fails", async () => {
    const repository = createInMemoryAppDataRepository();
    seedStripeLinkage(repository, "active");
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_opaque_004",
      type: "customer.subscription.updated",
      object: {
        id: "sub_opaque_001",
        customer: "cus_opaque_001",
        status: "active",
      },
    }));

    const result = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: {
        claim: async () => {
          throw new Error("DynamoDB unavailable");
        },
        markFailed: vi.fn(),
        markProcessed: vi.fn(),
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 500,
      body: { error: "webhook_processing_failed" },
    });
    expect(repository.get(webhookIdempotencyKey("stripe", "evt_opaque_004"))).toEqual({
      ok: true,
      value: null,
    });
  });

  it("asks Stripe to retry when another delivery already claimed the event", async () => {
    const repository = createInMemoryAppDataRepository();
    seedStripeLinkage(repository, "active");
    const stripe = stripeVerifier(() => stripeEvent({
      id: "evt_opaque_016",
      type: "customer.subscription.updated",
      object: {
        id: "sub_opaque_001",
        customer: "cus_opaque_001",
        status: "active",
      },
    }));

    const result = await handleStripeWebhook({
      stripeMirrorRepository: createInMemoryStripeMirrorRepository(repository),
      enqueue: vi.fn(),
      payload: "{}",
      receivedAt: "2026-06-09T12:00:00.000Z",
      secret: { webhookSigningSecret: "whsec_current" },
      signature: "t=123,v1=good",
      stripe,
      webhookRepository: duplicateClaimRepository(),
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      body: { error: "retry_later" },
    });
  });

  it("keeps DynamoDB retry exhaustion behavior aligned with the in-memory repository", async () => {
    const repository = createInMemoryAppDataRepository();
    const claimed = claimWebhookEvent(repository, {
      eventId: "evt_opaque_005",
      maxAttempts: 3,
      now: "2026-06-09T12:00:00.000Z",
      provider: "stripe",
    });
    expect(claimed.ok).toBe(true);
    const failed = markWebhookEventStatus(repository, {
      eventId: "evt_opaque_005",
      expectedAttempts: 1,
      expectedProcessingExpiresAt: claimed.ok ? claimed.value.record.processingExpiresAt : undefined,
      maxAttempts: 3,
      nextAttemptAfter: "2026-06-09T12:05:00.000Z",
      now: "2026-06-09T12:00:01.000Z",
      provider: "stripe",
      retryable: true,
      status: "failed",
    });
    expect(failed.ok).toBe(true);
    const existing = repository.get(webhookIdempotencyKey("stripe", "evt_opaque_005"));
    expect(existing.ok && existing.value?.recordType === "webhookIdempotency").toBe(true);
    if (existing.ok && existing.value?.recordType === "webhookIdempotency") {
      const updated = repository.update({
        ...existing.value,
        attempts: 3,
        updatedAt: "2026-06-09T12:00:02.000Z",
      }, { expected: existing.value });
      expect(updated.ok).toBe(true);
    }

    const retry = await claimWebhookEventDynamoDb(createAsyncRepository(repository), {
      eventId: "evt_opaque_005",
      now: "2026-06-09T12:06:00.000Z",
      provider: "stripe",
    });

    expect(retry).toMatchObject({
      ok: true,
      value: {
        outcome: "retryExhausted",
        record: {
          attempts: 3,
          retryable: false,
          status: "failed",
        },
      },
    });
  });

  it("covers every launch event with an explicit handling contract", () => {
    expect(stripeWebhookEventContracts.map((contract) => contract.type)).toEqual([
      "setup_intent.succeeded",
      "setup_intent.setup_failed",
      "payment_method.attached",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_succeeded",
      "invoice.payment_failed",
      "charge.refunded",
      "refund.created",
      "refund.updated",
      "charge.dispute.created",
      "charge.dispute.closed",
      "payment_intent.payment_failed",
    ]);
  });
});

function seedStripeLinkage(
  repository: ReturnType<typeof createInMemoryAppDataRepository>,
  billingStatus: Parameters<typeof linkStripeCustomer>[1]["billingStatus"] = "payment_method_pending",
) {
  seedApprovedBillingContext(repository);
  const linked = linkStripeCustomer(repository, {
    billingStatus,
    cognitoSub: "cognito-sub-0123456789abcdef",
    now: "2026-06-09T11:00:00.000Z",
    stripeCustomerId: "cus_opaque_001",
    stripeSubscriptionId: "sub_opaque_001",
  });
  expect(linked.ok).toBe(true);
}

function seedApprovedBillingContext(
  repository: ReturnType<typeof createInMemoryAppDataRepository>,
) {
  seedMdiCaseStatusContext(repository, "billing_ready", 30);
}

function seedMdiCaseStatusContext(
  repository: ReturnType<typeof createInMemoryAppDataRepository>,
  caseStatus: "approved" | "billing_ready" | "completed",
  statusRank: number,
) {
  const now = "2026-06-09T11:00:00.000Z";
  const cognitoSub = "cognito-sub-0123456789abcdef";
  const mdiPatientId = "mdi_patient_stripe_webhook_001";
  const mdiCaseId = "mdi_case_stripe_webhook_001";
  const profile = createPatientProfileRecord({
    cognitoSub,
    now,
    onboardingStatus: caseStatus === "billing_ready" || caseStatus === "completed"
      ? "billing_ready"
      : "clinical_review",
    residencyState: "IL",
  });
  const existingProfile = repository.get(profile);
  expect(existingProfile.ok).toBe(true);
  if (existingProfile.ok && existingProfile.value === null) {
    expect(repository.put(profile).ok).toBe(true);
  }
  expect(linkMdiPatientCase(repository, {
    cognitoSub,
    mdiCaseId,
    mdiPatientId,
    now,
  }).ok).toBe(true);
  expect(recordCurrentMdiCaseStatusEvidence(repository, {
    actorType: "vendor",
    caseStatus,
    cognitoSub,
    eventCategory: "webhook",
    eventId: `webhook:mdi:mdi_evt_stripe_webhook_${caseStatus}:WEBHOOK_SIDE_EFFECT_APPLIED:mdi_status_update`,
    eventType: "webhook_side_effect_applied",
    mdiCaseId,
    mdiPatientId,
    metadata: { side_effect: "mdi_status_update", case_status: caseStatus },
    occurredAt: now,
    recordedAt: now,
    source: "webhook",
    status: "succeeded",
    statusRank,
    summaryCode: "WEBHOOK_SIDE_EFFECT_APPLIED",
    terminal: false,
    webhookEventId: `mdi_evt_stripe_webhook_${caseStatus}`,
    webhookProvider: "mdi",
  }).ok).toBe(true);
}

function seedStripeCustomerLinkage(
  repository: ReturnType<typeof createInMemoryAppDataRepository>,
  billingStatus: Parameters<typeof linkStripeCustomer>[1]["billingStatus"],
  stripeSubscriptionId?: string,
) {
  const linked = linkStripeCustomer(repository, {
    billingStatus,
    cognitoSub: "cognito-sub-0123456789abcdef",
    now: "2026-06-09T11:00:00.000Z",
    stripeCustomerId: "cus_opaque_001",
    stripeSubscriptionId,
  });
  expect(linked.ok).toBe(true);
}

function stripeVerifier(constructEvent?: () => Stripe.Event) {
  const constructEventMock = vi.fn<() => Stripe.Event>();
  if (constructEvent) {
    constructEventMock.mockImplementation(constructEvent);
  }
  return {
    webhooks: {
      constructEvent: constructEventMock,
    },
  } as unknown as Pick<Stripe, "webhooks">;
}

function billingActivationMock() {
  return {
    activate: vi.fn(async () => ({ ok: true as const })),
  };
}

function stripeEvent(input: {
  created?: number;
  id: string;
  object: Record<string, unknown>;
  type: string;
}) {
  return {
    created: input.created ?? 1781020800,
    data: { object: input.object },
    id: input.id,
    object: "event",
    type: input.type,
  } as unknown as Stripe.Event;
}

function createAsyncRepository(repository: ReturnType<typeof createInMemoryAppDataRepository>) {
  return {
    async get(key: AppDataKey): Promise<AppDataResult<AppDataRecord | null>> {
      return repository.get(key);
    },
    async put<T extends AppDataRecord>(
      record: T,
      options?: { ifNotExists?: boolean },
    ): Promise<AppDataResult<T>> {
      return repository.put(record, options);
    },
    async update<T extends AppDataRecord>(
      record: T,
      options?: { expected?: AppDataRecord },
    ): Promise<AppDataResult<T>> {
      return repository.update(record, options);
    },
  };
}

function duplicateClaimRepository(): WebhookProcessingRepository {
  return {
    async claim() {
      return {
        outcome: "alreadyProcessing",
        record: {
          attempts: 0,
          eventId: "evt_opaque_016",
          processingExpiresAt: "2026-06-09T12:05:00.000Z",
          provider: "stripe",
          retryable: true,
          status: "processing",
        },
      };
    },
    markFailed: vi.fn(),
    markProcessed: vi.fn(),
  };
}
