import { useState } from "react";
import { ArrowRight, Check, CreditCard, ShieldCheck, Smartphone } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { apiJson } from "@/patient/api";
import { CommerceShell } from "@/patient/commerce/CommerceShell";

type CheckoutResponse = {
  checkoutUrl?: string;
  status?: string;
};

const genericCheckoutError =
  "Checkout could not start. Refresh the page and try again. No payment information was collected.";
const localConfigurationError =
  "Local checkout needs Stripe test-mode configuration before it can open. No payment information was collected.";

export function CheckoutStart() {
  const [params] = useSearchParams();
  const product = params.get("product") ?? "weight";
  const productDetails = catalogPresentation[product];
  const [state, setState] = useState<"ready" | "starting" | "error">(
    productDetails ? "ready" : "error",
  );
  const [errorMessage, setErrorMessage] = useState(genericCheckoutError);

  async function continueToCheckout() {
    if (state === "starting" || !productDetails) return;
    setState("starting");
    setErrorMessage(genericCheckoutError);
    const result = await apiJson<CheckoutResponse>("/api/enrollment/checkout", {
      body: JSON.stringify({ catalogCode: product }),
      headers: {
        "content-type": "application/json",
        "x-apoth-checkout-intent": "create",
      },
      method: "POST",
    });
    if (
      result.ok &&
      typeof result.value.checkoutUrl === "string" &&
      result.value.checkoutUrl.startsWith("https://checkout.stripe.com/")
    ) {
      window.location.assign(result.value.checkoutUrl);
      return;
    }
    setErrorMessage(
      import.meta.env.DEV && !result.ok && result.error === "checkout_unavailable"
        ? localConfigurationError
        : genericCheckoutError,
    );
    setState("error");
  }

  return (
    <CommerceShell stage="checkout">
      <main className="mx-auto grid max-w-[1180px] gap-7 px-5 py-8 sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,1fr)_410px] lg:gap-12">
        <section className="order-2 lg:order-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-black/45">Account checkout</p>
          <h1 className="mt-3 max-w-2xl text-[clamp(2.35rem,6vw,4.7rem)] font-bold leading-[0.94] tracking-[-0.06em]">
            One checkout.<br />Then your medical intake.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-7 text-black/62">
            Enter your email and save a payment method in Stripe. That creates
            your Apoth account—no separate signup form or password required.
          </p>

          <div className="mt-9 max-w-2xl overflow-hidden rounded-[24px] border border-black/[0.07] bg-white shadow-[0_18px_55px_rgba(18,18,20,0.07)]">
            <div className="grid gap-0 sm:grid-cols-3">
              {[
                [CreditCard, "Today", "Save payment details", "You are not charged today."],
                [ShieldCheck, "Next", "Confirm your email", "A one-time code secures your account."],
                [Check, "Then", "Complete medical intake", "A licensed provider decides if treatment is appropriate."],
              ].map(([Icon, eyebrow, title, copy], index) => (
                <div className={`p-6 ${index ? "border-t border-black/[0.06] sm:border-l sm:border-t-0" : ""}`} key={String(title)}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.12em] text-black/38">{String(eyebrow)}</p>
                  <h2 className="mt-1 text-[15px] font-bold tracking-[-0.02em]">{String(title)}</h2>
                  <p className="mt-2 text-sm leading-5 text-black/52">{String(copy)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex items-start gap-3 text-sm text-black/55">
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>Apple Pay appears automatically on eligible devices. Cards and other available payment methods remain available.</p>
          </div>
        </section>

        <aside className="order-1 self-start rounded-[28px] bg-[#9dcc7d] p-6 shadow-[0_20px_60px_rgba(49,80,35,0.15)] sm:p-8 lg:sticky lg:top-6 lg:order-2">
          <div className="flex items-center justify-between border-b border-black/10 pb-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-black/45">Your plan</p>
              <h2 className="mt-1 text-xl font-bold tracking-[-0.035em]">{productDetails?.title ?? "Care plan"}</h2>
            </div>
            <span className="rounded-full bg-white/65 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em]">Secure</span>
          </div>

          <dl className="mt-6 space-y-4 text-sm">
            <div className="flex justify-between gap-4"><dt>Personalized provider review</dt><dd className="font-semibold">Included</dd></div>
            <div className="flex justify-between gap-4"><dt>Ongoing care support</dt><dd className="font-semibold">Included</dd></div>
            <div className="flex justify-between gap-4"><dt>Medication, if prescribed</dt><dd className="font-semibold">{productDetails?.price ?? "Plan pricing*"}</dd></div>
          </dl>

          <div className="my-6 border-t border-black/12" />
          <div className="flex items-end justify-between">
            <div><p className="text-sm font-semibold">Due today</p><p className="mt-1 text-xs text-black/50">Payment method only</p></div>
            <strong className="text-4xl tracking-[-0.06em]">$0</strong>
          </div>

          <button
            className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#171719] px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#303033] disabled:cursor-wait disabled:opacity-70"
            disabled={state === "starting"}
            onClick={continueToCheckout}
            type="button"
          >
            {state === "starting" ? "Opening secure checkout…" : "Continue to checkout"}
            {state !== "starting" ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
          </button>
          {state === "error" ? (
            <p className="mt-4 rounded-2xl bg-white/70 p-4 text-sm leading-5" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <p className="mt-5 text-[11px] leading-5 text-black/48">
            *Final treatment and price depend on independent clinical approval.
            Compounded medications are not FDA-approved.
          </p>
        </aside>
      </main>
    </CommerceShell>
  );
}

const catalogPresentation: Record<string, { title: string; price: string }> = {
  weight: { title: "Weight loss care", price: "From $99/mo*" },
  hair: { title: "Hair health care", price: "From $83/mo*" },
  "sexual-health": { title: "Sexual health care", price: "From $49/mo*" },
};
