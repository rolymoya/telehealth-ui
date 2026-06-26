import { expect, type Page, test } from "@playwright/test";
import { e2eAuthHeaderName } from "../../src/lib/e2e-auth";
import type { PatientDashboardViewModel } from "../../src/lib/patient-dashboard";
import { buildStripeMetadata, validateStripeMetadata } from "../../src/lib/stripe-policy";
import {
  installOnboardingNetworkGuard,
  jsonApi,
  type NetworkCapture,
} from "./support/onboarding";

const e2eAuthToken = process.env.APOTH_E2E_AUTH_TOKEN;

if (!e2eAuthToken) {
  throw new Error("APOTH_E2E_AUTH_TOKEN must be set by Playwright config.");
}

const now = "2026-06-26T17:30:00.000Z";
const forbiddenFragments = [
  "SYNTHETIC_DIAGNOSIS_SENTINEL",
  "SYNTHETIC_MEDICATION_SENTINEL",
  "SYNTHETIC_QUESTIONNAIRE_ANSWER_SENTINEL",
  "SYNTHETIC_CLINICIAN_NOTE_SENTINEL",
  "condition_name",
  "diagnosis",
  "symptom",
  "medication",
  "questionnaire_answer",
  "clinician_note",
  "raw_mdi_payload",
  "SECRET_MDI_WORKFLOW_TOKEN",
  "mdi_cancellation_review_requested",
  "clinical_reason",
  "free_text",
];

const allowedStripeMetadataKeys = [
  "app_patient_id",
  "apoth_order_id",
  "apoth_stage",
  "cognito_sub",
  "mdi_case_id",
  "mdi_patient_id",
].sort();

