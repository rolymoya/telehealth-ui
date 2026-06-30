import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConsentPage from "@/app/onboarding/consent/page";
import {
  requiredConsentsBeforeMdi,
  requiredMedicationDisclosureConsents,
} from "@/lib/consents";

const mocks = vi.hoisted(() => ({
  resolveConsentDocumentsForDisplay: vi.fn(),
}));

vi.mock("@/lib/consent-acceptance", () => ({
  resolveConsentDocumentsForDisplay: mocks.resolveConsentDocumentsForDisplay,
}));

beforeEach(() => {
  mocks.resolveConsentDocumentsForDisplay.mockResolvedValue({
    ok: true,
    value: {
      gate: "pre_mdi",
      requiredConsents: requiredConsentsBeforeMdi(),
    },
  });
});

afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.clearAllMocks();
});

describe("consent page", () => {
  it("renders current required consent versions with required acknowledgements", async () => {
    render(await ConsentPage());

    const requiredConsents = requiredConsentsBeforeMdi();
    for (const consent of requiredConsents) {
      expect(screen.getByText(consent.label)).toBeInTheDocument();
      expect(screen.getByText(consent.version)).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", {
          name: new RegExp(`current ${escapeRegExp(consent.label)}`, "i"),
        }),
      ).toBeRequired();
    }
    const documentLinks = screen.getAllByRole("link", { name: "Open document" });
    expect(documentLinks).toHaveLength(requiredConsents.length);
    documentLinks.forEach((link, index) => {
      expect(link).toHaveAttribute(
        "href",
        requiredConsents[index]?.documentPath,
      );
    });
    expect(screen.getByRole("button", { name: "Accept and continue" }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", {
      name: /review telehealth and platform terms/i,
    })).toBeInTheDocument();
  });

  it("renders medication disclosure acknowledgements on the medication gate", async () => {
    window.history.replaceState({}, "", "/onboarding/consent?gate=medication");
    mocks.resolveConsentDocumentsForDisplay.mockResolvedValue({
      ok: true,
      value: {
        gate: "post_questionnaire_medication",
        requiredConsents: requiredMedicationDisclosureConsents({ treatment: "weight" }),
      },
    });

    render(await ConsentPage({
      searchParams: { gate: "medication" },
    }));

    const requiredConsents = requiredMedicationDisclosureConsents({ treatment: "weight" });
    for (const consent of requiredConsents) {
      expect(screen.getByText(consent.label)).toBeInTheDocument();
      expect(screen.getByText(consent.version)).toBeInTheDocument();
    }
    expect(screen.getAllByText(/not FDA-approved/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/not Ozempic, Wegovy, Mounjaro, or Zepbound/i))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", {
      name: /review medication disclosure/i,
    })).toBeInTheDocument();
  });

  it("does not render an empty consent form for an early medication gate", async () => {
    mocks.resolveConsentDocumentsForDisplay.mockResolvedValue({
      ok: true,
      value: {
        gate: "post_questionnaire_medication",
        requiredConsents: [],
      },
    });

    render(await ConsentPage({
      searchParams: { gate: "medication" },
    }));

    expect(screen.getByRole("heading", {
      name: /finish the clinical intake first/i,
    })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue clinical intake/i }))
      .toHaveAttribute("href", "/onboarding/mdi");
    expect(screen.queryByRole("button", { name: /accept and continue/i }))
      .not.toBeInTheDocument();
  });

  it("renders a patient-safe acceptance error", async () => {
    window.history.replaceState(
      {},
      "",
      "/onboarding/consent?error=acceptance_failed",
    );

    render(await ConsentPage());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not record consent.",
    );
  });
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
