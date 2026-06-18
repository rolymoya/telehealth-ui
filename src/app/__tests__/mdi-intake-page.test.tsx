import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import MdiHandoffPage from "@/app/onboarding/mdi/page";
import { MdiIntakeClient } from "@/app/onboarding/mdi/MdiIntakeClient";
import questionnaireFlow from "../../../tests/fixtures/mdi/questionnaire-flow.json";

const questionnaire = questionnaireFlow.questionnaire;

describe("MDI intake page", () => {
  it("renders the static clinical intake shell", () => {
    render(<MdiHandoffPage />);

    expect(screen.getByRole("heading", { name: /^clinical intake$/i }))
      .toBeInTheDocument();
    expect(screen.getByText(/keeps only the handoff status and opaque case pointers/i))
      .toBeInTheDocument();
  });

  it("renders fixture questions after bootstrap and submits transient responses with CSRF", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === "/api/onboarding/mdi/bootstrap") {
        return jsonResponse({
          csrfToken: "csrf_mdi_123",
          questionnaire,
          status: "ready",
        });
      }
      return jsonResponse({ status: "submitted" });
    });

    render(<MdiIntakeClient fetchImpl={fetchMock as typeof fetch} />);

    expect(await screen.findByText(/1\. QUESTION_TEXT_SENTINEL/i))
      .toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "OPTION_LABEL_SENTINEL" }));
    await user.type(
      screen.getByLabelText(/2\. QUESTION_TEXT_SENTINEL/i),
      "ANSWER_VALUE_SENTINEL",
    );
    await user.click(screen.getByRole("button", { name: /submit intake/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/onboarding/mdi/submit", expect.objectContaining({
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-apoth-csrf": "csrf_mdi_123",
        },
        method: "POST",
      }));
    });
    const submitCall = fetchMock.mock.calls.find(
      ([url]) => String(url) === "/api/onboarding/mdi/submit",
    );
    const firstOption = questionnaire.questions[0].options?.[0];
    expect(firstOption).toBeDefined();
    expect(JSON.parse(String(submitCall?.[1]?.body))).toEqual({
      caseId: questionnaire.caseId,
      patientId: questionnaire.patientId,
      questionnaireId: questionnaire.questionnaireId,
      responses: [
        {
          questionId: questionnaire.questions[0].questionId,
          value: firstOption?.optionId,
        },
        {
          questionId: questionnaire.questions[1].questionId,
          value: "ANSWER_VALUE_SENTINEL",
        },
      ],
    });
    expect(String(submitCall?.[0])).not.toContain("ANSWER_VALUE_SENTINEL");
    expect(await screen.findByText(/questionnaire was sent for clinical review/i))
      .toBeInTheDocument();
    expect(screen.queryByText("ANSWER_VALUE_SENTINEL")).not.toBeInTheDocument();
    expect(screen.queryByText("QUESTION_TEXT_SENTINEL")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("ANSWER_VALUE_SENTINEL")).toBeNull();
    expect(window.sessionStorage.getItem("ANSWER_VALUE_SENTINEL")).toBeNull();
  });

  it("shows submitted status from pointers without rendering questions", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      linkage: {
        mdiPatientId: questionnaire.patientId,
        mdiCaseId: questionnaire.caseId,
      },
      status: "submitted",
    }));

    render(<MdiIntakeClient fetchImpl={fetchMock as typeof fetch} />);

    expect(await screen.findByText(/questionnaire was sent for clinical review/i))
      .toBeInTheDocument();
    expect(screen.queryByText("QUESTION_TEXT_SENTINEL")).not.toBeInTheDocument();
    expect(screen.queryByText("ANSWER_VALUE_SENTINEL")).not.toBeInTheDocument();
  });

  it("redirects auth, consent, and precheck gates", async () => {
    const navigate = vi.fn();
    const unauthorizedFetch = vi.fn(async () =>
      jsonResponse({ code: "missing_session" }, { status: 401 })
    );
    render(
      <MdiIntakeClient
        fetchImpl={unauthorizedFetch as typeof fetch}
        navigate={navigate}
      />,
    );
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/sign-in?returnTo=%2Fonboarding%2Fmdi");
    });

    const consentFetch = vi.fn(async () =>
      jsonResponse(
        { code: "consent_required", redirect: "/onboarding/consent" },
        { status: 403 },
      )
    );
    render(
      <MdiIntakeClient
        fetchImpl={consentFetch as typeof fetch}
        navigate={navigate}
      />,
    );
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/onboarding/consent");
    });

    const precheckFetch = vi.fn(async () =>
      jsonResponse({ code: "precheck_required" }, { status: 409 })
    );
    render(
      <MdiIntakeClient
        fetchImpl={precheckFetch as typeof fetch}
        navigate={navigate}
      />,
    );
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/intake");
    });
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}