test.describe("Stripe billing timing and no-PHI metadata", () => {
  test.use({
    extraHTTPHeaders: {
      [e2eAuthHeaderName]: e2eAuthToken,
    },
  });

  test("keeps pending clinical review locked from Stripe checkout or subscription creation", async ({
    page,
  }) => {
    const guard = await installOnboardingNetworkGuard(page, {
      "POST /api/billing/payment-method": () => jsonApi({ error: "payment_not_ready" }, 409),
    });

    await page.goto("/billing");
    await page.getByRole("button", { name: "Prepare payment method" }).click();

    await expect(page.getByText("Billing is still locked.")).toBeVisible();
    await expect(page.getByText("No charge or active subscription was created.")).toBeVisible();
    expectNoCheckoutOrSubscriptionCreation(guard.captures);
    await guard.expectNoForbiddenFragments(forbiddenFragments);
    guard.expectNoNetworkViolations();
    expectNoUnexpectedConsoleErrors(guard.consoleErrors, [/status of 409/i]);
  });

  test("keeps generic approved and manual-review statuses locked until billing-ready unlock", async ({
    page,
  }) => {
    const guard = await installOnboardingNetworkGuard(page, {
      "GET /api/dashboard": () => jsonApi(dashboardFixture({
        billing: {
          canCancel: false,
          code: "billing_pending_approval",
          label: "Pending clinical approval",
          summary: "Billing remains locked until the billing-ready unlock event is mirrored.",
        },
        caseStatus: {
          code: "case_status_clinical_review",
          label: "Manual review",
          summary: "Your request is approved for continued account review. Billing is not active yet.",
          updatedAt: now,
        },
      })),
    });

    await page.goto("/dashboard");

    await expect(page.getByText("Manual review")).toBeVisible();
    await expect(page.getByText("Billing remains locked until the billing-ready unlock event is mirrored.")).toBeVisible();
    await expect(page.getByText("billing_pending_approval")).toBeVisible();
    await expect(page.getByRole("link", { name: /billing|payment/i })).toHaveCount(0);
    await expect(billingDestinationLinks(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Prepare payment method" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel subscription" })).toHaveCount(0);
    expectNoCheckoutOrSubscriptionCreation(guard.captures);
    await guard.expectNoForbiddenFragments(forbiddenFragments);
    guard.expectNoNetworkViolations();
    expect(guard.consoleErrors).toEqual([]);
  });

  test("opens only Stripe Checkout setup after billing-ready unlock with allowed metadata", async ({
    page,
  }) => {
    const metadata = stripeMetadataFixture();
    const guard = await installOnboardingNetworkGuard(page, {
      "POST /api/billing/payment-method": () => jsonApi({
        checkoutSessionId: "cs_test_billing_ready_001",
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_billing_ready_001",
        metadata,
        status: "checkout_session_created",
        stripeCustomerId: "cus_billing_ready_001",
      }),
    }, {
      allowedExternalOrigins: ["https://checkout.stripe.com"],
    });

    await page.goto("/billing");
    await guard.expectNoForbiddenFragments(forbiddenFragments);
    const stripeRedirect = page.waitForRequest((request) =>
      request.url().startsWith("https://checkout.stripe.com/c/pay/cs_test_billing_ready_001")
    );
    await page.getByRole("button", { name: "Prepare payment method" }).click();
    await stripeRedirect;

    expectStripeMetadataPolicy([metadata], guard.captures);
    expectNoForbiddenFragmentsInCapturedTraffic(guard.captures, guard.requestUrls);
    expect(guard.allowedExternalRequests).toEqual([
      "https://checkout.stripe.com/c/pay/cs_test_billing_ready_001",
    ]);
    expect(guard.captures).toEqual([
      expect.objectContaining({
        method: "POST",
        path: "/api/billing/payment-method",
        status: 200,
      }),
    ]);
    expect(JSON.stringify(guard.captures)).not.toMatch(/charge|subscription_create|billing_active/i);
    guard.expectNoNetworkViolations();
  });

  test("shows declined billing as locked and support-safe without Stripe activation", async ({
    page,
  }) => {
    const guard = await installOnboardingNetworkGuard(page, {
      "POST /api/billing/payment-method": () => jsonApi({ error: "clinical_declined" }, 403),
    });

    await page.goto("/billing");
    await page.getByRole("button", { name: "Prepare payment method" }).click();

    await expect(page.getByText("Billing is not available for this case.")).toBeVisible();
    await expect(page.getByText("No charge or active subscription was created.")).toBeVisible();
    expectNoCheckoutOrSubscriptionCreation(guard.captures);
    await guard.expectNoForbiddenFragments(forbiddenFragments);
    guard.expectNoNetworkViolations();
    expectNoUnexpectedConsoleErrors(guard.consoleErrors, [/status of 403/i]);
  });

  test("keeps abandoned setup inactive on the dashboard", async ({ page }) => {
    const guard = await installOnboardingNetworkGuard(page, {
      "GET /api/dashboard": () => jsonApi(dashboardFixture({
        billing: {
          canCancel: false,
          code: "billing_payment_method_needed",
          label: "Payment method needed",
          summary: "Payment setup was not completed. Billing is inactive until the setup step is finished.",
        },
      })),
    });

    await page.goto("/dashboard");

    await expect(page.getByText("Payment method needed")).toBeVisible();
    await expect(page.getByText("Billing is inactive until the setup step is finished.")).toBeVisible();
    await expect(page.getByText("Billing active")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /billing|payment/i })).toHaveCount(0);
    await expect(billingDestinationLinks(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Prepare payment method" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel subscription" })).toHaveCount(0);
    await guard.expectNoForbiddenFragments(forbiddenFragments);
    guard.expectNoNetworkViolations();
    expect(guard.consoleErrors).toEqual([]);
  });

  test("submits cancellation without exposing false MDI side-effect evidence", async ({ page }) => {
    let cancellationSubmitted = false;
    const activeDashboard = dashboardFixture({
      billing: {
        canCancel: true,
        code: "billing_active",
        label: "Billing active",
        summary: "Billing is active for this account.",
      },
      caseStatus: {
        code: "case_status_billing_ready",
        label: "Clinician review complete",
        summary: "Your care request has reached the billing-ready step.",
        updatedAt: now,
      },
    });
    const cancelPendingDashboard = dashboardFixture({
      billing: {
        canCancel: false,
        code: "billing_cancel_pending",
        label: "Cancellation scheduled",
        summary: "Cancellation is scheduled for the end of the current billing cycle.",
      },
    });
    const dashboardHandler = () => jsonApi(
      cancellationSubmitted ? cancelPendingDashboard : activeDashboard,
    );
    const guard = await installOnboardingNetworkGuard(page, {
      "GET /api/dashboard": Array.from({ length: 4 }, () => dashboardHandler),
      "POST /api/billing/subscription/cancel": () => {
        cancellationSubmitted = true;
        return jsonApi({
          status: "subscription_cancel_pending",
          stripeSubscriptionId: "sub_cancel_opaque_001",
        });
      },
    });

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Cancel subscription" }).click();
    await page.getByRole("button", { name: "Confirm cancellation" }).click();

    await expect(page.getByText(/Cancellation is scheduled/)).toBeVisible();
    expect(guard.captures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        method: "POST",
        path: "/api/billing/subscription/cancel",
        status: 200,
      }),
    ]));
    expect(JSON.stringify(guard.captures)).not.toContain("mdi_cancellation_review_requested");
    expect(JSON.stringify(guard.captures)).not.toContain("MDI_CANCELLATION_REVIEW_REQUESTED");
    await guard.expectNoForbiddenFragments(forbiddenFragments);
    guard.expectNoNetworkViolations();
    expect(guard.consoleErrors).toEqual([]);
  });

  test("renders dunning and refund-support dashboard states without clinical detail", async ({
    page,
  }) => {
    const guard = await installOnboardingNetworkGuard(page, {
      "GET /api/dashboard": () => jsonApi(dashboardFixture({
        actions: [
          {
            code: "ops_review_required",
            label: "Refund review",
            summary: "Support is reviewing a billing processor update against the account policy.",
            tone: "support",
          },
        ],
        billing: {
          canCancel: false,
          code: "billing_issue",
          label: "Billing issue",
          summary: "Payment needs attention. No clinical details are shown here.",
        },
        support: {
          code: "contact_support",
          label: "Contact support",
          summary: "For account or billing help, contact Apoth support. Medical questions stay in the care workflow.",
        },
      })),
    });

    await page.goto("/dashboard");

    await expect(page.getByText("Billing issue")).toBeVisible();
    await expect(page.getByText("Payment needs attention. No clinical details are shown here.")).toBeVisible();
    await expect(page.getByText("Refund review")).toBeVisible();
    await expect(page.getByText("Support is reviewing a billing processor update against the account policy.")).toBeVisible();
    await guard.expectNoForbiddenFragments(forbiddenFragments);
    guard.expectNoNetworkViolations();
    expect(guard.consoleErrors).toEqual([]);
  });
});

