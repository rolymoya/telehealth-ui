import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import GetStartedPage from "@/app/get-started/page";
import { GetStartedStartClient } from "@/app/get-started/GetStartedStartClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("get started page", () => {
  it("renders as a static start shell without clinical fields", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    render(<GetStartedPage />);

    expect(screen.getByRole("heading", { name: "Start with the privacy notice." }))
      .toBeInTheDocument();
    expect(screen.getByText(/answer a short precheck/i))
      .toBeInTheDocument();
    expect(screen.queryByLabelText(/condition|medication|symptom|diagnosis|questionnaire/i))
      .toBeNull();
  });

  it("shows precheck as the primary signed-out path", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(
      {
        primaryAction: {
          href: "/sign-up?returnTo=%2Fget-started",
          label: "Create account",
        },
        status: "account_required",
      },
      { status: 401 },
    ));

    render(<GetStartedStartClient fetchImpl={fetchMock as typeof fetch} />);

    expect(await screen.findByRole("link", { name: "Start precheck" }))
      .toHaveAttribute("href", "/intake");
    expect(screen.getByRole("link", { name: "Sign in" }))
      .toHaveAttribute("href", "/sign-in?returnTo=%2Fget-started");
    expect(fetchMock).toHaveBeenCalledWith("/api/onboarding/start", {
      credentials: "include",
      headers: {
        accept: "application/json",
      },
      method: "GET",
    });
  });

  it("redirects signed-in patients to the start API destination", async () => {
    const navigate = vi.fn();
    const fetchMock = vi.fn(async () => jsonResponse({
      destination: "/onboarding/consent?gate=medication",
      status: "ready",
    }));

    render(
      <GetStartedStartClient
        fetchImpl={fetchMock as typeof fetch}
        navigate={navigate}
      />,
    );

    await screen.findByText("Continuing your visit.");
    expect(navigate).toHaveBeenCalledWith("/onboarding/consent?gate=medication");
  });

  it("shows a retry state for provider failures without clinical fields", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: "temporary_unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ status: "account_required" }, { status: 401 }));

    render(<GetStartedStartClient fetchImpl={fetchMock as typeof fetch} />);

    expect(await screen.findByText(/could not check your visit status/i))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start precheck" }))
      .toHaveAttribute("href", "/intake");
    expect(screen.queryByLabelText(/condition|medication|symptom|diagnosis|questionnaire/i))
      .toBeNull();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("link", { name: "Sign in" }))
      .toHaveAttribute("href", "/sign-in?returnTo=%2Fget-started");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    status: 200,
    ...init,
  });
}
