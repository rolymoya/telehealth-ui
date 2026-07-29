import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, LoaderCircle, Mail, RotateCcw } from "lucide-react";
import { apiJson } from "@/patient/api";
import { CommerceShell } from "@/patient/commerce/CommerceShell";

type EnrollmentStatus =
  | "checkout_processing"
  | "verification_ready"
  | "account_ready"
  | "portal_ready"
  | "payment_setup_failed"
  | "restart_required";

type StatusResponse = { status?: EnrollmentStatus };
type OtpStartResponse = { status?: string; transactionHandle?: string };
type OtpConfirmResponse = { status?: string; redirect?: string };

export function CheckoutCompletion() {
  const [status, setStatus] = useState<EnrollmentStatus>("checkout_processing");
  const [statusUnavailable, setStatusUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    async function poll() {
      const result = await apiJson<StatusResponse>("/api/enrollment/status", { cache: "no-store" });
      if (!active) return;
      if (result.ok && result.value.status) {
        setStatus(result.value.status);
        setStatusUnavailable(false);
        if (["account_ready", "portal_ready"].includes(result.value.status)) {
          window.location.replace("/portal/launch");
          return;
        }
        if (result.value.status !== "checkout_processing") return;
      } else if (attempt > 3) {
        setStatusUnavailable(true);
      }
      attempt += 1;
      timer = setTimeout(poll, Math.min(1_000 * 1.45 ** attempt, 5_000));
    }
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <CommerceShell stage={status === "verification_ready" ? "verify" : "checkout"}>
      <main className="mx-auto min-h-[610px] max-w-[900px] px-5 py-12 sm:px-8 sm:py-20">
        {status === "verification_ready" ? (
          <EmailVerification />
        ) : status === "payment_setup_failed" || status === "restart_required" ? (
          <RecoveryState status={status} />
        ) : (
          <section className="mx-auto max-w-[680px] text-center" role="status">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e2f1eb]">
              <LoaderCircle className="h-7 w-7 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            </div>
            <p className="mt-8 text-[11px] font-bold uppercase tracking-[0.13em] text-black/40">Payment details received</p>
            <h1 className="mt-3 text-[clamp(2.4rem,7vw,4.8rem)] font-bold leading-[0.94] tracking-[-0.06em]">
              Confirming your secure checkout.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-7 text-black/58">
              Stripe is confirming that your payment method was saved. You have not been charged.
            </p>
            {statusUnavailable ? (
              <p className="mx-auto mt-7 max-w-lg rounded-2xl bg-white p-4 text-sm leading-5 shadow-soft" role="alert">
                Confirmation is taking longer than usual. Keep this page open; it will continue checking automatically.
              </p>
            ) : null}
          </section>
        )}
      </main>
    </CommerceShell>
  );
}

function EmailVerification() {
  const [transactionHandle, setTransactionHandle] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<"ready" | "sending" | "sent" | "confirming" | "error">("ready");
  const codeRef = useRef<HTMLInputElement>(null);

  async function sendCode() {
    if (state === "sending") return;
    setState("sending");
    const result = await apiJson<OtpStartResponse>("/api/auth/email-otp/start", {
      body: "{}",
      headers: {
        "content-type": "application/json",
        "x-apoth-checkout-intent": "start-email-otp",
      },
      method: "POST",
    });
    if (result.ok && typeof result.value.transactionHandle === "string") {
      setTransactionHandle(result.value.transactionHandle);
      setState("sent");
      requestAnimationFrame(() => codeRef.current?.focus());
      return;
    }
    setState("error");
  }

  async function confirmCode(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code) || !transactionHandle) return;
    setState("confirming");
    const result = await apiJson<OtpConfirmResponse>("/api/auth/email-otp/confirm", {
      body: JSON.stringify({ code, transactionHandle }),
      headers: {
        "content-type": "application/json",
        "x-apoth-checkout-intent": "confirm-email-otp",
      },
      method: "POST",
    });
    if (result.ok && result.value.status === "account_created") {
      window.location.replace("/portal/launch");
      return;
    }
    setState("error");
  }

  return (
    <section className="mx-auto grid max-w-[820px] overflow-hidden rounded-[28px] bg-white shadow-[0_22px_70px_rgba(18,18,20,0.09)] md:grid-cols-[0.82fr_1.18fr]">
      <div className="bg-[#4e80ee] p-7 text-white sm:p-10">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-white/15"><Mail className="h-5 w-5" aria-hidden="true" /></div>
        <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.13em] text-white/60">Your account</p>
        <h1 className="mt-2 text-3xl font-bold leading-[1] tracking-[-0.05em]">Confirm the email used at checkout.</h1>
        <p className="mt-5 text-sm leading-6 text-white/75">
          This keeps someone from creating an account with another person’s email. No password is needed.
        </p>
      </div>
      <div className="p-7 sm:p-10">
        {state === "ready" || state === "sending" ? (
          <>
            <p className="text-sm leading-6 text-black/58">We’ll send a six-digit code to the email entered in Stripe Checkout.</p>
            <button className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#171719] px-6 text-sm font-bold text-white disabled:opacity-65" disabled={state === "sending"} onClick={sendCode} type="button">
              {state === "sending" ? "Sending code…" : "Email me a code"}
              {state !== "sending" ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
            </button>
          </>
        ) : (
          <form onSubmit={confirmCode}>
            <label className="text-sm font-bold" htmlFor="email-code">Six-digit code</label>
            <input
              ref={codeRef}
              id="email-code"
              autoComplete="one-time-code"
              className="mt-3 min-h-14 w-full rounded-2xl border border-black/15 px-4 text-center text-2xl font-bold tracking-[0.32em]"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              value={code}
            />
            <button className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#171719] px-6 text-sm font-bold text-white disabled:opacity-55" disabled={!/^\d{6}$/.test(code) || state === "confirming"} type="submit">
              {state === "confirming" ? "Creating your account…" : "Confirm and continue"}
              {state !== "confirming" ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
            </button>
            <button className="mt-4 w-full text-xs font-semibold text-black/55 underline underline-offset-4" onClick={sendCode} type="button">Send a new code</button>
          </form>
        )}
        {state === "error" ? (
          <div className="mt-5 rounded-2xl bg-[#fff2ee] p-4 text-sm leading-5" role="alert">
            The code could not be confirmed. Check the six digits or send a new code.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function RecoveryState({ status }: { status: "payment_setup_failed" | "restart_required" }) {
  return (
    <section className="mx-auto max-w-[650px] rounded-[28px] bg-white p-8 text-center shadow-soft sm:p-12">
      <RotateCcw className="mx-auto h-8 w-8" aria-hidden="true" />
      <h1 className="mt-5 text-4xl font-bold tracking-[-0.05em]">Restart secure checkout</h1>
      <p className="mt-4 text-base leading-7 text-black/58">
        {status === "payment_setup_failed"
          ? "Your payment method was not saved, and you were not charged."
          : "This checkout session expired before your account was created."}
      </p>
      <a className="mt-7 inline-flex min-h-12 items-center rounded-full bg-[#171719] px-7 text-sm font-bold text-white" href="/checkout?product=weight">Return to checkout</a>
    </section>
  );
}
