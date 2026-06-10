import { describe, expect, it, vi } from "vitest";
import GetStartedPage from "@/app/get-started/page";
import { resolveOnboardingStartRedirect } from "@/lib/onboarding-start";

const redirectMock = vi.hoisted(() => vi.fn((destination: string) => {
  throw new Error(`redirect:${destination}`);
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/onboarding-start", () => ({
  resolveOnboardingStartRedirect: vi.fn(async () => ({
    ok: true,
    value: {
      destination: "/onboarding/consent",
    },
  })),
}));

describe("get started page", () => {
  it("resolves onboarding start and redirects to the returned step", async () => {
    await expect(GetStartedPage()).rejects.toThrow("redirect:/onboarding/consent");

    expect(resolveOnboardingStartRedirect).toHaveBeenCalledWith({
      pathname: "/get-started",
    });
  });
});
