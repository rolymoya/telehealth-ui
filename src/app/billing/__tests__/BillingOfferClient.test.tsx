import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BillingOfferClient } from "@/app/billing/activate/BillingOfferClient";

describe("approved billing offer", () => {
  it("shows the exact first and recurring charge and requires separate authorization", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        authorizationVersion: "billing-offer-v1",
        csrfToken: "csrf_offer_001",
        currency: "usd",
        interval: "month",
        offerId: "offer_0123456789abcdef0123456789abcdef",
        status: "offer_ready",
        unitAmountCents: 19_900,
      }))
      .mockResolvedValueOnce(jsonResponse({ status: "billing_active" }));

    render(<BillingOfferClient fetchImpl={fetchMock as typeof fetch} />);

    expect(await screen.findByText("Due when you confirm")).toBeInTheDocument();
    expect(screen.getByText("$199.00 monthly")).toBeInTheDocument();
    const authorization = screen.getByRole("checkbox", {
      name: /authorize Apoth to charge \$199\.00 today and \$199\.00 every month/i,
    });
    expect(authorization).not.toBeChecked();

    await user.click(authorization);
    await user.click(screen.getByRole("button", {
      name: /authorize \$199\.00 and start plan/i,
    }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/billing/offer",
      expect.objectContaining({
        body: JSON.stringify({
          offerId: "offer_0123456789abcdef0123456789abcdef",
          recurringAuthorization: "accepted",
        }),
        headers: {
          "content-type": "application/json",
          "x-apoth-csrf": "csrf_offer_001",
        },
        method: "POST",
      }),
    ));
    expect(await screen.findByRole("heading", {
      name: /approved plan is active/i,
    })).toBeInTheDocument();
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
    ...init,
  });
}
