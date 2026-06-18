import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import IntakePage from "@/app/intake/page";
import { IntakePrecheckClient } from "@/app/intake/IntakePrecheckClient";

describe("intake page", () => {
  it("renders the static intake shell", () => {
    render(<IntakePage />);

    expect(screen.getByRole("heading", {
      name: /confirm the basics before clinical intake/i,
    })).toBeInTheDocument();
    expect(screen.getByText(/Medical questionnaire answers are collected later/i))
      .toBeInTheDocument();
  });

  it("does not render precheck fields until bootstrap succeeds", async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));

    render(<IntakePrecheckClient fetchImpl={fetchMock as typeof fetch} />);

    expect(screen.getByText(/Confirming your account/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/State of residence/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/intake/bootstrap", {
      credentials: "include",
      headers: {
        accept: "application/json",
      },
      method: "GET",
    });
  });

  it("renders all-state precheck form after bootstrap and posts bounded JSON with CSRF", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === "/api/intake/bootstrap") {
        return jsonResponse({ csrfToken: "csrf_123", status: "ready_for_precheck" });
      }
      return jsonResponse({ status: "ready_for_mdi_intake" });
    });

    render(
      <IntakePrecheckClient
        fetchImpl={fetchMock as typeof fetch}
        navigate={navigate}
      />,
    );

    const stateSelect = await screen.findByLabelText(/State of residence/i);
    expect(stateSelect.querySelectorAll("option")).toHaveLength(51);

    await user.selectOptions(stateSelect, "IL");
    await user.type(screen.getByLabelText("Age"), "34");
    await user.selectOptions(screen.getByLabelText(/Care category/i), "weight");
    const noRadios = screen.getAllByRole("radio", { name: "No" });
    await user.click(noRadios[0]);
    await user.click(noRadios[1]);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/intake/precheck", expect.objectContaining({
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-apoth-csrf": "csrf_123",
        },
        method: "POST",
      }));
    });
    const precheckCall = fetchMock.mock.calls.find(
      ([url]) => String(url) === "/api/intake/precheck",
    );
    expect(JSON.parse(String(precheckCall?.[1]?.body))).toEqual({
      age: "34",
      blockingContraindication: "no",
      emergencySymptoms: "no",
      offering: "weight",
      state: "IL",
    });
    expect(String(precheckCall?.[0])).not.toContain("weight");
    expect(navigate).toHaveBeenCalledWith("/onboarding/mdi");
    expect(window.localStorage.getItem("age")).toBeNull();
    expect(window.localStorage.getItem("offering")).toBeNull();
    expect(window.localStorage.getItem("state")).toBeNull();
  });

  it("allows a bootstrap retry without retaining form values", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(
        { code: "temporary_unavailable" },
        { status: 503 },
      ))
      .mockResolvedValueOnce(jsonResponse({
        csrfToken: "csrf_retry",
        status: "ready_for_precheck",
      }));

    render(<IntakePrecheckClient fetchImpl={fetchMock as typeof fetch} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not prepare intake/i,
    );
    expect(screen.queryByLabelText(/State of residence/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByLabelText(/State of residence/i))
      .toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(window.localStorage.getItem("state")).toBeNull();
  });

  it("redirects already precheck-complete patients to the MDI step during bootstrap", async () => {
    const navigate = vi.fn();
    const fetchMock = vi.fn(async () => jsonResponse({
      csrfToken: "csrf_123",
      profile: {
        onboardingStatus: "intake_ready",
        residencyState: "IL",
      },
      status: "ready_for_precheck",
    }));

    render(
      <IntakePrecheckClient
        fetchImpl={fetchMock as typeof fetch}
        navigate={navigate}
      />,
    );

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/onboarding/mdi");
    });
    expect(screen.queryByLabelText(/State of residence/i)).not.toBeInTheDocument();
  });

  it("redirects to sign in when the submit session expires", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === "/api/intake/bootstrap") {
        return jsonResponse({ csrfToken: "csrf_123", status: "ready_for_precheck" });
      }
      return jsonResponse({ code: "missing_session" }, { status: 401 });
    });

    render(
      <IntakePrecheckClient
        fetchImpl={fetchMock as typeof fetch}
        navigate={navigate}
      />,
    );

    await user.selectOptions(
      await screen.findByLabelText(/State of residence/i),
      "IL",
    );
    await user.type(screen.getByLabelText("Age"), "34");
    await user.selectOptions(screen.getByLabelText(/Care category/i), "weight");
    const noRadios = screen.getAllByRole("radio", { name: "No" });
    await user.click(noRadios[0]);
    await user.click(noRadios[1]);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/sign-in?returnTo=%2Fintake");
    });
    expect(navigate).not.toHaveBeenCalledWith("/onboarding/consent");
  });

  it.each([
    {
      code: "emergency_symptoms",
      expected: /seek urgent or emergency care now/i,
      field: "emergencySymptoms",
    },
    {
      code: "blocking_contraindication",
      expected: /needs clinician review/i,
      field: "blockingContraindication",
    },
  ])("shows clinician-review guidance for $code", async ({ code, expected, field }) => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === "/api/intake/bootstrap") {
        return jsonResponse({ csrfToken: "csrf_123", status: "ready_for_precheck" });
      }
      return jsonResponse(
        { code, outcome: "needs_clinician_review" },
        { status: 409 },
      );
    });

    render(<IntakePrecheckClient fetchImpl={fetchMock as typeof fetch} />);

    await user.selectOptions(
      await screen.findByLabelText(/State of residence/i),
      "IL",
    );
    await user.type(screen.getByLabelText("Age"), "34");
    await user.selectOptions(screen.getByLabelText(/Care category/i), "weight");
    await user.click(radio(field, "Yes"));
    const otherField = field === "emergencySymptoms"
      ? "blockingContraindication"
      : "emergencySymptoms";
    await user.click(radio(otherField, "No"));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(screen.queryByText(/Ready\. Continue/i)).not.toBeInTheDocument();
  });
});

function radio(fieldName: string, label: "No" | "Yes") {
  const match = screen.getAllByRole("radio", { name: label })
    .find((input) => input.getAttribute("name") === fieldName);
  if (!match) {
    throw new Error(`Missing ${label} radio for ${fieldName}`);
  }
  return match;
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}
