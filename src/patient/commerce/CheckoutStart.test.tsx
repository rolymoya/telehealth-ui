import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutStart } from "@/patient/commerce/CheckoutStart";

const stripeMocks = vi.hoisted(() => ({
  canConfirm: true,
  confirm: vi.fn(),
  loadStripe: vi.fn(() => Promise.resolve({})),
  totalAmount: "$0.00",
  updateEmail: vi.fn(),
}));

vi.mock("@stripe/stripe-js/pure", () => ({
  loadStripe: stripeMocks.loadStripe,
}));

vi.mock("@stripe/react-stripe-js/checkout", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    CheckoutProvider: ({ children }: { children: React.ReactNode }) => children,
    ExpressCheckoutElement: ({
      onConfirm,
      onReady,
    }: {
      onConfirm: (event: object) => void;
      onReady: (event: { availablePaymentMethods: { applePay: boolean } }) => void;
    }) => {
      React.useEffect(() => {
        onReady({ availablePaymentMethods: { applePay: true } });
      }, []);
      return (
        <button type="button" onClick={() => onConfirm({})}>
          Apple Pay
        </button>
      );
    },
    PaymentElement: ({ onReady }: { onReady: () => void }) => {
      React.useEffect(() => {
        onReady();
      }, []);
      return <div aria-label="Stripe payment form" />;
    },
    useCheckout: () => ({
      checkout: {
        canConfirm: stripeMocks.canConfirm,
        confirm: stripeMocks.confirm,
        total: { total: { amount: stripeMocks.totalAmount } },
        updateEmail: stripeMocks.updateEmail,
      },
      type: "success",
    }),
  };
});

describe("custom checkout start", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_APOTH_STAGE", "staging");
    vi.stubEnv("VITE_STRIPE_PUBLISHABLE_KEY", "pk_test_apoth_checkout");
    globalThis.sessionStorage.clear();
    globalThis.localStorage.clear();
    stripeMocks.canConfirm = true;
    stripeMocks.confirm.mockReset();
    stripeMocks.confirm.mockResolvedValue({ type: "success" });
    stripeMocks.totalAmount = "$0.00";
    stripeMocks.updateEmail.mockReset();
    stripeMocks.updateEmail.mockResolvedValue({ type: "success" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("shows the explicit plan and confirms once after email and consent", async () => {
    const clientSecret = "cs_test_enrollment_secret_checkoutsecret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        const path = String(input);
        if (path === "/api/enrollment/checkout") {
          return jsonResponse({
            clientSecret,
            status: "checkout_session_created",
            uiMode: "custom",
          });
        }
        if (path === "/api/enrollment/consent") {
          return jsonResponse({
            acceptedAt: "2026-07-29T18:00:00.000Z",
            consentVersion: "checkout-2026-07-29",
            status: "consent_recorded",
          });
        }
        throw new Error(`Unexpected request: ${path}`);
      },
    );
    const user = userEvent.setup();

    renderCheckout("weight");

    expect(await screen.findByRole("heading", {
      name: "Set up your account. Pay nothing today.",
    })).toBeInTheDocument();
    expect(screen.getByText("$199–$299")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    expect(screen.getByText("Apple Pay")).toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", { name: "Email address" }),
      "patient@example.com",
    );
    await user.click(screen.getByRole("checkbox"));
    const submit = screen.getByRole("button", {
      name: /create account and continue/i,
    });
    await user.dblClick(submit);

    await waitFor(() => expect(stripeMocks.confirm).toHaveBeenCalledTimes(1));
    expect(stripeMocks.confirm).toHaveBeenCalledWith({
      redirect: "if_required",
    });
    expect(stripeMocks.updateEmail).toHaveBeenCalledWith("patient@example.com");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/enrollment/consent",
      expect.objectContaining({ method: "POST" }),
    );
    expect(globalThis.localStorage.getItem("checkout")).toBeNull();
    expect(JSON.stringify(globalThis.localStorage)).not.toContain(clientSecret);
    expect(JSON.stringify(globalThis.sessionStorage)).not.toContain(clientSecret);
    expect(screen.getByText("Intake reached")).toBeInTheDocument();
  });

  it("uses Stripe's session total and waits until the session can confirm", async () => {
    stripeMocks.canConfirm = false;
    stripeMocks.totalAmount = "$7.25";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      clientSecret: "cs_test_enrollment_secret_checkoutsecret",
      status: "checkout_session_created",
      uiMode: "custom",
    }));
    const user = userEvent.setup();

    renderCheckout("weight");

    expect(await screen.findByText("$7.25")).toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: /create account and continue/i,
    })).toBeDisabled();
    await user.type(
      screen.getByRole("textbox", { name: "Email address" }),
      "patient@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Apple Pay" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Complete all required payment details before continuing.",
    );
    expect(stripeMocks.confirm).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/enrollment/consent",
      expect.anything(),
    );
  });

  it("shows a thrown Stripe confirmation message instead of a connection error", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        if (String(input) === "/api/enrollment/checkout") {
          return jsonResponse({
            clientSecret: "cs_test_enrollment_secret_checkoutsecret",
            status: "checkout_session_created",
            uiMode: "custom",
          });
        }
        return jsonResponse({ status: "consent_recorded" });
      },
    );
    stripeMocks.confirm.mockRejectedValue(
      new Error("Complete the required payment fields and try again."),
    );
    const user = userEvent.setup();

    renderCheckout("weight");
    await screen.findByText("$0.00");
    await user.type(
      screen.getByRole("textbox", { name: "Email address" }),
      "patient@example.com",
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", {
      name: /create account and continue/i,
    }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Complete the required payment fields and try again.",
    );
    expect(screen.queryByText(/connection was interrupted/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/enrollment/consent",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("fails closed when a public Stripe key is missing", async () => {
    vi.stubEnv("VITE_STRIPE_PUBLISHABLE_KEY", "");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    renderCheckout("weight");

    expect(await screen.findByText(
      "Secure checkout is not configured for this environment.",
    )).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown product before contacting enrollment APIs", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    renderCheckout("hair");

    expect(screen.getByText(/that plan is not available/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function renderCheckout(productCode: string) {
  return render(
    <MemoryRouter initialEntries={["/checkout"]}>
      <Routes>
        <Route path="/checkout" element={<CheckoutStart productCode={productCode} />} />
        <Route path="/checkout/complete" element={<p>Intake reached</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
