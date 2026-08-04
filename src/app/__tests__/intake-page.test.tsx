import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import IntakePage from "@/app/intake/page";
import { IntakePrecheckClient } from "@/app/intake/IntakePrecheckClient";

describe("intake page", () => {
  it("renders the static intake shell", () => {
    render(<IntakePage />);

    expect(screen.getByRole("heading", {
      name: /privacy notice, then a short precheck/i,
    })).toBeInTheDocument();
    expect(screen.getByText(/Medical questionnaire answers are collected later in the provider portal/i))
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

  it("requires privacy notice acknowledgement before rendering precheck fields", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(
        { code: "privacy_notice_required" },
        { status: 403 },
      ))
      .mockResolvedValueOnce(jsonResponse({ status: "privacy_notice_accepted" }))
      .mockResolvedValueOnce(jsonResponse({
        csrfToken: "csrf_after_privacy",
        status: "ready_for_precheck",
      }));

    render(<IntakePrecheckClient fetchImpl={fetchMock as typeof fetch} />);

    expect(await screen.findByRole("heading", {
      name: /review privacy before precheck/i,
    })).toBeInTheDocument();
    expect(screen.queryByLabelText(/State of residence/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open privacy notice/i }))
      .toHaveAttribute("href", "/privacy");

    await user.click(screen.getByRole("checkbox", {
      name: /reviewed the current privacy notice/i,
    }));
    await user.click(screen.getByRole("button", { name: /continue to precheck/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/intake/privacy-notice", expect.objectContaining({
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }));
    });
    const privacyCall = fetchMock.mock.calls.find(
      ([url]) => String(url) === "/api/intake/privacy-notice",
    );
    expect(JSON.stringify(JSON.parse(String(privacyCall?.[1]?.body))))
      .toContain("privacy_notice");
    expect(await screen.findByLabelText(/State of residence/i))
      .toBeInTheDocument();
  });

  it("renders all-state precheck form after bootstrap and posts bounded JSON with CSRF", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === "/api/intake/bootstrap") {
        return jsonResponse({ csrfToken: "csrf_123", status: "ready_for_precheck" });
      }
      if (String(input) === "/api/intake/precheck") {
        return jsonResponse({
          mdiPatientCsrfToken: "csrf_mdi_patient",
          status: "ready_for_mdi_intake",
        });
      }
      return jsonResponse({ status: "unexpected_request" }, { status: 500 });
    });

    render(
      <IntakePrecheckClient
        fetchImpl={fetchMock as typeof fetch}
        navigate={navigate}
      />,
    );

    const stateSelect = await screen.findByLabelText(/State of residence/i);
    expect(stateSelect.querySelectorAll("option")).toHaveLength(51);
    expect(screen.queryByRole("option", { name: "Peptides" })).not.toBeInTheDocument();

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
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/portal/launch"));
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/onboarding/mdi/patient",
      expect.anything(),
    );
    expect(screen.queryByLabelText(/first name|date of birth|address|clinical profile sex/i))
      .not.toBeInTheDocument();
    expect(window.localStorage.getItem("age")).toBeNull();
    expect(window.localStorage.getItem("offering")).toBeNull();
    expect(window.localStorage.getItem("state")).toBeNull();
    expect(window.localStorage.getItem("patient@example.test")).toBeNull();
  });

  it("uses get-started auth return links after anonymous precheck succeeds", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === "/api/intake/bootstrap") {
        return jsonResponse({ csrfToken: "csrf_anon", status: "ready_for_precheck" });
      }
      return jsonResponse({ status: "ready_for_mdi_intake" });
    });

    render(
      <IntakePrecheckClient
        fetchImpl={fetchMock as typeof fetch}
        productCode="weight"
      />,
    );

    await user.selectOptions(
      await screen.findByLabelText(/State of residence/i),
      "IL",
    );
    await user.type(screen.getByLabelText("Age"), "34");
    expect(screen.getByText("Weight management")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Care category/i)).not.toBeInTheDocument();
    const noRadios = screen.getAllByRole("radio", { name: "No" });
    await user.click(noRadios[0]);
    await user.click(noRadios[1]);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", {
      name: /verify your email to continue/i,
    })).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email me a code" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /password for an existing account/i }))
      .toHaveAttribute("href", "/sign-in?returnTo=%2Fget-started%3Fproduct%3Dweight");
  });

  it("hands authenticated weight patients to the provider portal without rendering a clinical profile form", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/intake/bootstrap") {
        return jsonResponse({ csrfToken: "csrf_123", status: "ready_for_precheck" });
      }
      return jsonResponse({
        mdiPatientCsrfToken: "legacy_token_not_used",
        status: "ready_for_provider_portal",
      });
    });

    render(
      <IntakePrecheckClient
        fetchImpl={fetchMock as typeof fetch}
        navigate={navigate}
        productCode="weight"
      />,
    );

    await user.selectOptions(await screen.findByLabelText(/State of residence/i), "IL");
    await user.type(screen.getByLabelText("Age"), "34");
    const noRadios = screen.getAllByRole("radio", { name: "No" });
    await user.click(noRadios[0]);
    await user.click(noRadios[1]);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/portal/launch"));
    expect(screen.queryByRole("heading", {
      name: /add patient details for the clinical handoff/i,
    })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/onboarding/mdi/patient",
      expect.anything(),
    );
  });

  it("returns to privacy notice when privacy expires during precheck submit", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === "/api/intake/bootstrap") {
        return jsonResponse({ csrfToken: "csrf_123", status: "ready_for_precheck" });
      }
      return jsonResponse(
        { code: "privacy_notice_required" },
        { status: 403 },
      );
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

    expect(await screen.findByRole("heading", {
      name: /review privacy before precheck/i,
    })).toBeInTheDocument();
    expect(screen.queryByLabelText(/State of residence/i)).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalledWith("/onboarding/consent");
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

  it("redirects already linked precheck-complete patients to the provider portal during bootstrap", async () => {
    const navigate = vi.fn();
    const fetchMock = vi.fn(async () => jsonResponse({
      csrfToken: "csrf_123",
      profile: {
        onboardingStatus: "intake_ready",
        residencyState: "IL",
      },
      mdiPatientLinked: true,
      status: "ready_for_precheck",
    }));

    render(
      <IntakePrecheckClient
        fetchImpl={fetchMock as typeof fetch}
        navigate={navigate}
      />,
    );

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/portal/launch");
    });
    expect(screen.queryByLabelText(/State of residence/i)).not.toBeInTheDocument();
  });

  it("never renders a local patient profile for precheck-complete patients", async () => {
    const navigate = vi.fn();
    const fetchMock = vi.fn(async () => jsonResponse({
      csrfToken: "csrf_123",
      mdiPatientCsrfToken: "csrf_mdi_patient",
      mdiPatientLinked: false,
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

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/portal/launch"));
    expect(screen.queryByRole("heading", {
      name: /add patient details for the clinical handoff/i,
    })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/State of residence/i)).not.toBeInTheDocument();
  });

  it("shows account CTAs when anonymous precheck reaches auth", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === "/api/intake/bootstrap") {
        return jsonResponse({ csrfToken: "csrf_123", status: "ready_for_precheck" });
      }
      if (String(input) === "/api/auth/email-otp/start") {
        return jsonResponse({
          status: "verification_code_sent",
          transactionHandle: "otp_handle_0123456789abcdef",
        });
      }
      if (String(input) === "/api/auth/email-otp/confirm") {
        return jsonResponse({ status: "account_verified" });
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

    expect(await screen.findByRole("heading", {
      name: /verify your email to continue/i,
    })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /password for an existing account/i }))
      .toHaveAttribute("href", "/sign-in?returnTo=%2Fget-started");

    await user.type(screen.getByLabelText("Email address"), "patient@example.test");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    await user.type(await screen.findByLabelText(/Six-digit verification code/i), "123456");
    await user.click(screen.getByRole("button", { name: "Verify and continue" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/get-started"));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/email-otp/start", expect.objectContaining({
      headers: expect.objectContaining({
        "x-apoth-auth-intent": "start-precheck-email-otp",
      }),
    }));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/email-otp/confirm", expect.objectContaining({
      headers: expect.objectContaining({
        "x-apoth-auth-intent": "confirm-precheck-email-otp",
      }),
    }));
    expect(navigate).not.toHaveBeenCalledWith("/sign-in?returnTo=%2Fintake");
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
