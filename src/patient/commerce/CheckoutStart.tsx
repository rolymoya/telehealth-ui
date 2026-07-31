import {
  ExpressCheckoutElement,
  PaymentElement,
  CheckoutProvider,
  useCheckout,
} from "@stripe/react-stripe-js/checkout";
import { loadStripe } from "@stripe/stripe-js/pure";
import type {
  StripeCheckoutOptions,
  StripeExpressCheckoutElementConfirmEvent,
} from "@stripe/stripe-js";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { Check, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";
import { apiJson } from "@/patient/api";
import { publicStripeConfig } from "@/patient/config";
import {
  isPublicProductCode,
  publicProduct,
  type PublicProductCode,
} from "@/lib/public-commerce";
import { checkoutConsentVersion } from "../../../shared/enrollment/checkout-consent";

type CheckoutInitialization =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "custom"; clientSecret: string; productCode: PublicProductCode }
  | { status: "complete" };

type CheckoutApiResponse =
  | {
      clientSecret: string;
      status: "checkout_session_created";
      uiMode: "custom";
    }
  | {
      checkoutUrl: string;
      status: "checkout_session_created";
      uiMode: "hosted";
    }
  | {
      status: "payment_setup_complete" | "identity_bound";
    };

const stripePromises = new Map<string, ReturnType<typeof loadStripe>>();

export function CheckoutStart({ productCode }: { productCode: string | null }) {
  const navigate = useNavigate();
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<CheckoutInitialization>(() =>
    isPublicProductCode(productCode)
      ? { status: "loading" }
      : {
          status: "error",
          message: "That plan is not available. Choose a current Apoth plan to continue.",
        }
  );
  const stripeConfig = publicStripeConfig();

  useEffect(() => {
    if (!isPublicProductCode(productCode)) {
      return;
    }
    if (!stripeConfig.ok) {
      setState({
        status: "error",
        message: "Secure checkout is not configured for this environment.",
      });
      return;
    }

    let active = true;
    setState({ status: "loading" });
    void initializeCheckout(productCode).then((result) => {
      if (!active) {
        return;
      }
      if (!result.ok) {
        setState({
          status: "error",
          message: checkoutInitializationMessage(result.error),
        });
        return;
      }
      if (result.value.status !== "checkout_session_created") {
        setState({ status: "complete" });
        navigate("/checkout/complete", { replace: true });
        return;
      }
      if (result.value.uiMode === "hosted") {
        globalThis.location.assign(result.value.checkoutUrl);
        return;
      }
      setState({
        status: "custom",
        clientSecret: result.value.clientSecret,
        productCode,
      });
    });
    return () => {
      active = false;
    };
  }, [navigate, productCode, retryKey, stripeConfig.ok]);

  if (state.status === "loading" || state.status === "complete") {
    return <CheckoutShell><CheckoutLoading /></CheckoutShell>;
  }
  if (state.status === "error") {
    return (
      <CheckoutShell>
        <CheckoutUnavailable
          message={state.message}
          onRetry={() => setRetryKey((value) => value + 1)}
        />
      </CheckoutShell>
    );
  }
  if (!stripeConfig.ok) {
    return null;
  }

  const stripePromise = stripePromiseFor(stripeConfig.publishableKey);
  const options = checkoutProviderOptions(state.clientSecret);
  return (
    <CheckoutProvider stripe={stripePromise} options={options}>
      <CheckoutForm
        productCode={state.productCode}
        onComplete={(email) =>
          navigate("/checkout/complete", {
            replace: true,
            state: { checkoutEmail: email },
          })}
      />
    </CheckoutProvider>
  );
}

function stripePromiseFor(publishableKey: string) {
  const existing = stripePromises.get(publishableKey);
  if (existing) {
    return existing;
  }
  const created = loadStripe(publishableKey);
  stripePromises.set(publishableKey, created);
  return created;
}

