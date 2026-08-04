"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  consentAcknowledgementFieldName,
  type RequiredConsentDocument,
} from "@/lib/consents";
import { postConsentAcceptance } from "@/lib/consent-api-client";

export function ConsentAcceptanceClient({
  medicationConsents,
  preMdiConsents,
}: {
  medicationConsents: readonly RequiredConsentDocument[];
  preMdiConsents: readonly RequiredConsentDocument[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<"pre_mdi" | "post_questionnaire_medication">("pre_mdi");
  const [loading, setLoading] = useState(false);
  const requiredConsents = gate === "post_questionnaire_medication"
    ? medicationConsents
    : preMdiConsents;
  const copy = consentPageCopy(gate);

  useEffect(() => {
    const params = new URLSearchParams(globalThis.location?.search ?? "");
    setGate(params.get("gate") === "medication"
      ? "post_questionnaire_medication"
      : "pre_mdi");
    if (params.get("error") === "acceptance_failed") {
      setError("We could not record consent. Review each acknowledgement and try again.");
    }
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    try {
      const acknowledgements = Object.fromEntries(
        requiredConsents.map((consent) => [
          consentAcknowledgementFieldName(consent),
          form.get(consentAcknowledgementFieldName(consent)) === "accepted"
            ? "accepted"
            : "",
        ]),
      );
      const response = await postConsentAcceptance({
        acknowledgements,
        gate,
      });
      const body = await readJsonBody(response);

      if (response.status === 401) {
        globalThis.location?.assign?.(
          `/sign-in?returnTo=${encodeURIComponent("/onboarding/consent")}`,
        );
        return;
      }

      if (!response.ok) {
        setError("We could not record consent. Review each acknowledgement and try again.");
        return;
      }

      const destination = typeof body.destination === "string"
        ? body.destination
        : "/intake";
      globalThis.location?.assign?.(destination);
    } catch {
      setError("We could not record consent. Review each acknowledgement and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="max-w-3xl rounded-[26px] bg-[#e2f1eb] p-7 shadow-soft sm:p-10">
        <p className="text-eyebrow uppercase text-[#397057]">Onboarding</p>
        <h1 className="display-serif mt-4 text-display-md font-light text-balance">
          {copy.heading}
        </h1>
        <p className="mt-5 text-pretty text-[1.0625rem] text-ink/75">
          {copy.body}
        </p>
      </div>

      {error ? (
        <p
          className="mt-8 max-w-3xl rounded-2xl border border-[#a53f2b]/25 bg-[#fff5f2] px-4 py-3 text-[0.95rem] text-[#7d2e22]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <form className="mt-5 max-w-3xl rounded-[26px] border border-black/[0.05] bg-white p-6 shadow-soft sm:p-9" onSubmit={onSubmit}>
        <div className="space-y-5">
          {requiredConsents.map((consent) => (
            <fieldset
              className="rounded-[20px] border border-black/[0.07] bg-[#f9f9fa] px-5 py-5"
              key={`${consent.consentKind}:${consent.version}`}
            >
              <legend className="px-1 text-[1.2rem] font-bold tracking-[-0.025em] text-ink">
                {consent.label}
              </legend>
              <p className="mt-3 text-[1rem] text-ink/72">
                Version <span className="font-mono">{consent.version}</span>
                {" · "}
                {consent.owner === "third_party_clinician"
                  ? "Independent clinician consent"
                  : "Apoth platform document"}
              </p>
              <p className="mt-3">
                <a
                  className="text-[1rem] font-semibold text-[#315fbf] underline decoration-[#4e80ee]/30 underline-offset-4"
                  href={consent.documentPath}
                >
                  Open document
                </a>
              </p>
              {consent.consentKind === "compounded_medication_disclosure" ? (
                <p className="mt-4 text-[1rem] text-ink/72">
                  Compounded medications are not FDA-approved. They are not
                  Ozempic, Wegovy, Mounjaro, or Zepbound.
                </p>
              ) : null}
              <label className="mt-5 flex gap-3 text-[1rem] leading-relaxed text-ink">
                <input
                  className="mt-1 h-5 w-5 accent-[#4e80ee]"
                  name={consentAcknowledgementFieldName(consent)}
                  required
                  type="checkbox"
                  value="accepted"
                />
                <span>
                  I have reviewed and agree to the current {consent.label}{" "}
                  version.
                </span>
              </label>
            </fieldset>
          ))}
        </div>

        <p className="mt-8 text-[1rem] text-ink/70">
          Consent evidence is limited to document kind, version, timestamp, and
          approved operational evidence. The selected provider portal collects
          the clinical questionnaire; Apoth does not render or store those answers.
        </p>

        <button
          className="mt-8 rounded-full bg-[#171719] px-6 py-3 text-[1rem] font-semibold text-white transition-all hover:-translate-y-px hover:bg-[#343437] disabled:cursor-wait disabled:bg-ash"
          disabled={loading}
          type="submit"
        >
          {loading ? "Recording consent" : "Accept and continue"}
        </button>
      </form>
    </>
  );
}

async function readJsonBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await response.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function consentPageCopy(gate: "pre_mdi" | "post_questionnaire_medication") {
  return gate === "post_questionnaire_medication"
    ? {
        heading: "Review medication disclosure.",
        body: "If your treatment path includes a medication-specific disclosure, Apoth asks for it after the provider questionnaire and before billing or prescribing can continue.",
      }
    : {
        heading: "Review telehealth and platform terms.",
        body: "You have already acknowledged the privacy notice. Review telehealth consent and Apoth platform terms before the provider questionnaire opens.",
      };
}
