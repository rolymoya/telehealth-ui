import { expect, test } from "@playwright/test";
import {
  consentAcknowledgementFieldName,
  requiredConsentsBeforeMdi,
  requiredConsentsForPrecheck,
  requiredMedicationDisclosureConsents,
} from "../../shared/consents";
import { e2eAuthHeaderName } from "../../src/lib/e2e-auth";
import {
  expectNoBillingOrStripeActivity,
  expectNoFragmentsInBrowserStorage,
  installOnboardingNetworkGuard,
  jsonApi,
  persistentApiMock,
  type ApiMockHandler,
  type ApiMockHandlers,
} from "./support/onboarding";

const e2eAuthToken = process.env.APOTH_E2E_AUTH_TOKEN;

if (!e2eAuthToken) {
  throw new Error("APOTH_E2E_AUTH_TOKEN must be set by Playwright config.");
}

const freeTextAnswer = "SYNTHETIC_FREE_TEXT_ALPHA";
const selectedOptionAnswer = {
  label: "Neutral option",
  optionId: "mdi_option_neutral_001",
};
const forbiddenAnswerFragments = [
  freeTextAnswer,
  selectedOptionAnswer.label,
  selectedOptionAnswer.optionId,
];
const now = "2026-06-23T12:00:00.000Z";