function expectNoCheckoutOrSubscriptionCreation(captures: readonly NetworkCapture[]) {
  const captured = JSON.stringify(captures);
  expect(captured).not.toMatch(/checkout_session_created|checkout\.stripe\.com/i);
  expect(captured).not.toMatch(/stripeSubscriptionId|subscription_create|subscription_created/i);
  expect(captured).not.toMatch(/charge_created|payment_intent_succeeded/i);
}

function billingDestinationLinks(page: Page) {
  return page.locator("a[href='/billing'], a[href^='/billing?']");
}

function expectStripeMetadataPolicy(
  fixtures: readonly unknown[],
  captures: readonly NetworkCapture[],
) {
  const metadataObjects = [
    ...fixtures.flatMap(findMetadataObjects),
    ...captures.flatMap((capture) => [
      ...findMetadataObjects(parseJson(capture.requestBody)),
      ...findMetadataObjects(parseJson(capture.responseBody)),
    ]),
  ];

  expect(metadataObjects.length).toBeGreaterThan(0);
  for (const metadata of metadataObjects) {
    expect(Object.keys(metadata).sort()).toEqual(allowedStripeMetadataKeys);
    expect(JSON.stringify(metadata)).not.toMatch(
      /condition|diagnosis|symptom|medication|questionnaire|answer|clinician|status|reason|free.?text/i,
    );
  }
}

function expectNoForbiddenFragmentsInCapturedTraffic(
  captures: readonly NetworkCapture[],
  requestUrls: readonly string[],
) {
  const scanned = [
    ...requestUrls,
    ...captures.flatMap((capture) => [
      capture.url,
      capture.requestBody,
      capture.responseBody,
    ]),
  ].join("\n");

  for (const fragment of forbiddenFragments) {
    expect(scanned).not.toContain(fragment);
  }
}

function expectNoUnexpectedConsoleErrors(
  errors: readonly string[],
  allowed: readonly RegExp[],
) {
  expect(errors.filter((error) => !allowed.some((pattern) => pattern.test(error)))).toEqual([]);
}

function findMetadataObjects(value: unknown): Record<string, unknown>[] {
  if (!isRecord(value)) {
    if (Array.isArray(value)) {
      return value.flatMap(findMetadataObjects);
    }
    return [];
  }
  const own = isRecord(value.metadata) ? [value.metadata] : [];
  return [
    ...own,
    ...Object.entries(value).flatMap(([key, nested]) =>
      key === "metadata" ? [] : findMetadataObjects(nested)
    ),
  ];
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stripeMetadataFixture() {
  const built = buildStripeMetadata({
    apothOrderId: "apoth_order_opaque_001",
    apothStage: "staging",
    appPatientId: "app_patient_opaque_001",
    cognitoSub: "cognito-sub-billing-e2e",
    mdiCaseId: "mdi_case_billing_e2e_001",
    mdiPatientId: "mdi_patient_billing_e2e_001",
  });

  expect(built.valid).toBe(true);
  if (!built.valid) {
    throw new Error("Stripe metadata fixture failed policy validation");
  }
  expect(validateStripeMetadata(built.metadata)).toEqual({ valid: true });
  return built.metadata;
}

function dashboardFixture(
  input: Partial<PatientDashboardViewModel> = {},
): PatientDashboardViewModel {
  return {
    account: {
      code: "manage_account",
      label: "Account",
      residencyState: "IL",
      status: "Clinical review",
    },
    actions: [
      {
        code: "action_needed_waiting",
        label: "No action needed",
        summary: "We will show a care workflow action here if MDI asks for one.",
        tone: "deferred",
      },
    ],
    billing: {
      canCancel: false,
      code: "billing_pending_approval",
      label: "Pending clinical approval",
      summary: "Billing remains pending until the approved clinical unlock event.",
    },
    care: {
      followUp: {
        code: "open_mdi_care",
        href: "/api/dashboard/workflows/messaging",
        label: "Open care workflow",
        summary: "Message your clinician or follow up in the MDI care workflow.",
        tone: "action",
        workflow: "messaging",
      },
      refills: {
        code: "refills_deferred",
        label: "Refills use care workflow",
        summary: "Native Apoth refill requests are deferred for launch. Use the care workflow for follow-up.",
        tone: "deferred",
      },
    },
    caseStatus: {
      code: "case_status_clinical_review",
      label: "Clinical review",
      summary: "Your MDI care team is reviewing the request.",
      updatedAt: now,
    },
    generatedAt: now,
    support: {
      code: "contact_support",
      label: "Contact support",
      summary: "For account or billing help, contact Apoth support. Medical questions stay in the care workflow.",
    },
    ...input,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
