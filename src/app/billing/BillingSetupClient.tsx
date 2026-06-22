"use client";

import { useState } from "react";
import { ProductRouteState } from "@/components/product/ProductRouteState";

type BillingSetupState =
  | "already_collected"
  | "declined"
  | "idle"
  | "not_ready"
  | "preparing"
  | "ready"
  | "redirecting"
  | "unavailable";

export function BillingSetupClient({
  navigate = (url: string) => window.location.assign(url),
}: {
  navigate?: (url: string) => void;
} = {}) {
  const [state, setState] = useState<BillingSetupState>("idle");

  async function preparePaymentMethod() {
    if (state === "preparing" || state === "redirecting") {
      return;
    }
    setState("preparing");
    try {
      const response = await fetch("/api/billing/payment-method", {
        cache: "no-store",
        headers: { Accept: "application/json" },
        method: "POST",
      });
      const body = await response.json() as { error?: string; status?: string };
      if (response.ok && body.status === "payment_method_already_collected") {
        setState("already_collected");
        return;
      }
      if (response.ok && isCheckoutSessionResponse(body)) {
        setState("redirecting");
        navigate(body.checkoutUrl);
        return;
      }
      if (body.error === "clinical_declined") {
        setState("declined");
        return;
      }
      if (body.error === "authentication_required") {
        navigate(`/sign-in?returnTo=${encodeURIComponent("/billing")}`);
        return;
      }
      setState(body.error === "payment_not_ready" ? "not_ready" : "unavailable");
    } catch {
      setState("unavailable");
    }
  }

  return (
    <ProductRouteState
      eyebrow="Billing"
      tone="billing"
      live
      status={statusLabel(state)}
      title={titleForState(state)}
      body={bodyForState(state)}
      actions={actionsForState(state, preparePaymentMethod)}
    />
  );
}

function statusLabel(state: BillingSetupState) {
  switch (state) {
    case "already_collected":
      return "Payment method saved";
    case "declined":
      return "Billing locked";
    case "not_ready":
      return "Clinical review pending";
    case "preparing":
      return "Preparing";
    case "ready":
      return "Ready to collect";
    case "redirecting":
      return "Opening Stripe";
    case "unavailable":
      return "Unavailable";
    case "idle":
      return "Deferred charge";
  }
}

function titleForState(state: BillingSetupState) {
  switch (state) {
    case "already_collected":
      return "Your payment method is ready.";
    case "declined":
      return "Billing is not available for this case.";
    case "not_ready":
      return "Billing is still locked.";
    case "ready":
      return "Payment method setup is ready.";
    case "redirecting":
      return "Opening secure payment setup.";
    case "unavailable":
      return "Billing setup is temporarily unavailable.";
    case "preparing":
      return "Preparing secure setup.";
    case "idle":
      return "Add a payment method without starting billing.";
  }
}

function bodyForState(state: BillingSetupState) {
  switch (state) {
    case "already_collected":
      return "Your payment method is saved for the Apoth account workflow. Billing still depends on the clinical approval event.";
    case "declined":
      return "No charge or active subscription was created. Return to the dashboard for next steps or contact support for account and billing questions.";
    case "not_ready":
      return "No charge or active subscription was created. If your case is still in review, return to the dashboard for the latest status.";
    case "ready":
      return "Stripe setup is ready without creating a charge or active subscription.";
    case "redirecting":
      return "You are being sent to Stripe to save a payment method. This setup step does not create a charge or active subscription.";
    case "unavailable":
      return "No payment method was collected or changed. Try again from the dashboard when billing setup is available.";
    case "preparing":
      return "Apoth is preparing a Stripe payment-method setup only. No charge or subscription is created by this step.";
    case "idle":
      return "Apoth can prepare a Stripe payment-method setup for your account. Billing cannot activate until the selected clinical approval event is mirrored.";
  }
}

function actionsForState(
  state: BillingSetupState,
  preparePaymentMethod: () => void,
) {
  if (
    state === "already_collected" ||
    state === "declined" ||
    state === "ready" ||
    state === "redirecting"
  ) {
    return [{ href: "/dashboard", label: "Dashboard" }];
  }

  return [
    {
      disabled: state === "preparing",
      label: state === "preparing" ? "Preparing" : "Prepare payment method",
      onClick: preparePaymentMethod,
    },
    { href: "/dashboard", label: "Dashboard", variant: "secondary" as const },
  ];
}

function isCheckoutSessionResponse(
  body: { error?: string; status?: string },
): body is { checkoutUrl: string; status: "checkout_session_created" } {
  if (
    body.status !== "checkout_session_created" ||
    typeof (body as { checkoutUrl?: unknown }).checkoutUrl !== "string"
  ) {
    return false;
  }

  try {
    const url = new URL((body as { checkoutUrl: string }).checkoutUrl);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
}
