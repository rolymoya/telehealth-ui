"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import type {
  MdiIntakeQuestion,
  MdiIntakeQuestionnaire,
  MdiIntakeResponse,
} from "@/lib/mdi-intake";

type IntakeState =
  | { status: "loading" }
  | { status: "redirecting"; destination: string }
  | {
      status: "ready";
      csrfToken: string;
      questionnaire: MdiIntakeQuestionnaire;
    }
  | { status: "submitted" }
  | { status: "error"; message: string; handoffComplete?: boolean };

type BootstrapResponse = {
  code?: unknown;
  csrfToken?: unknown;
  linkage?: unknown;
  questionnaire?: unknown;
  redirect?: unknown;
  status?: unknown;
};

const signInDestination = "/sign-in?returnTo=%2Fonboarding%2Fmdi";

export function MdiIntakeClient({
  fetchImpl = fetch,
  navigate = defaultNavigate,
}: {
  fetchImpl?: typeof fetch;
  navigate?: (destination: string) => void;
}) {
  const [state, setState] = useState<IntakeState>({ status: "loading" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    setAnswers({});

    void fetchImpl("/api/onboarding/mdi/bootstrap", {
      credentials: "include",
      headers: {
        accept: "application/json",
      },
      method: "GET",
    }).then(async (response) => {
      if (!active) {
        return;
      }
      if (response.status === 401) {
        setRedirecting(signInDestination, navigate, setState);
        return;
      }

      const body = await safeJson(response) as BootstrapResponse;
      if (response.status === 403 && typeof body.redirect === "string") {
        setRedirecting(body.redirect, navigate, setState);
        return;
      }
      if (response.status === 409 && body.code === "precheck_required") {
        setRedirecting("/intake", navigate, setState);
        return;
      }
      if (!response.ok) {
        setState({
          status: "error",
          message: messageForCode(typeof body.code === "string" ? body.code : ""),
        });
        return;
      }
      if (body.status === "submitted" || body.status === "clinical_review" || body.status === "billing_ready") {
        setState({ status: "submitted" });
        return;
      }
      if (
        body.status !== "ready" ||
        typeof body.csrfToken !== "string" ||
        !isQuestionnaire(body.questionnaire)
      ) {
        setState({
          status: "error",
          message: "We could not prepare the clinical intake. Please try again in a moment.",
        });
        return;
      }

      setState({
        status: "ready",
        csrfToken: body.csrfToken,
        questionnaire: body.questionnaire,
      });
    }).catch(() => {
      if (active) {
        setState({
          status: "error",
          message: "We could not prepare the clinical intake. Please try again in a moment.",
        });
      }
    });

    return () => {
      active = false;
    };
  }, [bootstrapAttempt, fetchImpl, navigate]);

  const questionCount = state.status === "ready"
    ? state.questionnaire.questions.length
    : 0;
  const answeredCount = useMemo(() => {
    if (state.status !== "ready") {
      return 0;
    }
    return state.questionnaire.questions.filter((question) =>
      hasAnswer(answers[question.questionId])
    ).length;
  }, [answers, state]);

  function retryBootstrap() {
    setBootstrapAttempt((attempt) => attempt + 1);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== "ready" || submitting) {
      return;
    }

    setSubmitting(true);
    const responses = buildResponses(state.questionnaire.questions, answers);
    const response = await fetchImpl("/api/onboarding/mdi/submit", {
      body: JSON.stringify({
        casePayload: buildCasePayload(state.questionnaire.questions, responses),
        questionnaireId: state.questionnaire.questionnaireId,
        responses,
      }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-apoth-csrf": state.csrfToken,
      },
      method: "POST",
    }).catch(() => null);
    setSubmitting(false);

    if (!response) {
      setState({
        status: "error",
        message: "We could not submit the clinical intake. Please try again in a moment.",
      });
      return;
    }
    if (response.status === 401) {
      setRedirecting(signInDestination, navigate, setState);
      return;
    }

    const body = await safeJson(response) as BootstrapResponse;
    if (response.status === 403 && typeof body.redirect === "string") {
      setRedirecting(body.redirect, navigate, setState);
      return;
    }
    if (response.status === 409 && body.code === "precheck_required") {
      setRedirecting("/intake", navigate, setState);
      return;
    }
    if (!response.ok || body.status !== "submitted") {
      setState({
        status: "error",
        message: messageForCode(typeof body.code === "string" ? body.code : ""),
      });
      return;
    }

    setAnswers({});
    setState({ status: "submitted" });
  }

  if (state.status === "loading" || state.status === "redirecting") {
    return (
      <section className="border border-ash-line bg-cream-warm p-5 sm:p-7" aria-live="polite">
        <p className="text-eyebrow uppercase text-ash">Clinical intake</p>
        <h2 className="mt-4 text-[1.35rem] font-semibold text-ink">
          Preparing your MDI questionnaire.
        </h2>
        <p className="mt-3 text-[1rem] text-ink/72">
          Checking your account, consent, and intake status.
        </p>
      </section>
    );
  }

  if (state.status === "submitted") {
    return (
      <section className="border border-ash-line bg-cream-warm p-5 sm:p-7" aria-live="polite">
        <p className="text-eyebrow uppercase text-ash">Clinical intake</p>
        <h2 className="mt-4 text-[1.45rem] font-semibold text-ink">
          Your questionnaire was sent for clinical review.
        </h2>
        <p className="mt-3 text-[1rem] text-ink/72">
          Apoth saved only the MDI handoff status and opaque case pointers.
        </p>
        <a
          className="mt-6 inline-flex rounded-full bg-clay-deep px-5 py-2.5 text-[0.95rem] font-medium text-cream transition-colors hover:bg-clay"
          href="/dashboard"
        >
          Continue to dashboard
        </a>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="border border-ash-line bg-cream-warm p-5 sm:p-7" aria-live="polite">
        <p className="text-eyebrow uppercase text-ash">Clinical intake</p>
        <h2 className="mt-4 text-[1.35rem] font-semibold text-ink">
          We could not open this step.
        </h2>
        <p className="mt-3 border border-clay-deep px-4 py-3 text-[1rem] text-clay-deep" role="alert">
          {state.message}
        </p>
        <button
          className="mt-6 rounded-full bg-clay-deep px-5 py-2.5 text-[0.95rem] font-medium text-cream transition-colors hover:bg-clay"
          onClick={retryBootstrap}
          type="button"
        >
          Try again
        </button>
      </section>
    );
  }

  return (
    <form
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]"
      onSubmit={onSubmit}
    >
      <section className="border border-ash-line bg-cream-warm p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-eyebrow uppercase text-ash">MDI questionnaire</p>
            <h2 className="mt-3 text-[1.55rem] font-semibold text-ink">
              Complete your clinical intake.
            </h2>
          </div>
          <span className="border border-ash-line bg-cream px-3 py-2 text-[0.85rem] font-medium text-ink/70">
            {answeredCount}/{questionCount}
          </span>
        </div>

        <div className="mt-7 space-y-6">
          {state.questionnaire.questions.map((question, index) => (
            <QuestionField
              answer={answers[question.questionId] ?? ""}
              index={index}
              key={question.questionId}
              onAnswer={(value) => {
                setAnswers((current) => ({
                  ...current,
                  [question.questionId]: value,
                }));
              }}
              question={question}
            />
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            className="rounded-full bg-clay-deep px-5 py-2.5 text-[0.95rem] font-medium text-cream transition-colors hover:bg-clay disabled:cursor-not-allowed disabled:bg-ash"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Submitting" : "Submit intake"}
          </button>
          <a
            className="rounded-full border border-ash-line px-5 py-2.5 text-[0.95rem] font-medium text-ink transition-colors hover:border-clay-deep"
            href="/intake"
          >
            Back
          </a>
        </div>
      </section>

      <aside className="border border-ash-line bg-cream-warm p-5 lg:sticky lg:top-24 lg:self-start">
        <p className="text-eyebrow uppercase text-ash">Progress</p>
        <ol className="mt-4 space-y-3 text-[0.95rem] text-ink/72">
          <li className="flex items-center gap-2 text-ink">
            <span className="h-2.5 w-2.5 rounded-full bg-clay-deep" />
            Consent
          </li>
          <li className="flex items-center gap-2 text-ink">
            <span className="h-2.5 w-2.5 rounded-full bg-clay-deep" />
            Eligibility
          </li>
          <li className="flex items-center gap-2 text-ink">
            <span className="h-2.5 w-2.5 rounded-full bg-clay-deep" />
            MDI intake
          </li>
        </ol>
      </aside>
    </form>
  );
}

function QuestionField({
  answer,
  index,
  onAnswer,
  question,
}: {
  answer: string;
  index: number;
  onAnswer: (value: string) => void;
  question: MdiIntakeQuestion;
}) {
  const baseId = useId();
  const label = `${index + 1}. ${question.text}`;

  if (question.controlType === "single_select") {
    return (
      <fieldset className="border-t border-ash-line pt-5">
        <legend className="text-[1rem] font-medium text-ink">
          {label}
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(question.options ?? []).map((option) => (
            <label
              className="flex min-h-12 items-center gap-3 border border-ash-line bg-cream px-4 py-3 text-[0.98rem] text-ink transition-colors hover:border-clay"
              key={option.optionId}
            >
              <input
                checked={answer === option.optionId}
                className="h-4 w-4 accent-clay-deep"
                name={question.questionId}
                onChange={() => onAnswer(option.optionId)}
                required={question.required}
                type="radio"
                value={option.optionId}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <label className="block border-t border-ash-line pt-5" htmlFor={baseId}>
      <span className="text-[1rem] font-medium text-ink">{label}</span>
      <textarea
        className="mt-3 min-h-28 w-full border border-ash-line bg-cream px-3 py-3 text-[1rem] text-ink"
        id={baseId}
        maxLength={maxLength(question.constraints)}
        onChange={(event) => onAnswer(event.target.value)}
        required={question.required}
        value={answer}
      />
    </label>
  );
}

function buildResponses(
  questions: MdiIntakeQuestion[],
  answers: Record<string, string>,
): MdiIntakeResponse[] {
  return questions
    .map((question) => ({
      questionId: question.questionId,
      value: answers[question.questionId],
    }))
    .filter((response) => hasAnswer(response.value));
}

function buildCasePayload(
  questions: MdiIntakeQuestion[],
  responses: MdiIntakeResponse[],
) {
  const questionsById = new Map(questions.map((question) => [question.questionId, question]));
  return {
    case_questions: responses.map((response) => {
      const question = questionsById.get(response.questionId);
      const answer = answerForQuestion(question, response.value);
      return {
        answer,
        question: question?.text ?? response.questionId,
        type: question?.controlType ?? "free_text",
      };
    }),
  };
}

function answerForQuestion(question: MdiIntakeQuestion | undefined, value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  const option = question?.options?.find((candidate) => candidate.optionId === value);
  return option?.label ?? value;
}

function hasAnswer(value: string | undefined) {
  return typeof value === "string" && value.trim() !== "";
}

function isQuestionnaire(value: unknown): value is MdiIntakeQuestionnaire {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.questionnaireId === "string" &&
    typeof value.patientId === "string" &&
    (value.caseId === undefined || typeof value.caseId === "string") &&
    Array.isArray(value.questions);
}

function maxLength(constraints: Record<string, unknown> | undefined) {
  const value = constraints?.maxLength;
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function messageForCode(code: string) {
  switch (code) {
    case "provider_unavailable":
      return "The MDI workflow is temporarily unavailable. Please try again in a moment. No questionnaire answers were saved by this page.";
    case "invalid_csrf":
    case "invalid_origin":
      return "We could not verify this secure request. Please refresh and try again.";
    case "precheck_required":
      return "Please complete the eligibility step before clinical intake.";
    default:
      return "We could not complete this intake step. Please try again in a moment.";
  }
}

function setRedirecting(
  destination: string,
  navigate: (destination: string) => void,
  setState: (state: IntakeState) => void,
) {
  setState({ status: "redirecting", destination });
  navigate(destination);
}

function defaultNavigate(destination: string) {
  window.location.assign(destination);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
