import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AccountLoading from "@/app/account/loading";
import BillingError from "@/app/billing/error";
import BillingPage from "@/app/billing/page";
import DashboardLoading from "@/app/dashboard/loading";
import GlobalError from "@/app/error";
import IntakeError from "@/app/intake/error";
import Loading from "@/app/loading";
import NotFound from "@/app/not-found";
import MdiError from "@/app/onboarding/mdi/error";
import MdiHandoffPage from "@/app/onboarding/mdi/page";
import { MdiUnavailableState } from "@/components/product/ProviderUnavailableStates";

describe("route states", () => {
  it("renders root not-found and loading states with calm recovery copy", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", {
      name: /we could not find that page/i,
    })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go home/i }))
      .toHaveAttribute("href", "/");

    render(<Loading />);

    expect(screen.getByRole("heading", {
      name: /preparing your next step/i,
    })).toBeInTheDocument();
  });

  it("does not render raw error details and still retries", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    render(
      <GlobalError
        error={new Error("MDI bearer token and questionnaire payload")}
        reset={reset}
      />,
    );

    expect(screen.queryByText(/bearer token|questionnaire payload/i))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("renders scoped product loading and error states", async () => {
    const reset = vi.fn();

    render(<AccountLoading />);
    expect(screen.getByRole("heading", { name: /account settings/i }))
      .toBeInTheDocument();

    render(<DashboardLoading />);
    expect(screen.getByRole("heading", { name: /dashboard/i }))
      .toBeInTheDocument();

    render(<IntakeError error={new Error("raw clinical payload")} reset={reset} />);
    expect(screen.getByRole("heading", { name: /could not open intake/i }))
      .toBeInTheDocument();
    expect(screen.queryByText(/raw clinical payload/i)).not.toBeInTheDocument();
  });

  it("keeps MDI and billing unavailable states distinct and patient-safe", () => {
    const reset = vi.fn();

    render(<MdiError error={new Error("mdi upstream")} reset={reset} />);
    expect(screen.getByRole("heading", {
      name: /care workflow is temporarily unavailable/i,
    })).toBeInTheDocument();
    expect(screen.getByText(/does not keep questionnaire answers/i))
      .toBeInTheDocument();
    expect(screen.queryByText(/mdi upstream/i)).not.toBeInTheDocument();

    render(<BillingError error={new Error("stripe secret")} reset={reset} />);
    expect(screen.getByRole("heading", {
      name: /billing setup is not available yet/i,
    })).toBeInTheDocument();
    expect(screen.getByText(/no payment method is collected/i))
      .toBeInTheDocument();
    expect(screen.queryByText(/stripe secret/i)).not.toBeInTheDocument();
  });

  it("surfaces provider unavailable states through current placeholder routes", () => {
    render(<MdiHandoffPage />);
    expect(screen.getByRole("heading", {
      name: /care workflow is temporarily unavailable/i,
    })).toBeInTheDocument();
    expect(screen.getByText(/not stored on this Apoth page/i))
      .toBeInTheDocument();

    render(<BillingPage />);
    expect(screen.getByRole("heading", {
      name: /billing setup is not available yet/i,
    })).toBeInTheDocument();
    expect(screen.getByText(/no payment method is collected/i))
      .toBeInTheDocument();
  });

  it("does not retain questionnaire answers after a completed MDI handoff retry state", () => {
    const completedQuestionnaireAnswers = {
      medication: "semaglutide",
      symptom: "private symptom detail",
    };
    window.localStorage.setItem("unrelated", "kept");

    render(<MdiUnavailableState handoffComplete />);

    expect(screen.getByRole("heading", {
      name: /care workflow is temporarily unavailable/i,
    })).toBeInTheDocument();
    expect(screen.queryByText(completedQuestionnaireAnswers.medication))
      .not.toBeInTheDocument();
    expect(screen.queryByText(completedQuestionnaireAnswers.symptom))
      .not.toBeInTheDocument();
    expect(window.localStorage.getItem("unrelated")).toBe("kept");
    expect(window.localStorage.getItem("medication")).toBeNull();
    expect(window.localStorage.getItem("symptom")).toBeNull();
  });
});
