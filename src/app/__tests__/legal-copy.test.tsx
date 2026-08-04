import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AboutPage from "@/app/about/page";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import { currentRequiredConsents } from "@/lib/consents";

describe("legal copy thin-PHI posture", () => {
  it("states that the provider portal owns clinical intake while Apoth keeps only linkage", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByText(/selected provider portal is the clinical system of record/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Before production PHI is handled for the Physician Group/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Last updated · August 4, 2026/i))
      .toBeInTheDocument();
    expect(
      screen.getByText(
        /Apoth does not render or persist those questionnaire answers as its own local clinical record/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Payment processor metadata is limited to opaque, non-PHI identifiers/i),
    ).toBeInTheDocument();
  });

  it("keeps Terms platform and refund language aligned with the billing invariant", () => {
    render(<TermsPage />);

    expect(screen.getByText(/Apoth is a technology platform/i))
      .toBeInTheDocument();
    expect(screen.getByText(/Last updated · August 4, 2026/i))
      .toBeInTheDocument();
    expect(
      screen.getByText(/does not activate subscription billing before both the selected clinical approval event and your separate acceptance/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/payment method setup step shows \$0 due/i))
      .toBeInTheDocument();
    expect(
      screen.getByText(/documented in the Physician Group's medical record/i),
    ).toBeInTheDocument();
  });

  it("qualifies public state-availability copy", () => {
    render(<AboutPage />);

    expect(screen.getByText("Nationwide, where eligible.")).toBeInTheDocument();
    expect(screen.queryByText("All 50 states.")).not.toBeInTheDocument();
    expect(screen.queryByText(/in all 50 states/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/where licensure, clinical eligibility, and pharmacy shipping rules support care/i),
    ).toBeInTheDocument();
  });

  it("bumps only the changed platform terms and privacy notice consent versions", () => {
    expect(
      currentRequiredConsents.find(
        (consent) => consent.consentKind === "platform_terms",
      )?.version,
    ).toBe("terms-2026-08-staged-offer-v3");
    expect(
      currentRequiredConsents.find(
        (consent) => consent.consentKind === "privacy_notice",
      )?.version,
    ).toBe("privacy-2026-08-portal-boundary-v3");
    expect(
      currentRequiredConsents.find(
        (consent) => consent.consentKind === "telehealth_consent",
      )?.version,
    ).toBe("telehealth-2026-06-thin-phi-v2");
    expect(
      currentRequiredConsents.find(
        (consent) => consent.consentKind === "compounded_medication_disclosure",
      )?.version,
    ).toBe("compound-disclosure-2026-06-legal-v1");
  });
});
