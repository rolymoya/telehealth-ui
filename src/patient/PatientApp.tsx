import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import type { ReactNode } from "react";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { AuthPanel, type AuthPanelMode } from "@/components/auth/AuthPanel";
import { ProductPlaceholder } from "@/components/product/ProductPlaceholder";
import { createUnavailablePatientDashboard } from "@/lib/patient-dashboard";
import { BillingSetupClient } from "@/app/billing/BillingSetupClient";
import { PatientDashboardClient } from "@/app/dashboard/PatientDashboardClient";
import { CheckoutCompletion } from "@/patient/commerce/CheckoutCompletion";
import { CheckoutStart } from "@/patient/commerce/CheckoutStart";
import { PortalLaunch } from "@/patient/commerce/PortalLaunch";
import { RequirePatientSession } from "./session";

export function PatientApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate replace to="/dashboard" />} />
        <Route path="/checkout" element={<CheckoutStart />} />
        <Route path="/checkout/complete" element={<CheckoutCompletion />} />
        <Route path="/verify" element={<CheckoutCompletion />} />
        <Route path="/sign-in" element={<AuthPage mode="sign-in" />} />
        <Route path="/sign-up" element={<Navigate replace to="/checkout?product=weight" />} />
        <Route path="/reset-password" element={<AuthPage mode="reset-password" />} />
        <Route path="/verify-email" element={<AuthPage mode="verify-email" />} />
        <Route path="/sign-out" element={<AuthPage mode="sign-out" />} />
        <Route path="/get-started" element={<Navigate replace to="/checkout?product=weight" />} />
        <Route path="/intake" element={<Navigate replace to="/checkout?product=weight" />} />
        <Route
          path="/onboarding/consent"
          element={<Protected><Navigate replace to="/portal/launch" /></Protected>}
        />
        <Route
          path="/onboarding/mdi"
          element={<Protected><Navigate replace to="/portal/launch" /></Protected>}
        />
        <Route
          path="/dashboard"
          element={<Protected><PatientDashboardClient initialDashboard={createUnavailablePatientDashboard()} /></Protected>}
        />
        <Route path="/billing" element={<Protected><BillingSetupClient /></Protected>} />
        <Route path="/account" element={<Protected><AccountPage /></Protected>} />
        <Route path="/portal/launch" element={<Protected><PortalLaunch /></Protected>} />
        <Route path="/medication-management" element={<Protected><Navigate replace to="/portal/launch" /></Protected>} />
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

function AccountPage() {
  return (
    <ProductPlaceholder
      eyebrow="Patient account"
      title="Account"
      body="Manage basic account settings for the Apoth technology platform."
    />
  );
}
