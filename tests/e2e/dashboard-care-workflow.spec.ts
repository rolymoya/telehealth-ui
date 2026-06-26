import { expect, type Page, test } from "@playwright/test";
import { e2eAuthHeaderName } from "../../src/lib/e2e-auth";
import type { PatientDashboardViewModel } from "../../src/lib/patient-dashboard";
import {
  expectNoFragmentsInBrowserStorage,
  installOnboardingNetworkGuard,
  jsonApi,
} from "./support/onboarding";

const e2eAuthToken = process.env.APOTH_E2E_AUTH_TOKEN;

if (!e2eAuthToken) {
  throw new Error("APOTH_E2E_AUTH_TOKEN must be set by Playwright config.");
}

const now = "2026-06-24T15:00:00.000Z";
const forbiddenFragments = [
  "SYNTHETIC_DIAGNOSIS_SENTINEL",
  "SYNTHETIC_MEDICATION_SENTINEL",
  "SYNTHETIC_QUESTIONNAIRE_ANSWER_SENTINEL",
  "SYNTHETIC_CLINICIAN_NOTE_SENTINEL",
  "https://mdi-workflow.example.test/session",
  "SECRET_MDI_WORKFLOW_TOKEN",
  "raw_mdi_payload",
  "cus_dashboard_e2e",
  "sub_dashboard_e2e",
];

test.describe("MDI-backed dashboard and care workflow states", () => {
  test.use({
    extraHTTPHeaders: {
      [e2eAuthHeaderName]: e2eAuthToken,
    },
  });

  for (const scenario of [
    {
      name: "pending handoff",
      dashboard: dashboardFixture({
        billing: {
          canCancel: false,
          code: "billing_payment_method_needed",
          label: "Payment method needed",
          summary: "Add a payment method when the billing step is available.",
        },
        caseStatus: {
          code: "case_status_pending",
          label: "Pending",
          summary: "Your intake handoff is pending in the MDI care workflow.",
          updatedAt: now,
        },
      }),
      expected: ["Pending", "Payment method needed", "Open care workflow"],
    },
    {
      name: "billing-ready approval",
      dashboard: dashboardFixture({
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
      }),
      expected: ["Clinician review complete", "Billing active", "Cancel subscription"],
    },
    {
      name: "closed care request",
      dashboard: dashboardFixture({
        billing: {
          canCancel: false,
          code: "billing_canceled",
          label: "Billing canceled",
          summary: "This subscription has been canceled. Contact support for account and billing questions.",
        },
        caseStatus: {
          code: "case_status_cancelled",
          label: "Care request closed",
          summary: "This care request is closed. Contact support for account questions.",
          updatedAt: now,
        },
      }),
      expected: ["Care request closed", "Billing canceled", "Contact support"],
    },
    {
      name: "billing issue",
      dashboard: dashboardFixture({
        billing: {
          canCancel: false,
          code: "billing_issue",
          label: "Billing issue",
          summary: "Billing needs attention. No clinical details are shown here.",
        },
      }),
      expected: ["Clinical review", "Billing issue", "No clinical details are shown here."],
    },
  ]) {
    test(`${scenario.name} renders patient-safe dashboard state`, async ({ page }) => {
      const guard = await installOnboardingNetworkGuard(page, {
        "GET /api/dashboard": () => jsonApi(scenario.dashboard),
      });

      await page.goto("/dashboard");

      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
      for (const text of scenario.expected) {
        await expect(page.getByText(text).first()).toBeVisible();
      }
      await expect(page.getByText("SYNTHETIC_DIAGNOSIS_SENTINEL")).toHaveCount(0);
      await expect(page.getByText("SYNTHETIC_MEDICATION_SENTINEL")).toHaveCount(0);
      await expect(page.getByText("SYNTHETIC_QUESTIONNAIRE_ANSWER_SENTINEL")).toHaveCount(0);
      await expect(page.getByText("SYNTHETIC_CLINICIAN_NOTE_SENTINEL")).toHaveCount(0);
      await guard.expectNoForbiddenFragments(forbiddenFragments);
      guard.expectNoNetworkViolations();
      expect(guard.consoleErrors).toEqual([]);
    });
  }

  test("renders action-needed and workflow-link affordances without exposing MDI URLs", async ({
    page,
  }) => {
    const guard = await installOnboardingNetworkGuard(page, {
      "GET /api/dashboard": () => jsonApi(dashboardFixture({
        actions: [
          {
            code: "file_action_needed",
            href: "/api/dashboard/workflows/file_upload",
            label: "Upload requested file",
            summary: "Open the MDI care workflow to complete a requested upload.",
            tone: "action",
            workflow: "file_upload",
          },
          {
            code: "open_mdi_messages",
            href: "/api/dashboard/workflows/messaging",
            label: "Open messages",
            summary: "Open the MDI care workflow to read or send care-team messages.",
            tone: "action",
            workflow: "messaging",
          },
        ],
      })),
    });

    await page.goto("/dashboard");

    await expect(page.getByText("Upload requested file")).toBeVisible();
    await expect(page.getByText("Open messages")).toBeVisible();
    await expect(
      actionLink(page, "Open care workflow"),
    ).toHaveAttribute("href", "/api/dashboard/workflows/messaging");
    await expect(
      actionLink(page, "Upload requested file"),
    ).toHaveAttribute("href", "/api/dashboard/workflows/file_upload");
    await expect(
      actionLink(page, "Open messages"),
    ).toHaveAttribute("href", "/api/dashboard/workflows/messaging");
    await expect(page.locator("body")).not.toContainText("https://mdi-workflow.example.test");
    await expect(page.locator("body")).not.toContainText("SECRET_MDI_WORKFLOW_TOKEN");
    await guard.expectNoForbiddenFragments(forbiddenFragments);
    guard.expectNoNetworkViolations();
    expect(guard.consoleErrors).toEqual([]);
  });

  test("keeps provider-unavailable refresh failures recoverable and generic", async ({ page }) => {
    const rawVendorError = "raw_mdi_payload provider stack trace SECRET_MDI_WORKFLOW_TOKEN";
    const guard = await installOnboardingNetworkGuard(page, {
      "GET /api/dashboard": () => jsonApi({ error: rawVendorError }, 503),
    });

    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Status unavailable" })).toBeVisible();
    await expect(page.getByText("Billing unavailable")).toBeVisible();
    await expect(page.getByText("Care workflow unavailable")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(rawVendorError);
    await expectNoFragmentsInBrowserStorage(page, forbiddenFragments);
    guard.expectNoNetworkViolations();
    expect(guard.consoleErrors).toEqual([
      "Failed to load resource: the server responded with a status of 503 (Service Unavailable)",
    ]);
  });
});

function actionLink(page: Page, label: string) {
  return page.locator("li").filter({ hasText: label }).getByRole("link", { name: "Open" });
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
