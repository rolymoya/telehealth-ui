import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillingSetupClient } from "../BillingSetupClient";

describe("BillingSetupClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("disables preparation while the hosted Checkout request is in flight", async () => {
    const user = userEvent.setup();
    let resolveFetch: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BillingSetupClient />);
    await user.click(screen.getByRole("button", { name: "Prepare payment method" }));
    await user.click(screen.getByRole("button", { name: "Preparing" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Preparing" })).toBeDisabled();

    resolveFetch(jsonResponse({
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_opaque_001",
      status: "checkout_session_created",
    }));
  });

  it("shows a distinct declined support path without creating active-billing copy", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      error: "clinical_declined",
    }, 409)));

    render(<BillingSetupClient />);
    await user.click(screen.getByRole("button", { name: "Prepare payment method" }));

    expect(await screen.findByRole("heading", {
      name: "Billing is not available for this case.",
    })).toBeInTheDocument();
    expect(screen.getByText(/No charge or active subscription was created/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
  });

  it("redirects only for a valid hosted Checkout setup response and does not render the URL", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      checkoutSessionId: "cs_opaque_001",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_opaque_001",
      status: "checkout_session_created",
    })));

    render(<BillingSetupClient navigate={navigate} />);
    await user.click(screen.getByRole("button", { name: "Prepare payment method" }));

    expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_opaque_001");
    expect(screen.queryByText(/cs_opaque_001/)).not.toBeInTheDocument();
  });

  it("treats malformed successful responses as unavailable", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      status: "checkout_session_created",
    })));

    render(<BillingSetupClient />);
    await user.click(screen.getByRole("button", { name: "Prepare payment method" }));

    expect(await screen.findByRole("heading", {
      name: "Billing setup is temporarily unavailable.",
    })).toBeInTheDocument();
  });

  it("does not redirect to non-Stripe checkout URLs", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      checkoutUrl: "https://payments.example/c/pay/cs_opaque_001",
      status: "checkout_session_created",
    })));

    render(<BillingSetupClient navigate={navigate} />);
    await user.click(screen.getByRole("button", { name: "Prepare payment method" }));

    expect(navigate).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", {
      name: "Billing setup is temporarily unavailable.",
    })).toBeInTheDocument();
  });

  it("sends expired sessions back through sign-in with a billing return path", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      error: "authentication_required",
    }, 401)));

    render(<BillingSetupClient navigate={navigate} />);
    await user.click(screen.getByRole("button", { name: "Prepare payment method" }));

    expect(navigate).toHaveBeenCalledWith("/sign-in?returnTo=%2Fbilling");
  });
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
