import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckoutCompletion } from "@/patient/commerce/CheckoutCompletion";

vi.mock("@/components/auth/AuthPanel", () => ({
  AuthPanel: ({ initialEmail }: { initialEmail?: string }) => (
    <p>Account verification for {initialEmail ?? "unknown"}</p>
  ),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  globalThis.history.replaceState({}, "", "/");
});

describe("checkout completion", () => {
  it("cleans Stripe return data and waits for a later webhook before binding", async () => {
    vi.useFakeTimers();
    globalThis.history.replaceState(
      {},
      "",
      "/checkout/complete?redirect_status=succeeded#client_secret=forbidden",
    );
    let statusRequests = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        if (String(input) === "/api/enrollment/status") {
          statusRequests += 1;
          return jsonResponse(statusRequests === 1
            ? {
                identityBound: false,
                paymentSetupComplete: false,
                status: "checkout_session_pending",
              }
            : {
                identityBound: false,
                paymentSetupComplete: true,
                status: "payment_setup_complete",
              });
        }
        if (String(input) === "/api/enrollment/bind") {
          return jsonResponse({
            redirect: "/intake",
            status: "identity_bound",
          });
        }
        throw new Error(`Unexpected request: ${String(input)}`);
      },
    );

    renderCompletion();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusRequests).toBe(1);
    expect(globalThis.location.pathname).toBe("/checkout/complete");
    expect(globalThis.location.search).toBe("");
    expect(globalThis.location.hash).toBe("");
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/enrollment/bind",
      expect.anything(),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByText("Intake reached")).toBeInTheDocument();
    expect(statusRequests).toBe(2);
  });

  it("requires Cognito verification when the webhook wins the browser race", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/enrollment/status") {
        return jsonResponse({
          identityBound: false,
          paymentSetupComplete: true,
          status: "payment_setup_complete",
        });
      }
      if (String(input) === "/api/enrollment/bind") {
        return jsonResponse({ error: "authentication_required" }, 401);
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });

    renderCompletion({ checkoutEmail: "patient@example.com" });

    expect(await screen.findByText(
      "Account verification for patient@example.com",
    )).toBeInTheDocument();
    expect(screen.getByText(/payment method saved/i)).toBeInTheDocument();
  });
});

function renderCompletion(state?: object) {
  return render(
    <MemoryRouter initialEntries={[{
      pathname: "/checkout/complete",
      state,
    }]}>
      <Routes>
        <Route path="/checkout/complete" element={<CheckoutCompletion />} />
        <Route path="/intake" element={<p>Intake reached</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}
