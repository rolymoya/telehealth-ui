import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { apiJson } from "@/patient/api";

type CompletionState =
  | { status: "waiting" }
  | { status: "auth_required" }
  | { status: "binding" }
  | { status: "error"; message: string };

type EnrollmentStatusResponse = {
  identityBound: boolean;
  paymentSetupComplete: boolean;
  status:
    | "checkout_session_pending"
    | "payment_setup_complete"
    | "identity_bound";
};

export function CheckoutCompletion() {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<CompletionState>({ status: "waiting" });
  const attempts = useRef(0);
  const checkoutEmail = checkoutEmailFromLocationState(location.state);

  useEffect(() => {
    if (globalThis.location.search || globalThis.location.hash) {
      globalThis.history.replaceState(
        globalThis.history.state,
        "",
        "/checkout/complete",
      );
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      const result = await apiJson<EnrollmentStatusResponse>(
        "/api/enrollment/status",
        { cache: "no-store" },
      );
      if (!active) {
        return;
      }
      if (!result.ok) {
        setState({
          status: "error",
          message: result.error === "enrollment_expired"
            ? "This enrollment expired before it could be completed."
            : "We could not verify payment setup. Refresh to try again.",
        });
        return;
      }
      if (result.value.identityBound) {
        navigate("/intake", { replace: true });
        return;
      }
      if (!result.value.paymentSetupComplete) {
        attempts.current += 1;
        if (attempts.current >= 80) {
          setState({
            status: "error",
            message: "Stripe is still confirming payment setup. Refresh this page in a moment; no charge occurred.",
          });
          return;
        }
        timer = setTimeout(poll, 1500);
        return;
      }

      setState({ status: "binding" });
      const bound = await apiJson<{
        redirect: string;
        status: "identity_bound";
      }>("/api/enrollment/bind", {
        body: "{}",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!active) {
        return;
      }
      if (bound.ok) {
        navigate(bound.value.redirect, { replace: true });
        return;
      }
      if (bound.response?.status === 401 || bound.error === "authentication_required") {
        setState({ status: "auth_required" });
        return;
      }
      setState({
        status: "error",
        message: "Your payment method is saved, but we could not link your account yet. Refresh to try again.",
      });
    }

    void poll();
    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [navigate]);

  if (state.status === "auth_required") {
    return (
      <div className="min-h-screen bg-[#f9f9fa]">
        <CompletionHeader />
        <div className="mx-auto max-w-[1120px] px-5 pt-9 md:px-8">
          <div className="rounded-[20px] border border-[#397057]/15 bg-[#e2f1eb] px-5 py-4 text-[0.94rem] leading-6 text-[#285540]">
            <span className="font-semibold">Payment method saved.</span>{" "}
            Create and verify your account to continue to intake. No charge occurred.
          </div>
        </div>
        <AuthPanel
          initialEmail={checkoutEmail}
          mode="sign-up"
          returnTo="/checkout/complete"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9f9fa]">
      <CompletionHeader />
      <main className="mx-auto max-w-[760px] px-5 py-20 text-center text-ink md:py-28">
        {state.status === "error" ? (
          <>
            <p className="text-eyebrow uppercase text-[#a53f2b]">Action needed</p>
            <h1 className="display-serif mt-4 text-[2.7rem] font-light">
              We’re holding your place.
            </h1>
            <p className="mx-auto mt-5 max-w-[580px] leading-7 text-ink/65">
              {state.message}
            </p>
            <button
              type="button"
              onClick={() => globalThis.location.reload()}
              className="mt-8 min-h-12 rounded-full bg-[#171719] px-7 font-semibold text-white"
            >
              Check again
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e2f1eb] text-[#397057]">
              {state.status === "binding" ? (
                <Check className="h-7 w-7" aria-hidden="true" />
              ) : (
                <LoaderCircle className="h-7 w-7 animate-spin" aria-hidden="true" />
              )}
            </div>
            <p className="mt-8 text-eyebrow uppercase text-[#315fbf]">
              {state.status === "binding" ? "Payment method saved" : "Confirming with Stripe"}
            </p>
            <h1 className="display-serif mt-4 text-[2.7rem] font-light sm:text-[3.6rem]">
              {state.status === "binding"
                ? "Linking your secure account."
                : "Finishing payment setup."}
            </h1>
            <p className="mx-auto mt-5 max-w-[580px] leading-7 text-ink/65">
              This page waits for Stripe’s verified confirmation. No charge
              occurs today, and billing remains locked until clinical approval.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function CompletionHeader() {
  return (
    <header className="border-b border-black/[0.06] bg-white">
      <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between px-5 md:px-8">
        <a href="/" className="font-serif text-[32px] font-bold tracking-[-0.06em]" aria-label="Apoth home">
          apoth
        </a>
        <span className="flex items-center gap-2 text-[0.8rem] text-ink/50">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Secure enrollment
        </span>
      </div>
    </header>
  );
}

function checkoutEmailFromLocationState(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "checkoutEmail" in value &&
    typeof value.checkoutEmail === "string" &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.checkoutEmail)
  ) {
    return value.checkoutEmail;
  }
  return undefined;
}
