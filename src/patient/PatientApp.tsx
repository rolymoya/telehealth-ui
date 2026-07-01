import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import type { ReactNode } from "react";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { AuthPanel, type AuthPanelMode } from "@/components/auth/AuthPanel";
import { ProductPlaceholder } from "@/components/product/ProductPlaceholder";
import { createUnavailablePatientDashboard } from "@/lib/patient-dashboard";
import {
  requiredConsentsBeforeMdi,
  requiredMedicationDisclosureConsents,
} from "@/lib/consents";
import { BillingSetupClient } from "@/app/billing/BillingSetupClient";
import { PatientDashboardClient } from "@/app/dashboard/PatientDashboardClient";
import { GetStartedStartClient } from "@/app/get-started/GetStartedStartClient";
import { IntakePrecheckClient } from "@/app/intake/IntakePrecheckClient";
import { ConsentAcceptanceClient } from "@/app/onboarding/consent/ConsentAcceptanceClient";
import { MdiIntakeClient } from "@/app/onboarding/mdi/MdiIntakeClient";
import { RequirePatientSession } from "./session";

export function PatientApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate replace to="/dashboard" />} />
        <Route path="/sign-in" element={<AuthPage mode="sign-in" />} />
        <Route path="/sign-up" element={<AuthPage mode="sign-up" />} />
        <Route path="/reset-password" element={<AuthPage mode="reset-password" />} />
        <Route path="/verify-email" element={<AuthPage mode="verify-email" />} />
        <Route path="/sign-out" element={<AuthPage mode="sign-out" />} />
        <Route path="/get-started" element={<GetStartedPage />} />
        <Route path="/intake" element={<IntakePage />} />
        <Route
          path="/onboarding/consent"
          element={<Protected><ConsentPage /></Protected>}
        />
        <Route
          path="/onboarding/mdi"
          element={<Protected><MdiPage /></Protected>}
        />
        <Route
          path="/dashboard"
          element={<Protected><PatientDashboardClient initialDashboard={createUnavailablePatientDashboard()} /></Protected>}
        />
        <Route path="/billing" element={<Protected><BillingSetupClient /></Protected>} />
        <Route path="/account" element={<Protected><AccountPage /></Protected>} />
        <Route path="/medication-management" element={<Protected><MedicationManagementPage /></Protected>} />
        <Route path="*" element={<Navigate replace to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  );
}

function Protected({ children }: { children: ReactNode }) {
  return <RequirePatientSession>{children}</RequirePatientSession>;
}

function AuthPage({ mode }: { mode: AuthPanelMode }) {
  const [params] = useSearchParams();
  return (
    <>
      <Nav variant="light" />
      <main id="main">
        <AuthPanel mode={mode} returnTo={params.get("returnTo")} />
      </main>
      <Footer />
    </>
  );
}

function GetStartedPage() {
  return (
    <>
      <Nav variant="light" />
      <main id="main">
        <section className="mx-auto grid max-w-page gap-10 px-6 py-16 text-ink md:grid-cols-[0.9fr_1fr] md:px-10 md:py-24">
          <div className="max-w-3xl">
            <p className="text-eyebrow uppercase text-ash">Start a visit</p>
            <h1 className="display-serif mt-4 text-display-md font-light text-balance">
              Start with the privacy notice.
            </h1>
            <p className="mt-5 text-pretty text-[1.0625rem] text-ink/75">
              Review the privacy notice, answer a short precheck, then create
              or sign in to your account if online intake is a fit. Clinical
              questionnaire answers come later through MD Integrations.
            </p>
            <div className="mt-8 flex flex-wrap gap-4 text-[0.95rem] font-medium text-clay-deep">
              <a className="hover:text-clay" href="/#what-we-treat">See what we treat</a>
              <a className="hover:text-clay" href="/#how-it-works">How a visit goes</a>
            </div>
          </div>
          <div>
            <GetStartedStartClient />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function IntakePage() {
  return (
    <>
      <Nav variant="light" />
      <main id="main" className="text-ink">
        <section className="mx-auto grid max-w-page gap-10 px-6 py-16 md:grid-cols-[0.85fr_1.15fr] md:px-10 md:py-24">
          <div className="max-w-prose">
            <p className="text-eyebrow uppercase text-ash">Onboarding</p>
            <h1 className="display-serif mt-4 text-display-md font-light text-balance">
              Privacy notice, then a short precheck.
            </h1>
            <p className="mt-5 text-pretty text-[1.0625rem] text-ink/75">
              Start by acknowledging the privacy notice, then answer a few
              basics so Apoth can route you before account setup. Medical
              questionnaire answers are collected later by MD Integrations.
            </p>
            <p className="mt-6 text-[1rem] text-ink/65">
              This is not a clinical decision. A licensed clinician decides
              whether care is appropriate after reviewing your MDI intake.
            </p>
          </div>
          <IntakePrecheckClient />
        </section>
      </main>
      <Footer />
    </>
  );
}

function ConsentPage() {
  return (
    <>
      <Nav variant="light" />
      <main id="main">
        <section className="mx-auto max-w-page px-6 py-16 text-ink md:px-10 md:py-24">
          <ConsentAcceptanceClient
            medicationConsents={requiredMedicationDisclosureConsents({ treatment: "weight" })}
            preMdiConsents={requiredConsentsBeforeMdi()}
          />
        </section>
      </main>
      <Footer />
    </>
  );
}

function MdiPage() {
  return (
    <main className="bg-cream px-5 py-10 text-ink sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 max-w-3xl">
          <p className="text-eyebrow uppercase text-ash">Onboarding</p>
          <h1 className="mt-4 text-[2rem] font-semibold leading-tight text-ink sm:text-[2.6rem]">
            MDI questionnaire
          </h1>
          <p className="mt-4 text-[1.05rem] leading-7 text-ink/72">
            Answer the MDI questionnaire here after your profile is linked.
            Apoth sends responses to MDI and keeps only the handoff status and
            opaque case pointers. Medication disclosure comes after submission
            when it applies.
          </p>
        </div>
        <MdiIntakeClient />
      </div>
    </main>
  );
}

function AccountPage() {
  return (
    <ProductPlaceholder
      eyebrow="Patient account"
      title="Account"
      body="Manage basic account settings for the Apoth technology platform."
    />
  );
}

function MedicationManagementPage() {
  return (
    <ProductPlaceholder
      eyebrow="Medication management"
      title="Medication management"
      body="Access medication-management workflow links and status once MDI-backed care actions are available for your case."
    />
  );
}
