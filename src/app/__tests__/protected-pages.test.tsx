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
    ["billing", BillingPage, "/billing"],
    ["dashboard", DashboardPage, "/dashboard"],
    ["intake", IntakePage, "/intake"],
    ["consent", ConsentPage, "/onboarding/consent"],
    ["mdi", MdiHandoffPage, "/onboarding/mdi"],
  ])("requires verified route access before rendering %s", async (_name, Page, pathname) => {
    vi.mocked(requireProtectedPageAccess).mockClear();

    await Page();

    expect(requireProtectedPageAccess).toHaveBeenCalledWith({ pathname });
  });
});