test.describe("intake, consent, eligibility, and MDI no-retention flow", () => {
  test("walks the staged anonymous-to-authenticated path without retaining transient answers", async ({ page }) => {
    test.setTimeout(60_000);
    const consentPosts: unknown[] = [];
    const privacyPosts: unknown[] = [];
    let privacyNoticeAccepted = false;
    const precheckFragments = ["41"];
    const demographicFragments = [
      "SynthFirstZeta",
      "SynthLastZeta",
      "1990-01-02",
      "synthetic.zeta@example.test",
      "312-555-0101",
      "1 Synthetic Way",
      "E2etown",
      "60601",
    ];
    const consentHandler: ApiMockHandler = async (request) => {
      const body = JSON.parse(request.postData() ?? "{}");
      consentPosts.push(body);
      return jsonApi({
        acceptedAt: now,
        destination: body.gate === "post_questionnaire_medication"
          ? "/dashboard"
          : "/intake",
        status: "accepted",
      });
    };
    const handlers: ApiMockHandlers = {
      "GET /api/onboarding/start": [
        () => jsonApi({ error: "authentication_required" }, 401),
        () => jsonApi({
          destination: "/onboarding/consent",
          status: "ready",
        }),
      ],
      "POST /api/intake/privacy-notice": async (request) => {
        privacyPosts.push(JSON.parse(request.postData() ?? "{}"));
        privacyNoticeAccepted = true;
        return jsonApi({ status: "privacy_notice_accepted" });
      },
      "POST /api/onboarding/consent": [consentHandler, consentHandler],
      "GET /api/intake/bootstrap": persistentApiMock((request) => {
        if (request.headers()[e2eAuthHeaderName] === e2eAuthToken) {
          return jsonApi({
            csrfToken: "csrf_intake_authed_e2e",
            mdiPatientCsrfToken: "csrf_mdi_patient_e2e",
            mdiPatientLinked: false,
            profile: {
              onboardingStatus: "intake_ready",
              residencyState: "IL",
            },
            status: "ready_for_precheck",
          });
        }
        if (!privacyNoticeAccepted) {
          return jsonApi(
            { code: "privacy_notice_required" },
            403,
          );
        }
        return jsonApi({
          csrfToken: "csrf_intake_e2e",
          status: "ready_for_anonymous_precheck",
        });
      }),
      "POST /api/intake/precheck": () => jsonApi({
        status: "ready_for_account_creation",
      }),
      "POST /api/onboarding/mdi/patient": () => jsonApi({
        redirect: "/onboarding/mdi",
        status: "linked",
      }),
      "GET /api/onboarding/mdi/bootstrap": () => jsonApi({
        csrfToken: "csrf_mdi_e2e",
        questionnaire: syntheticQuestionnaire(),
        status: "ready",
      }),
      "POST /api/onboarding/mdi/submit": () => jsonApi({
        linkage: {
          mdiCaseId: "mdi_case_e2e_001",
          mdiPatientId: "mdi_patient_e2e_001",
        },
        redirect: "/onboarding/consent?gate=medication",
        status: "submitted",
      }),
      "GET /api/dashboard": () => jsonApi(syntheticPendingDashboard()),
    };
    const guard = await installOnboardingNetworkGuard(
      page,
      handlers,
      mdiBootstrapAllowance(),
    );

    await page.goto("/get-started");
    await expect(page.getByRole("link", { name: "Start precheck" }))
      .toHaveAttribute("href", "/intake");
    await page.getByRole("link", { name: "Start precheck" }).click();

    await expect(page).toHaveURL(/\/intake$/);
    await expect(
      page.getByRole("heading", { name: "Review privacy before precheck." }),
    ).toBeVisible();
    await expect(page.getByLabel("State of residence")).toHaveCount(0);
    const privacyNotice = requiredConsentsForPrecheck()[0];
    await expect(page.getByText(privacyNotice.version)).toBeVisible();
    await page
      .getByRole("checkbox", {
        name: /reviewed the current privacy notice/i,
      })
      .check();
    await page.getByRole("button", { name: "Continue to precheck" }).click();

    expect(privacyPosts).toEqual([
      {
        acknowledgements: {
          [consentAcknowledgementFieldName(privacyNotice)]: "accepted",
        },
      },
    ]);

    await page.getByLabel("State of residence").selectOption("IL");
    await page.getByRole("spinbutton", { name: "Age" }).fill("41");
    await page.getByLabel("Care category").selectOption("weight");
    await page.locator('input[name="emergencySymptoms"][value="no"]').check();
    await page.locator('input[name="blockingContraindication"][value="no"]').check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(
      page.getByRole("heading", { name: "Create an account to continue." }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Create account" }))
      .toHaveAttribute("href", "/sign-up?returnTo=%2Fget-started");
    await expect(page.getByRole("link", { name: "Sign in" }))
      .toHaveAttribute("href", "/sign-in?returnTo=%2Fget-started");

    await page.setExtraHTTPHeaders({
      [e2eAuthHeaderName]: e2eAuthToken,
    });
    await page.goto("/get-started");
    await expect(page).toHaveURL(/\/onboarding\/consent$/);
    await expect(page.getByRole("heading", {
      name: "Review telehealth and platform terms.",
    })).toBeVisible();

    for (const consent of requiredConsentsBeforeMdi()) {
      await expect(page.getByText(consent.version)).toBeVisible();
      await page
        .getByRole("checkbox", {
          name: new RegExp(`current ${escapeRegExp(consent.label)}`, "i"),
        })
        .check();
    }
    await page.getByRole("button", { name: "Accept and continue" }).click();

    await expect(page).toHaveURL(/\/intake$/);
    expect(consentPosts).toEqual([
      {
        acknowledgements: Object.fromEntries(
          requiredConsentsBeforeMdi().map((consent) => [
            consentAcknowledgementFieldName(consent),
            "accepted",
          ]),
        ),
        gate: "pre_mdi",
      },
    ]);

    await expect(
      page.getByRole("heading", { name: "Add patient details for the clinical handoff." }),
    ).toBeVisible();
    await page.getByLabel("First name").fill("SynthFirstZeta");
    await page.getByLabel("Last name").fill("SynthLastZeta");
    await page.getByLabel("Date of birth").fill("1990-01-02");
    await page.getByLabel("Email").fill("synthetic.zeta@example.test");
    await page.getByLabel("Phone").fill("312-555-0101");
    await page.getByLabel("Clinical profile sex").selectOption("2");
    await page.getByLabel("Address", { exact: true }).fill("1 Synthetic Way");
    await page.getByLabel("City").fill("E2etown");
    await page.locator('form select[name="state"]').selectOption("IL");
    await page.getByLabel("ZIP code").fill("60601");
    await page.getByLabel("Care category").selectOption("weight");
    await page.getByRole("button", { name: "Continue to clinical intake" }).click();

    await expect(page).toHaveURL(/\/onboarding\/mdi$/);
    await expect(
      page.getByRole("heading", { name: "Complete your clinical intake." }),
    ).toBeVisible();
    await page.getByRole("radio", { name: selectedOptionAnswer.label }).check();
    await page.getByLabel(/2\. Optional setup note/i).fill(freeTextAnswer);
    await page.getByRole("button", { name: "Submit intake" }).click();

    await expect(page).toHaveURL(/\/onboarding\/consent\?gate=medication$/);
    await expect(page.getByRole("heading", {
      name: "Review medication disclosure.",
    })).toBeVisible();
    const medicationDisclosure = requiredMedicationDisclosureConsents({
      treatment: "weight",
    })[0];
    await expect(page.getByText(medicationDisclosure.version)).toBeVisible();
    await expect(page.getByText("Compounded medications are not FDA-approved."))
      .toBeVisible();
    await expect(page.getByText(freeTextAnswer)).toHaveCount(0);
    await guard.expectFragmentsConfined([
      {
        allowedRequestBodies: ["POST /api/intake/precheck"],
        fragments: precheckFragments,
        label: "precheck",
      },
      {
        allowedRequestBodies: ["POST /api/onboarding/mdi/patient"],
        fragments: demographicFragments,
        label: "demographics",
      },
      {
        allowedRequestBodies: ["POST /api/onboarding/mdi/submit"],
        fragments: forbiddenAnswerFragments,
        label: "questionnaire",
      },
    ]);

    const submitCapture = guard.captures.find(
      (capture) => capture.method === "POST" &&
        capture.path === "/api/onboarding/mdi/submit",
    );
    expect(submitCapture?.requestBody).toContain(freeTextAnswer);
    expect(submitCapture?.requestBody).toContain(selectedOptionAnswer.label);
    expect(submitCapture?.requestBody).toContain(selectedOptionAnswer.optionId);
    expect(submitCapture?.responseBody).not.toContain(freeTextAnswer);
    expect(submitCapture?.responseBody).not.toContain(selectedOptionAnswer.label);
    expect(submitCapture?.responseBody).not.toContain(selectedOptionAnswer.optionId);

    await page
      .getByRole("checkbox", {
        name: new RegExp(`current ${escapeRegExp(medicationDisclosure.label)}`, "i"),
      })
      .check();
    await page.getByRole("button", { name: "Accept and continue" }).click();

    await expect.poll(() => consentPosts.length).toBe(2);
    expect(consentPosts).toEqual([
      {
        acknowledgements: Object.fromEntries(
          requiredConsentsBeforeMdi().map((consent) => [
            consentAcknowledgementFieldName(consent),
            "accepted",
          ]),
        ),
        gate: "pre_mdi",
      },
      {
        acknowledgements: {
          [consentAcknowledgementFieldName(medicationDisclosure)]: "accepted",
        },
        gate: "post_questionnaire_medication",
      },
    ]);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Clinical review" }))
      .toBeVisible();
    await expect(page.getByText(freeTextAnswer)).toHaveCount(0);
    await guard.expectFragmentsConfined([
      {
        allowedRequestBodies: ["POST /api/intake/precheck"],
        fragments: precheckFragments,
        label: "precheck",
      },
      {
        allowedRequestBodies: ["POST /api/onboarding/mdi/patient"],
        fragments: demographicFragments,
        label: "demographics",
      },
      {
        allowedRequestBodies: ["POST /api/onboarding/mdi/submit"],
        fragments: forbiddenAnswerFragments,
        label: "questionnaire",
      },
    ]);
    guard.expectNoNetworkViolations();
    expect(guard.consoleErrors.filter((error) =>
      !isExpectedAuthGateConsoleError(error),
    )).toEqual([]);
  });

  test("keeps invalid residency input local and never reaches billing", async ({ page }) => {
    const handlers: ApiMockHandlers = {
      "GET /api/intake/bootstrap": () => jsonApi({
        csrfToken: "csrf_intake_e2e",
        status: "ready_for_precheck",
      }),
    };
    const guard = await installOnboardingNetworkGuard(
      page,
      handlers,
      mdiBootstrapAllowance(),
    );

    await page.goto("/intake");
    await page.getByRole("spinbutton", { name: "Age" }).fill("34");
    await page.getByLabel("Care category").selectOption("weight");
    await page.locator('input[name="emergencySymptoms"][value="no"]').check();
    await page.locator('input[name="blockingContraindication"][value="no"]').check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page).toHaveURL(/\/intake$/);
    await expect(page.locator('select[name="state"]')).toBeVisible();
    expect(guard.captures.map((capture) => `${capture.method} ${capture.path}`))
      .toEqual(["GET /api/intake/bootstrap"]);
    expectNoBillingOrStripeActivity(guard.captures);
    guard.expectNoNetworkViolations();
    expect(guard.consoleErrors).toEqual([]);
  });

  test("stops ineligible precheck before any billing or Stripe activity", async ({ page }) => {
    const handlers: ApiMockHandlers = {
      "GET /api/intake/bootstrap": () => jsonApi({
        csrfToken: "csrf_intake_e2e",
        status: "ready_for_precheck",
      }),
      "POST /api/intake/precheck": () => jsonApi(
        {
          code: "under_18",
          outcome: "ineligible",
        },
        409,
      ),
    };
    const guard = await installOnboardingNetworkGuard(
      page,
      handlers,
      mdiBootstrapAllowance(),
    );

    await page.goto("/intake");
    await page.getByLabel("State of residence").selectOption("IL");
    await page.getByRole("spinbutton", { name: "Age" }).fill("17");
    await page.getByLabel("Care category").selectOption("weight");
    await page.locator('input[name="emergencySymptoms"][value="no"]').check();
    await page.locator('input[name="blockingContraindication"][value="no"]').check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.locator('p[role="alert"]')).toContainText(
      "Apoth intake is for adults 18 and older.",
    );
    await expect(page).toHaveURL(/\/intake$/);
    expectNoBillingOrStripeActivity(guard.captures);
    guard.expectNoNetworkViolations();
  });

  test("returns to privacy notice when anonymous privacy evidence expires during precheck", async ({ page }) => {
    const handlers: ApiMockHandlers = {
      "GET /api/intake/bootstrap": () => jsonApi({
        csrfToken: "csrf_intake_e2e",
        status: "ready_for_precheck",
      }),
      "POST /api/intake/precheck": () => jsonApi(
        { code: "privacy_notice_required" },
        403,
      ),
    };
    const guard = await installOnboardingNetworkGuard(
      page,
      handlers,
      mdiBootstrapAllowance(),
    );

    await page.goto("/intake");
    await page.getByLabel("State of residence").selectOption("IL");
    await page.getByRole("spinbutton", { name: "Age" }).fill("34");
    await page.getByLabel("Care category").selectOption("weight");
    await page.locator('input[name="emergencySymptoms"][value="no"]').check();
    await page.locator('input[name="blockingContraindication"][value="no"]').check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page).toHaveURL(/\/intake$/);
    await expect(
      page.getByRole("heading", { name: "Review privacy before precheck." }),
    ).toBeVisible();
    await expect(page.getByLabel("State of residence")).toHaveCount(0);
    expect(guard.captures.map((capture) => `${capture.method} ${capture.path}`))
      .toEqual(["GET /api/intake/bootstrap", "POST /api/intake/precheck"]);
    expectNoBillingOrStripeActivity(guard.captures);
    guard.expectNoNetworkViolations();
  });

  test("shows patient-safe MDI maintenance copy without creating submit traffic", async ({ page }) => {
    await page.setExtraHTTPHeaders({
      [e2eAuthHeaderName]: e2eAuthToken,
    });
    const handlers: ApiMockHandlers = {
      "GET /api/onboarding/mdi/bootstrap": () => jsonApi(
        { code: "provider_unavailable" },
        503,
      ),
    };
    const guard = await installOnboardingNetworkGuard(
      page,
      handlers,
      mdiBootstrapAllowance(),
    );

    await page.goto("/onboarding/mdi");

    await expect(page.locator('p[role="alert"]')).toContainText(
      "The MDI workflow is temporarily unavailable.",
    );
    await expect(page.getByText("No questionnaire answers were saved by this page."))
      .toBeVisible();
    expect(guard.captures.map((capture) => `${capture.method} ${capture.path}`))
      .toEqual(["GET /api/onboarding/mdi/bootstrap"]);
    await guard.expectNoForbiddenFragments(forbiddenAnswerFragments);
    guard.expectNoNetworkViolations();
  });

  test("keeps MDI submit failures retry-safe and out of persistent storage", async ({ page }) => {
    await page.setExtraHTTPHeaders({
      [e2eAuthHeaderName]: e2eAuthToken,
    });
    const handlers: ApiMockHandlers = {
      "GET /api/onboarding/mdi/bootstrap": [
        () => jsonApi({
          csrfToken: "csrf_mdi_e2e",
          questionnaire: syntheticQuestionnaire(),
          status: "ready",
        }),
        () => jsonApi({
          csrfToken: "csrf_mdi_retry_e2e",
          questionnaire: syntheticQuestionnaire(),
          status: "ready",
        }),
      ],
      "POST /api/onboarding/mdi/submit": () => jsonApi(
        { code: "provider_unavailable" },
        503,
      ),
    };
    const guard = await installOnboardingNetworkGuard(
      page,
      handlers,
      mdiBootstrapAllowance(),
    );

    await page.goto("/onboarding/mdi");
    await page.getByRole("radio", { name: selectedOptionAnswer.label }).check();
    await page.getByLabel(/2\. Optional setup note/i).fill(freeTextAnswer);
    await page.getByRole("button", { name: "Submit intake" }).click();

    await expect(page.locator('p[role="alert"]')).toContainText(
      "The MDI workflow is temporarily unavailable.",
    );
    await expect(page.getByText(freeTextAnswer)).toHaveCount(0);
    await expectNoFragmentsInBrowserStorage(page, forbiddenAnswerFragments);
    await guard.expectNoForbiddenFragments(forbiddenAnswerFragments);

    await page.getByRole("button", { name: "Try again" }).click();

    await expect(
      page.getByRole("heading", { name: "Complete your clinical intake." }),
    ).toBeVisible();
    await expect(page.getByLabel(/2\. Optional setup note/i)).toHaveValue("");
    await guard.expectNoForbiddenFragments(forbiddenAnswerFragments);
    guard.expectNoNetworkViolations();
  });
});

