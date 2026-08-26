import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import WeightLossPage from "@/app/weight-loss/page";

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      matches: true,
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("marketing pages", () => {
  it("connects landing-page actions to real project routes", () => {
    render(<HomePage />);

    expect(screen.getAllByRole("link", { name: /see if online care fits/i })[0])
      .toHaveAttribute("href", "/get-started?product=weight");
    expect(screen.getAllByRole("link", { name: /login/i })[0])
      .toHaveAttribute("href", "/sign-in");
    expect(screen.getByRole("link", { name: "About" }))
      .toHaveAttribute("href", "/about");
    expect(screen.getByRole("link", { name: "Privacy policy" }))
      .toHaveAttribute("href", "/privacy");
  });

  it("keeps regulated weight-loss copy and routes eligibility into precheck", () => {
    render(<WeightLossPage />);

    expect(screen.getAllByRole("link", { name: /start the \$0 precheck/i })[0])
      .toHaveAttribute("href", "/get-started?product=weight");
    expect(screen.getAllByText(/compounded medications are not FDA-approved/i).length)
      .toBeGreaterThan(0);
    expect(screen.getByText(/technology platform, not a medical provider/i))
      .toBeInTheDocument();
  });

  it("opens a mobile menu with working project destinations", async () => {
    const user = userEvent.setup();
    render(<HomePage />);

    await user.click(screen.getByRole("button", { name: "Open menu" }));

    expect(screen.getByRole("button", { name: "Close menu" }))
      .toHaveAttribute("aria-expanded", "true");
    // Weight loss now sits under the Treatments group, labelled GLP-1s.
    expect(screen.getAllByRole("link", { name: "GLP-1s" }).at(-1))
      .toHaveAttribute("href", "/weight-loss");
    expect(screen.getAllByRole("link", { name: "NAD+" }).at(-1))
      .toHaveAttribute("href", "/nad");
    expect(screen.getAllByRole("link", { name: "See if online care fits" }).at(-1))
      .toHaveAttribute("href", "/get-started?product=weight");
  });
});
