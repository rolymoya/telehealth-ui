import { describe, expect, it, vi } from "vitest";
import AccountPage from "@/app/account/page";
import BillingPage from "@/app/billing/page";
import DashboardPage from "@/app/dashboard/page";
import IntakePage from "@/app/intake/page";
import ConsentPage from "@/app/onboarding/consent/page";
import MdiHandoffPage from "@/app/onboarding/mdi/page";
import { requireProtectedPageAccess } from "@/lib/protected-page";

vi.mock("@/lib/protected-page", () => ({
  requireProtectedPageAccess: vi.fn(async () => undefined),
}));

describe("protected app pages", () => {
  it.each([
    ["account", AccountPage, "/account"],
  ])("requires verified route access before rendering %s", async (_name, Page, pathname) => {
    vi.mocked(requireProtectedPageAccess).mockClear();

    await Page();

    expect(requireProtectedPageAccess).toHaveBeenCalledWith({ pathname });
  });

  it.each([
    ["billing", BillingPage],
    ["dashboard", DashboardPage],
    ["intake", IntakePage],
    ["consent", ConsentPage],
    ["mdi", MdiHandoffPage],
  ])("keeps %s as a static shell without server-side route access", async (_name, Page) => {
    vi.mocked(requireProtectedPageAccess).mockClear();

    await Page();

    expect(requireProtectedPageAccess).not.toHaveBeenCalled();
  });
});
