"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  launchOfferingSlugs,
  type LaunchOfferingSlug,
} from "../../../shared/intake/precheck";
import { usStates } from "../../../shared/intake/us-states";

type GateState =
  | { status: "checking" }
  | { status: "redirecting"; destination: string }
  | { status: "ready"; csrfToken: string };

type BootstrapProfile = {
  onboardingStatus?: unknown;
  residencyState?: unknown;
};

const offeringLabels = {
  "sexual-health": "Sexual health",
  hair: "Hair",
  weight: "Weight",
} satisfies Record<LaunchOfferingSlug, string>;

export function IntakePrecheckClient({
  fetchImpl = fetch,
  navigate = defaultNavigate,
}: {
  fetchImpl?: typeof fetch;
  navigate?: (destination: string) => void;
}) {
  const [gate, setGate] = useState<GateState>({ status: "checking" });
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchImpl("/api/intake/bootstrap", {
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
        const destination = "/sign-in?returnTo=%2Fintake";
        setGate({ status: "redirecting", destination });
        navigate(destination);
        return;
      }
      if (response.status === 403) {
        const destination = "/onboarding/consent";
        setGate({ status: "redirecting", destination });
        navigate(destination);
        return;
      }
      const body = await safeJson(response);
      if (!response.ok || typeof body.csrfToken !== "string") {
        setMessage("We could not prepare intake. Please try again in a moment.");
        setGate({ status: "checking" });
        return;
      }
      if (isPrecheckComplete(body.profile)) {
        const destination = "/onboarding/mdi";
        setGate({ status: "redirecting", destination });
        navigate(destination);
        return;
      }
      setGate({ status: "ready", csrfToken: body.csrfToken });
    }).catch(() => {
      if (active) {
        setMessage("We could not prepare intake. Please try again in a moment.");
      }
    });
    return () => {
      active = false;
    };
  }, [fetchImpl, navigate]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (gate.status !== "ready") {
      return;
    }

    setSubmitting(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetchImpl("/api/intake/precheck", {
      body: JSON.stringify({
        age: formValue(form, "age"),
        blockingContraindication: formValue(form, "blockingContraindication"),
        emergencySymptoms: formValue(form, "emergencySymptoms"),
        offering: formValue(form, "offering"),
        state: formValue(form, "state"),
      }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-apoth-csrf": gate.csrfToken,
      },
      method: "POST",
    });
    setSubmitting(false);

    if (response.status === 401) {
      navigate("/sign-in?returnTo=%2Fintake");
      return;
    }
    if (response.status === 403) {
      navigate("/onboarding/consent");
      return;
    }
    if (response.ok) {
      navigate("/onboarding/mdi");
      return;
    }

    const body = await safeJson(response);
    setMessage(messageForCode(typeof body.code === "string" ? body.code : ""));
  }

  if (gate.status !== "ready") {
    return (
      <div className="border border-ash-line bg-cream-warm p-5 sm:p-7">
        <p className="text-eyebrow uppercase text-ash">Secure check</p>
        <p className="mt-4 text-[1rem] text-ink/72">
          Confirming your account and required consents.
        </p>
        {message ? (
          <p className="mt-4 border border-clay-deep px-4 py-3 text-[1rem] text-clay-deep" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="border border-ash-line bg-cream-warm p-5 sm:p-7"
      onSubmit={onSubmit}
    >
      <div className="space-y-6">
        <label className="block">
          <span className="text-[0.95rem] font-medium text-ink">
            State of residence
          </span>
          <select
            className="mt-2 w-full border border-ash-line bg-cream px-3 py-3 text-[1rem] text-ink"
            name="state"
            required
          >
            <option value="">Select state</option>
            {usStates.map((state) => (
              <option key={state.code} value={state.code}>
                {state.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[0.95rem] font-medium text-ink">Age</span>
          <input
            className="mt-2 w-full border border-ash-line bg-cream px-3 py-3 text-[1rem] text-ink"
            inputMode="numeric"
            min="1"
            name="age"
            required
            type="number"
          />
        </label>

        <label className="block">
          <span className="text-[0.95rem] font-medium text-ink">
            Care category
          </span>
          <select
            className="mt-2 w-full border border-ash-line bg-cream px-3 py-3 text-[1rem] text-ink"
            name="offering"
            required
          >
            <option value="">Select category</option>
            {launchOfferingSlugs.map((offering) => (
              <option key={offering} value={offering}>
                {offeringLabels[offering]}
              </option>
            ))}
            <option value="peptides">Peptides</option>
          </select>
        </label>

        <fieldset>
          <legend className="text-[0.95rem] font-medium text-ink">
            Are you having emergency symptoms today?
          </legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Radio name="emergencySymptoms" value="no">
              No
            </Radio>
            <Radio name="emergencySymptoms" value="yes">
              Yes
            </Radio>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[0.95rem] font-medium text-ink">
            Have you been told not to use telehealth for this concern?
          </legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Radio name="blockingContraindication" value="no">
              No
            </Radio>
            <Radio name="blockingContraindication" value="yes">
              Yes
            </Radio>
          </div>
        </fieldset>
      </div>

      {message ? (
        <p className="mt-6 border border-clay-deep px-4 py-3 text-[1rem] text-clay-deep" role="alert">
          {message}
        </p>
      ) : null}

      <button
        className="mt-8 rounded-full bg-clay-deep px-6 py-3 text-[1rem] font-medium text-cream transition-colors hover:bg-clay disabled:cursor-not-allowed disabled:bg-ash"
        disabled={submitting}
        type="submit"
      >
        {submitting ? "Checking" : "Continue"}
      </button>
    </form>
  );
}

function defaultNavigate(destination: string) {
  window.location.assign(destination);
}

function Radio({
  children,
  name,
  value,
}: {
  children: string;
  name: string;
  value: string;
}) {
  return (
    <label className="flex items-center gap-3 border border-ash-line bg-cream px-3 py-3 text-[1rem] text-ink">
      <input
        className="h-4 w-4 accent-clay-deep"
        name={name}
        required
        type="radio"
        value={value}
      />
      <span>{children}</span>
    </label>
  );
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = await response.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function formValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function isPrecheckComplete(profile: unknown) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return false;
  }
  const value = profile as BootstrapProfile;
  return (
    value.onboardingStatus === "intake_ready" &&
    typeof value.residencyState === "string" &&
    value.residencyState.length === 2
  );
}

function messageForCode(code: string) {
  switch (code) {
    case "under_18":
      return "Apoth intake is for adults 18 and older.";
    case "off_scope_offering":
      return "That category is not available for launch intake.";
    case "emergency_symptoms":
      return "For emergency symptoms, seek urgent or emergency care now.";
    case "blocking_contraindication":
      return "This needs clinician review before online intake can continue.";
    case "missing_state":
    case "invalid_state":
      return "Choose a valid U.S. state of residence.";
    case "missing_age":
    case "invalid_age":
      return "Enter a valid age.";
    default:
      return "Check the form and try again.";
  }
}