function CheckoutForm({
  onComplete,
  productCode,
}: {
  onComplete: (email: string) => void;
  productCode: PublicProductCode;
}) {
  const checkoutState = useCheckout();
  const product = publicProduct(productCode)!;
  const [email, setEmail] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [paymentReady, setPaymentReady] = useState(false);
  const [walletVisible, setWalletVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  if (checkoutState.type === "loading") {
    return <CheckoutShell><CheckoutLoading /></CheckoutShell>;
  }
  if (checkoutState.type === "error") {
    return (
      <CheckoutShell>
        <CheckoutUnavailable
          message="The secure payment form could not load. Refresh the page to resume this checkout."
          onRetry={() => globalThis.location.reload()}
        />
      </CheckoutShell>
    );
  }

  const checkout = checkoutState.checkout;
  const dueToday = checkout.total.total.amount;

  async function synchronizeEmail() {
    const normalized = email.trim();
    if (!normalized) {
      setError("Enter the email address you want to use for your Apoth account.");
      return false;
    }
    const updated = await checkout.updateEmail(normalized);
    if (updated.type === "error") {
      setError(updated.error.message);
      return false;
    }
    return true;
  }

  async function recordConsent() {
    if (!consentAccepted) {
      setError("Accept the terms and payment-method authorization to continue.");
      return false;
    }
    const result = await apiJson<{
      status: "consent_recorded";
    }>("/api/enrollment/consent", {
      body: JSON.stringify({ consentVersion: checkoutConsentVersion }),
      cache: "no-store",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!result.ok) {
      setError(
        result.error === "enrollment_expired"
          ? "This checkout expired. Return to the plan page and start again."
          : "We could not record your authorization. Check your connection and try again.",
      );
      return false;
    }
    return true;
  }

  async function confirm(
    expressCheckoutConfirmEvent?: StripeExpressCheckoutElementConfirmEvent,
  ) {
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (!(await synchronizeEmail())) {
        return;
      }
      if (!checkout.canConfirm) {
        setError("Complete all required payment details before continuing.");
        return;
      }
      if (!(await recordConsent())) {
        return;
      }
      const result = await checkout.confirm({
        ...(expressCheckoutConfirmEvent ? { expressCheckoutConfirmEvent } : {}),
        redirect: "if_required",
      });
      if (result.type === "error") {
        setError(
          result.error.message ||
            "Your payment method could not be saved. Review the details and try again.",
        );
        return;
      }
      onComplete(email.trim());
    } catch (caughtError) {
      setError(checkoutConfirmationMessage(caughtError));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void confirm();
  }

  return (
    <CheckoutShell>
      <main className="checkout-ledger mx-auto grid w-full max-w-[1180px] gap-8 px-5 pb-16 pt-7 text-ink md:px-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:gap-14 lg:pb-24 lg:pt-14">
        <section className="min-w-0">
          <div className="mb-9 flex items-center gap-3 text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-ink/45">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#4e80ee] text-white">1</span>
            <span>Plan</span>
            <span className="h-px w-7 bg-black/15" />
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#4e80ee] text-white">2</span>
            <span>Account</span>
            <span className="h-px w-7 bg-black/15" />
            <span className="grid h-7 w-7 place-items-center rounded-full border border-black/15 bg-white text-ink/55">3</span>
            <span>Intake</span>
          </div>

          <p className="text-eyebrow uppercase text-[#315fbf]">Secure enrollment</p>
          <h1 className="display-serif mt-3 max-w-[680px] text-[2.55rem] font-light leading-[0.98] tracking-[-0.035em] sm:text-[4rem]">
            Set up your account. Pay nothing today.
          </h1>
          <p className="mt-5 max-w-[660px] text-[1.05rem] leading-7 text-ink/65">
            Save a payment method now, verify your email next, then complete
            your clinical intake. Billing stays locked unless a licensed
            clinician approves care.
          </p>

          <form className="mt-10 space-y-8" onSubmit={onSubmit}>
            <fieldset className="space-y-3">
              <legend className="text-[0.78rem] font-bold uppercase tracking-[0.12em] text-ink/50">
                Account email
              </legend>
              <label className="block" htmlFor="checkout-email">
                <span className="sr-only">Email address</span>
                <input
                  id="checkout-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onBlur={() => void synchronizeEmail()}
                  onChange={(event) => {
                    setEmail(event.currentTarget.value);
                    setError(null);
                  }}
                  placeholder="you@example.com"
                  className="min-h-[56px] w-full rounded-[16px] border border-black/15 bg-white px-4 text-[1rem] outline-none transition focus:border-[#4e80ee] focus:ring-4 focus:ring-[#4e80ee]/10"
                />
              </label>
              <p className="text-[0.86rem] leading-5 text-ink/50">
                You’ll verify this address with a one-time code after payment setup.
              </p>
            </fieldset>

            <section aria-label="Payment method" className="space-y-6">
              <div
                className={walletVisible ? "block" : "h-0 overflow-hidden"}
                aria-hidden={!walletVisible}
              >
                <ExpressCheckoutElement
                  onConfirm={(event) => void confirm(event)}
                  onLoadError={() =>
                    setError("A wallet option could not load. Use another payment method below.")}
                  onReady={({ availablePaymentMethods }) =>
                    setWalletVisible(Boolean(availablePaymentMethods))}
                />
              </div>
              {walletVisible ? (
                <div className="flex items-center gap-4 text-[0.72rem] font-bold uppercase tracking-[0.13em] text-ink/35">
                  <span className="h-px flex-1 bg-black/10" />
                  Or use another method
                  <span className="h-px flex-1 bg-black/10" />
                </div>
              ) : null}
              <div className="rounded-[18px] border border-black/[0.08] bg-white p-4 shadow-[0_10px_40px_rgba(23,23,25,0.05)] sm:p-5">
                <PaymentElement
                  options={{ layout: "accordion" }}
                  onLoadError={() =>
                    setError("The secure payment form could not load. Refresh and try again.")}
                  onReady={() => setPaymentReady(true)}
                />
              </div>
              {!paymentReady ? (
                <p role="status" className="text-[0.9rem] text-ink/55">
                  Loading secure payment methods…
                </p>
              ) : null}
            </section>

            <label className="flex cursor-pointer items-start gap-3 rounded-[18px] border border-black/[0.08] bg-[#f2f2f4] p-4 text-[0.92rem] leading-6 text-ink/70">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(event) => {
                  setConsentAccepted(event.currentTarget.checked);
                  setError(null);
                }}
                className="mt-1 h-5 w-5 shrink-0 accent-[#4e80ee]"
                required
              />
              <span>
                I accept Apoth’s <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-2">Terms</a> and{" "}
                <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-2">Privacy Policy</a>. I authorize
                Apoth to save this payment method and charge it in the future
                only after clinical approval. <strong className="font-semibold text-ink">No charge occurs today.</strong>
              </span>
            </label>

            {error ? (
              <p
                className="rounded-[16px] border border-[#a53f2b]/20 bg-[#fff5f2] px-4 py-3 text-[0.94rem] leading-6 text-[#7d2e22]"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting || !paymentReady || !checkout.canConfirm}
              className="flex min-h-[58px] w-full items-center justify-center gap-2 rounded-full bg-[#171719] px-6 text-[1rem] font-semibold text-white transition hover:-translate-y-px hover:bg-[#303034] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4e80ee] disabled:cursor-wait disabled:bg-[#a2a3a7]"
            >
              {submitting ? "Securing your payment method…" : "Create account and continue"}
              {!submitting ? <LockKeyhole className="h-4 w-4" aria-hidden="true" /> : null}
            </button>
          </form>
        </section>

        <aside className="lg:pt-14">
          <div className="sticky top-8 overflow-hidden rounded-[26px] border border-black/[0.06] bg-[#e7efff] shadow-soft">
            <div className="border-b border-[#4e80ee]/15 px-6 py-6">
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-[#315fbf]">
                Your plan
              </p>
              <h2 className="mt-3 text-[1.35rem] font-semibold tracking-[-0.025em]">
                {product.planName}
              </h2>
              <p className="mt-2 text-[0.92rem] text-ink/55">{product.displayName}</p>
            </div>
            <div className="space-y-5 px-6 py-6">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[2.25rem] font-semibold tracking-[-0.055em]">{product.priceLabel}</p>
                  <p className="max-w-[190px] text-[0.82rem] leading-5 text-ink/50">{product.priceDetail}</p>
                </div>
                <div className="text-right">
                  <p className="text-[1.55rem] font-semibold">{dueToday}</p>
                  <p className="text-[0.75rem] uppercase tracking-[0.1em] text-ink/45">due today</p>
                </div>
              </div>
              <ul className="space-y-3 border-t border-[#4e80ee]/15 pt-5 text-[0.9rem] text-ink/65">
                {[
                  "Payment method saved securely by Stripe",
                  "Email verification required",
                  "Billing locked until clinical approval",
                ].map((item) => (
                  <li className="flex gap-2.5" key={item}>
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#315fbf]" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2 rounded-[14px] bg-white/65 px-3 py-3 text-[0.8rem] leading-5 text-ink/55">
                <ShieldCheck className="h-5 w-5 shrink-0 text-[#397057]" aria-hidden="true" />
                Card and wallet details go directly to Stripe and never touch Apoth servers.
              </div>
            </div>
          </div>
        </aside>
      </main>
    </CheckoutShell>
  );
}

function CheckoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f9f9fa]">
      <header className="border-b border-black/[0.06] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between px-5 md:px-8">
          <a
            href="/"
            className="font-serif text-[32px] font-bold leading-none tracking-[-0.06em]"
            aria-label="Apoth home"
          >
            apoth
          </a>
          <span className="flex items-center gap-2 text-[0.8rem] font-medium text-ink/50">
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            Secure checkout
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}

function CheckoutLoading() {
  return (
    <main className="mx-auto max-w-[760px] px-5 py-24 text-center text-ink" role="status">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-black/10 border-t-[#4e80ee]" />
      <h1 className="display-serif mt-8 text-[2.5rem] font-light">Preparing secure checkout.</h1>
      <p className="mt-4 text-ink/60">Resuming your enrollment and loading available payment methods.</p>
    </main>
  );
}

function CheckoutUnavailable({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="mx-auto max-w-[720px] px-5 py-24 text-center text-ink">
      <p className="text-eyebrow uppercase text-[#a53f2b]">Checkout unavailable</p>
      <h1 className="display-serif mt-4 text-[2.5rem] font-light">We couldn’t open secure checkout.</h1>
      <p className="mx-auto mt-5 max-w-[560px] leading-7 text-ink/65">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mx-auto mt-8 flex min-h-12 items-center gap-2 rounded-full bg-[#171719] px-6 font-semibold text-white"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Try again
      </button>
      <p className="mt-5 text-sm">
        <a href="/weight-loss" className="font-semibold text-[#315fbf] underline underline-offset-4">
          Return to weight management
        </a>
      </p>
    </main>
  );
}

async function initializeCheckout(productCode: PublicProductCode) {
  return apiJson<CheckoutApiResponse>("/api/enrollment/checkout", {
    body: JSON.stringify({ product: productCode }),
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-apoth-checkout-initialization": checkoutInitializationKey(productCode),
    },
    method: "POST",
  });
}

function checkoutInitializationKey(productCode: PublicProductCode) {
  const storageKey = `apoth:checkout-initialization:${productCode}`;
  const existing = globalThis.sessionStorage?.getItem(storageKey);
  if (existing) {
    return existing;
  }
  const created = globalThis.crypto.randomUUID();
  globalThis.sessionStorage?.setItem(storageKey, created);
  return created;
}

function checkoutProviderOptions(clientSecret: string): StripeCheckoutOptions {
  return {
    clientSecret,
    elementsOptions: {
      appearance: {
        theme: "stripe",
        variables: {
          borderRadius: "14px",
          colorBackground: "#ffffff",
          colorDanger: "#a53f2b",
          colorPrimary: "#4e80ee",
          colorText: "#171719",
          colorTextPlaceholder: "#85868b",
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSizeBase: "16px",
          spacingUnit: "4px",
        },
        rules: {
          ".Input": {
            border: "1px solid rgba(23, 23, 25, 0.16)",
            boxShadow: "none",
            padding: "14px",
          },
          ".Input:focus": {
            border: "1px solid #4e80ee",
            boxShadow: "0 0 0 4px rgba(78, 128, 238, 0.10)",
          },
          ".Label": {
            color: "#4d4e52",
            fontWeight: "600",
          },
        },
      },
      loader: "auto",
    },
  };
}

function checkoutInitializationMessage(error: string) {
  if (error === "invalid_product") {
    return "That plan is not available.";
  }
  if (error === "enrollment_expired") {
    return "This enrollment expired. Return to the plan page and start again.";
  }
  if (error === "network_unavailable") {
    return "Check your internet connection, then try again.";
  }
  return "Secure checkout is temporarily unavailable. Your payment method was not charged.";
}

function checkoutConfirmationMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Your payment method could not be saved. Review the details and try again.";
}
