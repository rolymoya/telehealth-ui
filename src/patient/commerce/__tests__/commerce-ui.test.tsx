import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckoutCompletion } from "@/patient/commerce/CheckoutCompletion";
import { CheckoutStart } from "@/patient/commerce/CheckoutStart";
import { PortalLaunch } from "@/patient/commerce/PortalLaunch";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkout-as-signup UI", () => {
  it("presents payment and account creation as one ecommerce checkout", () => {
    render(<MemoryRouter initialEntries={["/checkout?product=weight"]}><CheckoutStart /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: /one checkout/i })).toBeInTheDocument();
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByText(/apple pay appears automatically/i)).toBeInTheDocument();
    expect(screen.getByText(/no separate signup form or password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue to checkout/i })).toBeEnabled();
  });

  it("posts only the public catalog code and explicit checkout intent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "checkout_unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/checkout?product=hair"]}><CheckoutStart /></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: /continue to checkout/i }));
    expect(fetchMock).toHaveBeenCalledWith("/api/enrollment/checkout", expect.objectContaining({
      body: JSON.stringify({ catalogCode: "hair" }),
      credentials: "include",
      method: "POST",
      headers: expect.objectContaining({
        "content-type": "application/json",
        "x-apoth-checkout-intent": "create",
      }),
    }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /local checkout needs stripe test-mode configuration/i,
    );
  });

  it("moves from signed Stripe readiness to email OTP without displaying the email", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ status: "verification_ready" }))
      .mockResolvedValueOnce(jsonResponse({
        status: "verification_code_sent",
        transactionHandle: "transaction_handle_1234567890",
      }));
    const user = userEvent.setup();
    render(<MemoryRouter><CheckoutCompletion /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: /confirm the email used at checkout/i }))
      .toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /email me a code/i }));
    expect(await screen.findByLabelText("Six-digit code")).toHaveAttribute("autocomplete", "one-time-code");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/email-otp/start", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "x-apoth-checkout-intent": "start-email-otp",
      }),
    }));
  });

  it("uses a same-origin form navigation for the portal handoff", () => {
    const { container } = render(<MemoryRouter><PortalLaunch /></MemoryRouter>);
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("action", "/api/portal/launch");
    expect(form).toHaveAttribute("method", "post");
    expect(container.querySelector('input[name="intent"]')).toHaveValue("launch");
    expect(screen.getByText(/charged only if treatment is approved/i)).toBeInTheDocument();
  });
});

function jsonResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
