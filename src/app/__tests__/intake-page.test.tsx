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
    expect(screen.getByText(/Medical questionnaire answers are collected later by MD Integrations/i))
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
      return jsonResponse({
        redirect: "/onboarding/mdi",
        status: "linked",
      });
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
    expect(await screen.findByRole("heading", {
      name: /add patient details for the clinical handoff/i,
    })).toBeInTheDocument();

    await user.type(screen.getByLabelText("First name"), "Pat");
    await user.type(screen.getByLabelText("Last name"), "Example");
    await user.type(screen.getByLabelText("Date of birth"), "1990-01-02");
    await user.type(screen.getByLabelText("Email"), "patient@example.test");
    await user.type(screen.getByLabelText("Phone"), "312-555-0101");
    await user.selectOptions(screen.getByLabelText(/Clinical profile sex/i), "2");
    await user.type(screen.getByLabelText("Address"), "1 Example St");
    await user.type(screen.getByLabelText("City"), "Chicago");
    await user.selectOptions(screen.getByLabelText("State"), "IL");
    await user.type(screen.getByLabelText("ZIP code"), "60601");
    expect(screen.getByLabelText(/Care category/i)).toHaveValue("weight");
    await user.click(screen.getByRole("button", { name: /continue to clinical intake/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/onboarding/mdi/patient", expect.objectContaining({
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-apoth-csrf": "csrf_mdi_patient",
        },
        method: "POST",
      }));
    });
    const patientCall = fetchMock.mock.calls.find(
      ([url]) => String(url) === "/api/onboarding/mdi/patient",
    );
    expect(JSON.parse(String(patientCall?.[1]?.body))).toMatchObject({
      dateOfBirth: "1990-01-02",
      email: "patient@example.test",
      firstName: "Pat",
      lastName: "Example",
      treatment: "weight",
    });
    expect(navigate).toHaveBeenCalledWith("/onboarding/mdi");
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

    render(<IntakePrecheckClient fetchImpl={fetchMock as typeof fetch} />);

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
      name: /create an account to continue/i,
    })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create account" }))
      .toHaveAttribute("href", "/sign-up?returnTo=%2Fget-started");
    expect(screen.getByRole("link", { name: "Sign in" }))
      .toHaveAttribute("href", "/sign-in?returnTo=%2Fget-started");
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

  it("redirects already linked precheck-complete patients to the MDI step during bootstrap", async () => {
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
      expect(navigate).toHaveBeenCalledWith("/onboarding/mdi");
    });
    expect(screen.queryByLabelText(/State of residence/i)).not.toBeInTheDocument();
  });

  it("opens patient profile for precheck-complete patients without MDI linkage", async () => {
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

    expect(await screen.findByRole("heading", {
      name: /add patient details for the clinical handoff/i,
    })).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalledWith("/onboarding/mdi");
    expect(screen.queryByLabelText(/State of residence/i)).not.toBeInTheDocument();
  });

  it("shows account CTAs when anonymous precheck reaches auth", async () => {
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

    expect(await screen.findByRole("heading", {
      name: /create an account to continue/i,
    })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create account" }))
      .toHaveAttribute("href", "/sign-up?returnTo=%2Fget-started");
    expect(screen.getByRole("link", { name: "Sign in" }))
      .toHaveAttribute("href", "/sign-in?returnTo=%2Fget-started");
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
