import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutStart } from "@/patient/commerce/CheckoutStart";
import { PortalLaunch } from "@/patient/commerce/PortalLaunch";

beforeEach(() => {
  vi.stubEnv("VITE_APOTH_STAGE", "staging");
  vi.stubEnv("VITE_STRIPE_PUBLISHABLE_KEY", "pk_test_apoth_checkout");
  globalThis.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("checkout-as-signup UI", () => {
  it("fails closed before contacting checkout for a missing product", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    render(
      <MemoryRouter initialEntries={["/checkout"]}>
        <CheckoutStart productCode={null} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", {
      name: /couldn’t open secure checkout/i,
    })).toBeInTheDocument();
    expect(screen.getByText(/that plan is not available/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts only the active public product and opaque initialization key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "checkout_unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );
    render(
      <MemoryRouter initialEntries={["/checkout?product=weight"]}>
        <CheckoutStart productCode="weight" />
      </MemoryRouter>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/enrollment/checkout",
      expect.objectContaining({
        body: JSON.stringify({ product: "weight" }),
        credentials: "include",
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-apoth-checkout-initialization": expect.any(String),
        }),
      }),
    ));
    expect(await screen.findByText(
      /secure checkout is temporarily unavailable/i,
    )).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toEqual(
      expect.objectContaining({ "x-apoth-checkout-intent": expect.anything() }),
    );
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