function syntheticQuestionnaire() {
  return {
    caseId: "mdi_case_e2e_001",
    patientId: "mdi_patient_e2e_001",
    questionnaireId: "mdi_questionnaire_e2e_001",
    questions: [
      {
        controlType: "single_select",
        options: [
          {
            label: selectedOptionAnswer.label,
            optionId: selectedOptionAnswer.optionId,
          },
          {
            label: "Alternate option",
            optionId: "mdi_option_neutral_002",
          },
        ],
        questionId: "mdi_question_preference_001",
        required: true,
        text: "Workflow preference check",
      },
      {
        constraints: {
          maxLength: 120,
        },
        controlType: "free_text",
        questionId: "mdi_question_note_001",
        required: true,
        text: "Optional setup note",
      },
    ],
  };
}

function isExpectedAuthGateConsoleError(error: string) {
  return /^Failed to load resource: the server responded with a status of (401|403) \((Unauthorized|Forbidden)\)$/
    .test(error);
}

function mdiBootstrapAllowance() {
  return {
    allowedMdiBootstrapResponseFragments: [
      selectedOptionAnswer.label,
      selectedOptionAnswer.optionId,
    ],
  };
}

function syntheticPendingDashboard() {
  return {
    account: {
      code: "manage_account",
      label: "Account",
      residencyState: "IL",
      status: "Onboarding in progress",
    },
    actions: [
      {
        code: "action_needed_waiting",
        label: "No action needed",
        summary: "Dashboard details will update as the care workflow progresses.",
        tone: "deferred",
      },
    ],
    billing: {
      canCancel: false,
      code: "billing_pending_approval",
      label: "Billing pending approval",
      summary: "Subscription billing waits until the clinical workflow allows it.",
    },
    care: {
      followUp: {
        code: "care_workflow_unavailable",
        label: "Care workflow pending",
        summary: "Care workflow access will appear when it is available.",
        tone: "deferred",
      },
      refills: {
        code: "refills_deferred",
        label: "Refills unavailable",
        summary: "Refills are not available at this step.",
        tone: "deferred",
      },
    },
    caseStatus: {
      code: "case_status_clinical_review",
      label: "Clinical review",
      summary: "Your intake is with the independent clinical group.",
      updatedAt: now,
    },
    generatedAt: now,
    support: {
      code: "contact_support",
      label: "Contact support",
      summary: "For account or billing help, contact Apoth support.",
    },
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
