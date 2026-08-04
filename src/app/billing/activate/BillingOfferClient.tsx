"use client";

import { useEffect, useState, type FormEvent } from "react";

type Offer = {
  authorizationVersion: string;
  csrfToken: string;
  currency: "usd";
  interval: "month";
  offerId: string;
  status: "offer_ready" | "offer_accepted";
  unitAmountCents: number;
};

type ViewState =
  | { status: "loading" }
  | { status: "ready"; offer: Offer }
  | { status: "active" }
  | { status: "accepted"; pending: boolean }
  | { status: "not_ready"; message: string }
  | { status: "error" };

export function BillingOfferClient({
  fetchImpl = fetch,
  navigate = defaultNavigate,
}: {
  fetchImpl?: typeof fetch;
  navigate?: (destination: string) => void;
}) {
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchImpl("/api/billing/offer", {
      cache: "no-store",
      credentials: "include",
      headers: { accept: "application/json" },
    }).then(async (response) => {
      if (!active) return;
      const body = await safeJson(response);
      if (response.status === 401) {
        navigate(`/sign-in?returnTo=${encodeURIComponent("/billing/activate")}`);
        return;
      }
      if (response.ok && body.status === "billing_active") {
        setState({ status: "active" });
        return;
      }
      if (response.ok && isOffer(body)) {
        setState(body.status === "offer_accepted"
          ? { status: "accepted", pending: true }
          : { status: "ready", offer: body });
        return;
      }
      if (body.error === "payment_method_required") {
        setState({ status: "not_ready", message: "Add a payment method before starting the approved plan." });
        return;
      }
      if (body.error === "clinical_approval_required") {
        setState({ status: "not_ready", message: "Your provider review must be complete before a treatment offer is available." });
        return;
      }
      setState({ status: "error" });
    }).catch(() => {
      if (active) setState({ status: "error" });
    });
    return () => {
      active = false;
    };
  }, [fetchImpl, navigate]);

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== "ready" || submitting) return;
    const form = new FormData(event.currentTarget);
    if (form.get("recurringAuthorization") !== "accepted") return;
    setSubmitting(true);
    const response = await fetchImpl("/api/billing/offer", {
      body: JSON.stringify({
        offerId: state.offer.offerId,
        recurringAuthorization: "accepted",
      }),
      cache: "no-store",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-apoth-csrf": state.offer.csrfToken,
      },
      method: "POST",
    }).catch(() => null);
    setSubmitting(false);
    if (!response) {
      setState({ status: "error" });
      return;
    }
    const body = await safeJson(response);
    if (response.ok && body.status === "billing_active") {
      setState({ status: "active" });
      return;
    }
    if (response.ok || response.status === 202) {
      setState({ status: "accepted", pending: true });
      return;
    }
    if (body.error === "offer_changed") {
      globalThis.location.reload();
      return;
    }
    setState({ status: "error" });
  }

  if (state.status === "loading") {
    return <Status title="Loading your approved offer" body="Confirming clinical and billing status." />;
  }
  if (state.status === "active") {
    return (
      <Status
        title="Your approved plan is active"
        body="Your first charge was created only after your recurring authorization."
        action={{ href: "/dashboard", label: "Return to dashboard" }}
      />
    );
  }
  if (state.status === "accepted") {
    return (
      <Status
        title="Your authorization is saved"
        body={state.pending
          ? "Your approved plan is being activated. We will not create a second authorization or duplicate subscription if you return to this page."
          : "Your authorization is on file."}
        action={{ href: "/dashboard", label: "Return to dashboard" }}
      />
    );
  }
  if (state.status === "not_ready") {
    return (
      <Status
        title="Your offer is not ready yet"
        body={state.message}
        action={{ href: state.message.startsWith("Add") ? "/billing" : "/dashboard", label: "Continue" }}
      />
    );
  }
  if (state.status === "error") {
    return <Status title="We could not load your offer" body="No authorization or charge was created. Try again from your dashboard." action={{ href: "/dashboard", label: "Return to dashboard" }} />;
  }

  const price = formatMoney(state.offer.unitAmountCents);
  return (
    <main className="mx-auto max-w-[980px] px-5 py-10 text-ink md:px-8 md:py-20">
      <div className="grid overflow-hidden rounded-[28px] border border-black/[0.06] bg-white shadow-soft md:grid-cols-[1fr_0.72fr]">
        <form className="p-7 sm:p-10" onSubmit={accept}>
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-[#315fbf]">Approved treatment offer</p>
          <h1 className="display-serif mt-4 text-[clamp(2.3rem,6vw,4.4rem)] font-light leading-[0.96] tracking-[-0.045em]">
            Review the price before your plan begins.
          </h1>
          <p className="mt-5 max-w-xl text-[1.05rem] leading-7 text-ink/70">
            Your provider has completed the clinical decision. This is a separate commercial authorization; your saved payment method has not started a subscription by itself.
          </p>
          <label className="mt-8 flex gap-3 rounded-[18px] border border-black/10 bg-[#f9f9fa] p-4 text-[0.98rem] leading-6">
            <input
              className="mt-1 h-5 w-5 shrink-0 accent-[#171719]"
              name="recurringAuthorization"
              required
              type="checkbox"
              value="accepted"
            />
            <span>
              I authorize Apoth to charge <strong>{price} today</strong> and {price} every month until I cancel. I understand I can cancel before my next renewal under the cancellation policy.
            </span>
          </label>
          <button
            className="mt-6 inline-flex min-h-13 w-full items-center justify-center rounded-full bg-[#171719] px-7 text-[0.95rem] font-semibold text-white transition hover:-translate-y-px hover:bg-[#343437] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Starting plan" : `Authorize ${price} and start plan`}
          </button>
          <p className="mt-4 text-[0.82rem] leading-5 text-ink/55">
            Authorization version {state.offer.authorizationVersion}. Review the <a className="underline underline-offset-4" href="/terms">renewal and cancellation terms</a>.
          </p>
        </form>
        <aside className="bg-[#f5df75] p-7 sm:p-9">
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-black/50">Order summary</p>
          <dl className="mt-7 space-y-5">
            <Summary label="Due when you confirm" value={price} />
            <Summary label="Renews" value={`${price} monthly`} />
            <Summary label="Payment method" value="Saved securely with Stripe" />
          </dl>
          <p className="mt-8 border-t border-black/15 pt-6 text-[0.88rem] leading-6 text-black/65">
            Medication is supplied only under the provider’s approved plan. Compounded medications are not FDA-approved.
          </p>
        </aside>
      </div>
    </main>
  );
}

