"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  consentAcknowledgementFieldName,
  requiredConsentsForPrecheck,
} from "@/lib/consents";
import {
  launchOfferingSlugs,
  type LaunchOfferingSlug,
} from "../../../shared/intake/precheck";
import { usStates } from "../../../shared/intake/us-states";

type GateState =
  | { status: "checking" }
  | { status: "redirecting"; destination: string }
  | { status: "privacy_required" }
  | { status: "account_required" }
  | { status: "ready"; csrfToken: string }
  | {
      status: "patient";
      csrfToken: string;
      treatment?: LaunchOfferingSlug;
    };

type BootstrapProfile = {
  onboardingStatus?: unknown;
  residencyState?: unknown;
};

const offeringLabels = {
  "sexual-health": "Sexual health",
  hair: "Hair",
  weight: "Weight",
} satisfies Record<LaunchOfferingSlug, string>;

const signUpAfterPrecheckHref = "/sign-up?returnTo=%2Fget-started";
const signInAfterPrecheckHref = "/sign-in?returnTo=%2Fget-started";
const privacyNotice = requiredConsentsForPrecheck().find((consent) =>
  consent.consentKind === "privacy_notice"
);

export function IntakePrecheckClient({
  fetchImpl = fetch,
  navigate = defaultNavigate,
}: {
  fetchImpl?: typeof fetch;
  navigate?: (destination: string) => void;
}) {
  const [gate, setGate] = useState<GateState>({ status: "checking" });
  const [message, setMessage] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setGate({ status: "checking" });
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
      const body = await safeJson(response);
      if (response.status === 403 && body.code === "privacy_notice_required") {
        setGate({ status: "privacy_required" });
        return;
      }
      if (response.status === 403) {
        const destination = "/onboarding/consent";
        setGate({ status: "redirecting", destination });
        navigate(destination);
        return;
      }
      if (!response.ok || typeof body.csrfToken !== "string") {
        setMessage("We could not prepare intake. Please try again in a moment.");
        setGate({ status: "checking" });
        return;
      }
      if (isPrecheckComplete(body.profile) && body.mdiPatientLinked === true) {
        const destination = "/onboarding/mdi";
        setGate({ status: "redirecting", destination });
        navigate(destination);
        return;
      }
      if (
        isPrecheckComplete(body.profile) &&
        typeof body.mdiPatientCsrfToken === "string"
      ) {
        setGate({ status: "patient", csrfToken: body.mdiPatientCsrfToken });
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
  }, [bootstrapAttempt, fetchImpl, navigate]);

  function retryBootstrap() {
    setMessage(null);
    setBootstrapAttempt((attempt) => attempt + 1);
  }

  async function onPrivacySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (gate.status !== "privacy_required" || !privacyNotice || submitting) {
      return;
    }

    setSubmitting(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetchImpl("/api/intake/privacy-notice", {
      body: JSON.stringify({
        acknowledgements: {
          [consentAcknowledgementFieldName(privacyNotice)]:
            form.get(consentAcknowledgementFieldName(privacyNotice)) === "accepted"
              ? "accepted"
              : "",
        },
      }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    }).catch(() => null);
    setSubmitting(false);

    if (!response?.ok) {
      setMessage("We could not record the privacy notice acknowledgement. Review it and try again.");
      return;
    }

    setBootstrapAttempt((attempt) => attempt + 1);
  }

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
      setGate({ status: "account_required" });
      return;
    }
    const body = await safeJson(response);
    if (response.status === 403 && body.code === "privacy_notice_required") {
      setGate({ status: "privacy_required" });
      return;
    }
    if (response.status === 403) {
      navigate("/onboarding/consent");
      return;
    }
    if (response.ok) {
      if (typeof body.mdiPatientCsrfToken === "string") {
        setGate({
          status: "patient",
          csrfToken: body.mdiPatientCsrfToken,
          treatment: formValue(form, "offering") as LaunchOfferingSlug,
        });
        return;
      }
      setGate({ status: "account_required" });
      return;
    }

    setMessage(messageForCode(typeof body.code === "string" ? body.code : ""));
  }

  async function onPatientSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (gate.status !== "patient" || submitting) {
      return;
    }

    setSubmitting(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetchImpl("/api/onboarding/mdi/patient", {
      body: JSON.stringify({
        address1: formValue(form, "address1"),
        address2: formValue(form, "address2"),
        city: formValue(form, "city"),
        dateOfBirth: formValue(form, "dateOfBirth"),
        email: formValue(form, "email"),
        firstName: formValue(form, "firstName"),
        gender: formValue(form, "gender"),
        lastName: formValue(form, "lastName"),
        phoneNumber: formValue(form, "phoneNumber"),
        state: formValue(form, "state"),
        treatment: formValue(form, "treatment"),
        zipCode: formValue(form, "zipCode"),
      }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-apoth-csrf": gate.csrfToken,
      },
      method: "POST",
    }).catch(() => null);
    setSubmitting(false);

    if (!response) {
      setMessage("We could not create your MDI profile. Please try again in a moment.");
      return;
    }
    if (response.status === 401) {
      navigate("/sign-in?returnTo=%2Fintake");
      return;
    }
    if (response.status === 403) {
      navigate("/onboarding/consent");
      return;
    }
    const body = await safeJson(response);
    if (response.status === 409 && body.redirect === "/intake") {
      setBootstrapAttempt((attempt) => attempt + 1);
      return;
    }
    if (response.ok) {
      navigate(typeof body.redirect === "string" ? body.redirect : "/onboarding/mdi");
      return;
    }
    setMessage(patientMessageForCode(typeof body.code === "string" ? body.code : ""));
  }

  if (gate.status === "privacy_required") {
    return (
      <PrivacyNoticeForm
        message={message}
        onSubmit={onPrivacySubmit}
        submitting={submitting}
      />
    );
  }

  if (gate.status === "account_required") {
    return <AccountRequiredPanel />;
  }

  if (gate.status !== "ready" && gate.status !== "patient") {
    return (
      <div className="border border-ash-line bg-cream-warm p-5 sm:p-7">
        <p className="text-eyebrow uppercase text-ash">Secure check</p>
        <p className="mt-4 text-[1rem] text-ink/72">
          Confirming your account and required consents.
        </p>
        {message ? (
          <>
            <p className="mt-4 border border-clay-deep px-4 py-3 text-[1rem] text-clay-deep" role="alert">
              {message}
            </p>
            <button
              className="mt-5 rounded-full bg-clay-deep px-5 py-2.5 text-[0.95rem] font-medium text-cream transition-colors hover:bg-clay"
              onClick={retryBootstrap}
              type="button"
            >
              Try again
            </button>
          </>
        ) : null}
      </div>
    );
  }

  if (gate.status === "patient") {
    return (
      <PatientProfileForm
        defaultTreatment={gate.treatment}
        message={message}
        onSubmit={onPatientSubmit}
        submitting={submitting}
      />
    );
  }

  return (
    <form
      className="border border-ash-line bg-cream-warm p-5 sm:p-7"
      onSubmit={onSubmit}
    >
      <p className="text-eyebrow uppercase text-ash">Precheck</p>
      <h2 className="mt-3 text-[1.35rem] font-semibold text-ink">
        Answer a short eligibility precheck.
      </h2>
      <p className="mt-3 text-[1rem] text-ink/72">
        These answers help route your intake before account setup. They are not
        the MDI clinical questionnaire.
      </p>
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

function PrivacyNoticeForm({
  message,
  onSubmit,
  submitting,
}: {
  message: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
}) {
  if (!privacyNotice) {
    return (
      <section className="border border-ash-line bg-cream-warm p-5 sm:p-7">
        <p className="text-eyebrow uppercase text-ash">Privacy notice</p>
        <p className="mt-4 text-[1rem] text-ink/72">
          We could not prepare the privacy notice. Please try again in a moment.
        </p>
      </section>
    );
  }

  return (
    <form
      className="border border-ash-line bg-cream-warm p-5 sm:p-7"
      onSubmit={onSubmit}
    >
      <p className="text-eyebrow uppercase text-ash">Privacy notice</p>
      <h2 className="mt-3 text-[1.35rem] font-semibold text-ink">
        Review privacy before precheck.
      </h2>
      <p className="mt-3 text-[1rem] text-ink/72">
        Apoth asks you to acknowledge the current privacy notice before you
        answer health-adjacent precheck questions. Telehealth consent and
        platform terms come later, before the MDI questionnaire.
      </p>
      <p className="mt-4 text-[1rem] text-ink/72">
        Version <span className="font-mono">{privacyNotice.version}</span>
        {" · "}
        <a
          className="font-medium text-clay-deep underline underline-offset-4"
          href={privacyNotice.documentPath}
        >
          Open {privacyNotice.label.toLowerCase()}
        </a>
      </p>
      <label className="mt-5 flex gap-3 text-[1rem] leading-relaxed text-ink">
        <input
          className="mt-1 h-5 w-5 accent-clay-deep"
          name={consentAcknowledgementFieldName(privacyNotice)}
          required
          type="checkbox"
          value="accepted"
        />
        <span>
          I have reviewed the current {privacyNotice.label.toLowerCase()}.
        </span>
      </label>

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
        {submitting ? "Recording" : "Continue to precheck"}
      </button>
    </form>
  );
}

function AccountRequiredPanel() {
  return (
    <section className="border border-ash-line bg-cream-warm p-5 sm:p-7">
      <p className="text-eyebrow uppercase text-ash">Account</p>
      <h2 className="mt-3 text-[1.35rem] font-semibold text-ink">
        Create an account to continue.
      </h2>
      <p className="mt-3 text-[1rem] text-ink/72">
        Your precheck is ready to attach to a secure Apoth account. Return to
        get started after sign-up or sign-in so we can bind that precheck to
        your profile.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a
          className="rounded-full bg-clay-deep px-5 py-2.5 text-[0.95rem] font-medium text-cream transition-colors hover:bg-clay"
          href={signUpAfterPrecheckHref}
        >
          Create account
        </a>
        <a
          className="rounded-full border border-clay-deep px-5 py-2.5 text-[0.95rem] font-medium text-clay-deep transition-colors hover:border-clay hover:text-clay"
          href={signInAfterPrecheckHref}
        >
          Sign in
        </a>
      </div>
    </section>
  );
}

function PatientProfileForm({
  defaultTreatment,
  message,
  onSubmit,
  submitting,
}: {
  defaultTreatment?: LaunchOfferingSlug;
  message: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
}) {
  return (
    <form
      className="border border-ash-line bg-cream-warm p-5 sm:p-7"
      onSubmit={onSubmit}
    >
      <p className="text-eyebrow uppercase text-ash">MDI profile</p>
      <h2 className="mt-3 text-[1.35rem] font-semibold text-ink">
        Add patient details for the clinical handoff.
      </h2>
      <p className="mt-3 text-[1rem] text-ink/72">
        These details are sent to MD Integrations to create your patient record.
        Apoth keeps only the MDI patient pointer.
      </p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field label="First name" name="firstName" autoComplete="given-name" />
        <Field label="Last name" name="lastName" autoComplete="family-name" />
        <Field label="Date of birth" name="dateOfBirth" type="date" />
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Phone" name="phoneNumber" type="tel" autoComplete="tel" />
        <label className="block">
          <span className="text-[0.95rem] font-medium text-ink">
            Clinical profile sex
          </span>
          <select
            className="mt-2 w-full border border-ash-line bg-cream px-3 py-3 text-[1rem] text-ink"
            name="gender"
          >
            <option value="">Select if applicable</option>
            <option value="2">Female</option>
            <option value="1">Male</option>
            <option value="0">Another or not listed</option>
          </select>
        </label>
        <Field className="sm:col-span-2" label="Address" name="address1" autoComplete="address-line1" />
        <Field className="sm:col-span-2" label="Address 2" name="address2" autoComplete="address-line2" required={false} />
        <Field label="City" name="city" autoComplete="address-level2" />
        <label className="block">
          <span className="text-[0.95rem] font-medium text-ink">State</span>
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
        <Field label="ZIP code" name="zipCode" autoComplete="postal-code" inputMode="numeric" />
        <label className="block">
          <span className="text-[0.95rem] font-medium text-ink">
            Care category
          </span>
          <select
            className="mt-2 w-full border border-ash-line bg-cream px-3 py-3 text-[1rem] text-ink"
            defaultValue={defaultTreatment ?? ""}
            name="treatment"
            required
          >
            <option value="">Select category</option>
            {launchOfferingSlugs.map((offering) => (
              <option key={offering} value={offering}>
                {offeringLabels[offering]}
              </option>
            ))}
          </select>
        </label>
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
        {submitting ? "Creating profile" : "Continue to clinical intake"}
      </button>
    </form>
  );
}

function Field({
  className = "",
  label,
  name,
  required = true,
  type = "text",
  ...props
}: {
  autoComplete?: string;
  className?: string;
  inputMode?: "numeric";
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className={`block ${className}`.trim()}>
      <span className="text-[0.95rem] font-medium text-ink">{label}</span>
      <input
        className="mt-2 w-full border border-ash-line bg-cream px-3 py-3 text-[1rem] text-ink"
        name={name}
        required={required}
        type={type}
        {...props}
      />
    </label>
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

function patientMessageForCode(code: string) {
  switch (code) {
    case "questionnaire_unavailable":
      return "This care category is not ready for clinical intake yet.";
    case "invalid_treatment":
      return "Choose a care category.";
    case "missing_first_name":
    case "missing_last_name":
    case "missing_address":
    case "missing_city":
      return "Complete the required patient details.";
    case "invalid_date_of_birth":
      return "Enter a valid date of birth.";
    case "invalid_email":
      return "Enter a valid email address.";
    case "invalid_phone":
      return "Enter a valid phone number.";
    case "invalid_state":
      return "Choose a valid U.S. state.";
    case "invalid_zip":
      return "Enter a valid ZIP code.";
    case "create_in_progress":
      return "Your MDI profile is already being created. Try again in a moment.";
    default:
      return "We could not create your MDI profile. Please check the form and try again.";
  }
}
