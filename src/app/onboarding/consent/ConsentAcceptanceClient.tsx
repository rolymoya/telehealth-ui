"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  consentAcknowledgementFieldName,
  type RequiredConsentDocument,
} from "@/lib/consents";
import { postConsentAcceptance } from "@/lib/consent-api-client";

export function ConsentAcceptanceClient({
  gate,
  requiredConsents,
}: {
  gate: "pre_mdi" | "post_questionnaire_medication";
  requiredConsents: readonly RequiredConsentDocument[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(globalThis.location?.search ?? "");
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
      {error ? (
        <p
          className="mt-8 max-w-3xl border border-clay-deep px-4 py-3 text-[1rem] text-clay-deep"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <form className="mt-10 max-w-3xl" onSubmit={onSubmit}>
        <div className="space-y-5">
          {requiredConsents.map((consent) => (
            <fieldset
              className="border border-ash-line px-5 py-5"
              key={`${consent.consentKind}:${consent.version}`}
            >
              <legend className="display-serif px-1 text-[1.35rem] font-light text-ink">
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
                <Link
                  className="text-[1rem] font-medium text-clay-deep underline underline-offset-4"
                  href={consent.documentPath}
                >
                  Open document
                </Link>
              </p>
              {consent.consentKind === "compounded_medication_disclosure" ? (
                <p className="mt-4 text-[1rem] text-ink/72">
                  Compounded medications are not FDA-approved. They are not
                  Ozempic, Wegovy, Mounjaro, or Zepbound.
                </p>
              ) : null}
              <label className="mt-5 flex gap-3 text-[1rem] leading-relaxed text-ink">
                <input
                  className="mt-1 h-5 w-5 accent-clay-deep"
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
          approved operational evidence. Clinical questionnaire answers are not
          stored by Apoth after submission to MD Integrations.
        </p>

        <button
          className="mt-8 rounded-full bg-clay-deep px-6 py-3 text-[1rem] font-medium text-cream transition-colors hover:bg-clay disabled:cursor-wait disabled:bg-ash"
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