function defaultNavigate(destination: string) {
  globalThis.location.assign(destination);
}

function Status({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <main className="mx-auto max-w-[760px] px-5 py-20 text-center text-ink md:py-28">
      <h1 className="display-serif text-[clamp(2.3rem,7vw,4.6rem)] font-light leading-none">{title}</h1>
      <p className="mx-auto mt-5 max-w-xl text-[1rem] leading-7 text-ink/68">{body}</p>
      {action ? <a className="mt-8 inline-flex min-h-12 items-center rounded-full bg-[#171719] px-6 font-semibold text-white" href={action.href}>{action.label}</a> : null}
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-black/15 pb-5"><dt className="text-[0.8rem] text-black/55">{label}</dt><dd className="mt-1 text-lg font-semibold">{value}</dd></div>;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

async function safeJson(response: Response) {
  try { return await response.json() as Record<string, unknown>; } catch { return {}; }
}

function isOffer(value: Record<string, unknown>): value is Record<string, unknown> & Offer {
  return (value.status === "offer_ready" || value.status === "offer_accepted") &&
    typeof value.offerId === "string" &&
    typeof value.csrfToken === "string" &&
    typeof value.unitAmountCents === "number" &&
    value.currency === "usd" &&
    value.interval === "month" &&
    typeof value.authorizationVersion === "string";
}
