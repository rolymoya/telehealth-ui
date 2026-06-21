import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PatientDashboard } from "@/components/product/PatientDashboard";
import type { PatientDashboardViewModel } from "@/lib/patient-dashboard";

describe("PatientDashboard", () => {
  it("renders bounded dashboard codes and patient-safe workflow copy", () => {
    render(<PatientDashboard dashboard={dashboard()} />);

    expect(screen.getByRole("heading", { name: /^dashboard$/i })).toBeInTheDocument();
    expect(screen.getByText("case_status_clinical_review")).toBeInTheDocument();
    expect(screen.getByText("billing_pending_approval")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^open$/i })[0])
      .toHaveAttribute("href", "/api/dashboard/workflows/messaging");
    expect(screen.getByText(/medical questions stay in the care workflow/i))
      .toBeInTheDocument();

    const text = document.querySelector("main")?.textContent ?? "";
    expect(text).not.toContain("QUESTION_TEXT_SENTINEL");
    expect(text).not.toContain("ANSWER_VALUE_SENTINEL");
    expect(text).not.toContain("clinical note");
    expect(text).not.toContain("semaglutide");
    expect(text).not.toContain("prescription");
    expect(text).not.toContain("secret_token");
    expect(text).not.toContain("https://mdi.example.test");
  });
});

function dashboard(): PatientDashboardViewModel {
  return {
    account: {
      code: "manage_account",
      label: "Account",
      residencyState: "IL",
      status: "Clinical review",
    },
    actions: [
      {
        code: "open_mdi_messages",
        href: "/api/dashboard/workflows/messaging",
        label: "Open messages",
        summary: "Open the MDI care workflow to read or send care-team messages.",
        tone: "action",
        workflow: "messaging",
      },
    ],
    billing: {
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
      updatedAt: "2026-06-21T17:02:00.000Z",
    },
    generatedAt: "2026-06-21T17:00:00.000Z",
    support: {
      code: "contact_support",
      label: "Contact support",
      summary: "For account or billing help, contact Apoth support. Medical questions stay in the care workflow.",
    },
  };
}
