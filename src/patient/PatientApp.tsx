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
import { BillingOfferClient } from "@/app/billing/activate/BillingOfferClient";
import { PatientDashboardClient } from "@/app/dashboard/PatientDashboardClient";
import { GetStartedStartClient } from "@/app/get-started/GetStartedStartClient";
import { IntakePrecheckClient } from "@/app/intake/IntakePrecheckClient";
import { ConsentAcceptanceClient } from "@/app/onboarding/consent/ConsentAcceptanceClient";
import { RequirePatientSession } from "./session";
import { CheckoutCompletion } from "./commerce/CheckoutCompletion";
import { PortalLaunch } from "./commerce/PortalLaunch";
import { isPublicProductCode } from "@/lib/public-commerce";

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
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/checkout/complete" element={<CheckoutCompletion />} />
        <Route path="/intake" element={<IntakePage />} />
        <Route
          path="/onboarding/consent"
          element={<Protected><ConsentPage /></Protected>}
        />
        <Route
          path="/onboarding/mdi"
          element={<Navigate replace to="/portal/launch" />}
        />
        <Route path="/portal/launch" element={<Protected><PortalLaunch /></Protected>} />
        <Route
          path="/dashboard"
          element={<Protected><PatientDashboardClient initialDashboard={createUnavailablePatientDashboard()} /></Protected>}
        />
        <Route path="/billing" element={<Protected><BillingSetupClient /></Protected>} />
        <Route path="/billing/activate" element={<Protected><BillingOfferPage /></Protected>} />
        <Route path="/account" element={<Protected><AccountPage /></Protected>} />
        <Route path="/medication-management" element={<Protected><MedicationManagementPage /></Protected>} />
        <Route path="*" element={<Navigate replace to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  );
}

function CheckoutPage() {
  const [params] = useSearchParams();
  const product = params.get("product");
  return (
    <Navigate
      replace
      to={isPublicProductCode(product)
        ? `/get-started?product=${encodeURIComponent(product)}`
        : "/get-started"}
    />
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
  const [params] = useSearchParams();
  const product = params.get("product");
  return (
    <>
      <Nav variant="light" />
      <main id="main">
        <section className="mx-auto grid max-w-[1120px] gap-5 px-5 py-10 text-ink md:grid-cols-[0.86fr_1fr] md:px-8 md:py-20">
          <div className="max-w-3xl rounded-[26px] bg-[#f5df75] p-7 shadow-soft sm:p-10">
            <p className="text-eyebrow uppercase text-black/55">Start a visit</p>
            <h1 className="display-serif mt-4 text-display-md font-light text-balance">
              Start with the privacy notice.
            </h1>
            <p className="mt-5 text-pretty text-[1.0625rem] text-ink/75">
              Review the privacy notice, answer a short precheck, then create
              or sign in to your account if online intake is a fit. Clinical
              questionnaire answers are collected in the independent provider’s secure portal.
            </p>
            <div className="mt-8 flex flex-wrap gap-4 text-[0.95rem] font-semibold text-[#171719]">
              <a className="underline decoration-black/25 underline-offset-4 hover:decoration-black" href="/weight-loss">Explore weight loss</a>
              <a className="underline decoration-black/25 underline-offset-4 hover:decoration-black" href="/weight-loss#how-it-works">How a visit goes</a>
            </div>
          </div>
          <div>
            <GetStartedStartClient productCode={isPublicProductCode(product) ? product : null} />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function IntakePage() {
  const [params] = useSearchParams();
  const product = params.get("product");
  return (
    <>
      <Nav variant="light" />
      <main id="main" className="text-ink">
        <section className="mx-auto grid max-w-[1120px] gap-5 px-5 py-10 md:grid-cols-[0.86fr_1fr] md:px-8 md:py-20">
          <div className="max-w-prose rounded-[26px] bg-[#e2f1eb] p-7 shadow-soft sm:p-10">
            <p className="text-eyebrow uppercase text-[#397057]">Onboarding</p>
            <h1 className="display-serif mt-4 text-display-md font-light text-balance">
              Privacy notice, then a short precheck.
            </h1>
            <p className="mt-5 text-pretty text-[1.0625rem] text-ink/75">
              Start by acknowledging the privacy notice, then answer a few
              basics so Apoth can route you before account setup. Medical
              questionnaire answers are collected later in the provider portal.
            </p>
            <p className="mt-6 text-[1rem] text-ink/65">
              This is not a clinical decision. A licensed clinician decides
              whether care is appropriate after reviewing your secure intake.
            </p>
          </div>
          <IntakePrecheckClient productCode={isPublicProductCode(product) ? product : null} />
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
        <section className="mx-auto max-w-[980px] px-5 py-10 text-ink md:px-8 md:py-20">
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

function AccountPage() {
  return (
    <ProductPlaceholder
      eyebrow="Patient account"
      title="Account"
      body="Manage basic account settings for the Apoth technology platform."
    />
  );
}

function BillingOfferPage() {
  return (
    <>
      <Nav variant="light" />
      <BillingOfferClient />
      <Footer />
    </>
  );
}

function MedicationManagementPage() {
  return (
    <ProductPlaceholder
      eyebrow="Medication management"
      title="Medication management"
      body="Access medication-management workflow links and status through your provider’s secure care portal."
    />
  );
}
