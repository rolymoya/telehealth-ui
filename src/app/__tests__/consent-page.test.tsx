import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ConsentPage from "@/app/onboarding/consent/page";
import { currentRequiredConsents } from "@/lib/consents";
import { requireProtectedPageAccess } from "@/lib/protected-page";

vi.mock("@/lib/protected-page", () => ({
  requireProtectedPageAccess: vi.fn(async () => undefined),
}));

vi.mock("@/app/onboarding/consent/actions", () => ({
  acceptCurrentConsentsAction: vi.fn(),
}));

describe("consent page", () => {
  it("renders current required consent versions with required acknowledgements", async () => {
    render(await ConsentPage({ searchParams: Promise.resolve({}) }));

    expect(requireProtectedPageAccess).toHaveBeenCalledWith({
      pathname: "/onboarding/consent",
    });
    for (const consent of currentRequiredConsents) {
      expect(screen.getByText(consent.label)).toBeInTheDocument();
      expect(screen.getByText(consent.version)).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", {
          name: new RegExp(`current ${escapeRegExp(consent.label)}`, "i"),
        }),
      ).toBeRequired();
    }
    const documentLinks = screen.getAllByRole("link", { name: "Open document" });
    expect(documentLinks).toHaveLength(currentRequiredConsents.length);
    documentLinks.forEach((link, index) => {
      expect(link).toHaveAttribute(
        "href",
        currentRequiredConsents[index]?.documentPath,
      );
    });
    expect(screen.getAllByText(/not FDA-approved/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/not Ozempic, Wegovy, Mounjaro, or Zepbound/i))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept and continue" }))
      .toBeInTheDocument();
  });

  it("renders a patient-safe acceptance error", async () => {
    render(await ConsentPage({
      searchParams: Promise.resolve({ error: "acceptance_failed" }),
    }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not record consent.",
    );
  });
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
