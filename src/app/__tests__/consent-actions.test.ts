import { describe, expect, it, vi } from "vitest";
import { acceptCurrentConsentsAction } from "@/app/onboarding/consent/actions";
import { acceptCurrentConsents } from "@/lib/consent-acceptance";

const redirectMock = vi.hoisted(() => vi.fn((destination: string) => {
  throw new Error(`redirect:${destination}`);
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/consent-acceptance", () => ({
  acceptCurrentConsents: vi.fn(async () => ({
    ok: true,
    value: {
      destination: "/intake",
    },
  })),
}));

describe("consent acceptance action", () => {
  it("redirects to the next onboarding step after acceptance", async () => {
    const formData = new FormData();

    await expect(acceptCurrentConsentsAction(formData)).rejects.toThrow(
      "redirect:/intake",
    );
    expect(acceptCurrentConsents).toHaveBeenCalledWith({
      acknowledgements: formData,
    });
  });

  it("redirects back with a bounded error code when acceptance fails", async () => {
    vi.mocked(acceptCurrentConsents).mockResolvedValueOnce({
      ok: false,
      error: {
        kind: "validation_failed",
        message: "Required consent acknowledgement was missing",
      },
    });

    await expect(acceptCurrentConsentsAction(new FormData())).rejects.toThrow(
      "redirect:/onboarding/consent?error=acceptance_failed",
    );
  });
});
