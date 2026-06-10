import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { acceptCurrentConsentsAction } from "@/app/onboarding/consent/actions";
import {
  consentAcknowledgementFieldName,
} from "@/lib/consent-acceptance";
import { currentRequiredConsents } from "@/lib/consents";
import { requireProtectedPageAccess } from "@/lib/protected-page";

export const metadata: Metadata = {
  title: "Consent · Apoth",
  description: "Review required Apoth onboarding consents.",
};

export default async function ConsentPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
} = {}) {
  await requireProtectedPageAccess({ pathname: "/onboarding/consent" });
  const params = await searchParams;
  const showError = params?.error === "acceptance_failed";

  return (
    <>
      <Nav variant="light" />
      <main id="main">
        <section className="mx-auto max-w-page px-6 py-16 text-ink md:px-10 md:py-24">
          <div className="max-w-3xl">
            <p className="text-eyebrow uppercase text-ash">Onboarding</p>
            <h1 className="display-serif mt-4 text-display-md font-light text-balance">
              Review required consents.
            </h1>
            <p className="mt-5 text-pretty text-[1.0625rem] text-ink/75">
              Apoth is a technology platform. Independent clinicians and MD
              Integrations handle medical care. Review each current document
              before continuing to intake.
            </p>
          </div>

          {showError ? (
            <p
              className="mt-8 max-w-3xl border border-clay-deep px-4 py-3 text-[1rem] text-clay-deep"
              role="alert"
            >
              We could not record consent. Review each acknowledgement and try
              again.
            </p>
          ) : null}

          <form action={acceptCurrentConsentsAction} className="mt-10 max-w-3xl">
            <div className="space-y-5">
              {currentRequiredConsents.map((consent) => (
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
                      I have reviewed and agree to the current {consent.label}
                      {" "}version.
                    </span>
                  </label>
                </fieldset>
              ))}
            </div>

            <p className="mt-8 text-[1rem] text-ink/70">
              Consent evidence is limited to document kind, version, timestamp,
              and approved operational evidence. Clinical questionnaire answers
              are not stored by Apoth after submission to MD Integrations.
            </p>

            <button
              className="mt-8 rounded-full bg-clay-deep px-6 py-3 text-[1rem] font-medium text-cream transition-colors hover:bg-clay"
              type="submit"
            >
              Accept and continue
            </button>
          </form>
        </section>
      </main>
      <Footer />
    </>
  );
}
