import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import type {
  DashboardAction,
  PatientDashboardViewModel,
} from "@/lib/patient-dashboard";

export function PatientDashboard({
  cancellation,
  dashboard,
}: {
  cancellation?: BillingCancellationControls;
  dashboard: PatientDashboardViewModel;
}) {
  const primaryActions = [
    dashboard.care.followUp,
    ...dashboard.actions,
  ];

  return (
    <>
      <Nav variant="light" />
      <main id="main" className="text-ink">
        <section className="mx-auto max-w-page px-6 py-12 md:px-10 md:py-16">
          <div className="grid gap-10 lg:grid-cols-[0.62fr_1.38fr] lg:items-start">
            <aside className="border-l-2 border-clay-deep pl-5">
              <p className="text-eyebrow uppercase text-ash">Patient account</p>
              <h1 className="display-serif mt-4 text-display-md font-light text-balance">
                Dashboard
              </h1>
              <p className="mt-5 text-pretty text-[1.0625rem] text-ink/75">
                Track account, billing, and care workflow status without storing clinical content in Apoth.
              </p>
              <p className="mt-8 font-mono text-[0.72rem] uppercase tracking-eyebrow text-clay-deep">
                {dashboard.caseStatus.code}
              </p>
            </aside>

            <div className="space-y-6">
              <StatusPanel dashboard={dashboard} />
              <div className="grid gap-6 xl:grid-cols-2">
                <ActionPanel title="Care workflow" actions={primaryActions} />
                <BillingPanel cancellation={cancellation} dashboard={dashboard} />
              </div>
              <div className="grid gap-6 xl:grid-cols-2">
                <AccountPanel dashboard={dashboard} />
                <SupportPanel dashboard={dashboard} />
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

export type BillingCancellationState =
  | "confirming"
  | "idle"
  | "submitted"
  | "submitting"
  | "unavailable";

export type BillingCancellationControls = {
  onBegin: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
  state: BillingCancellationState;
};

function StatusPanel({
  dashboard,
}: {
  dashboard: PatientDashboardViewModel;
}) {
  return (
    <section
      aria-labelledby="dashboard-status"
      className="border border-ash-line bg-cream-warm p-6"
    >
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <p className="text-eyebrow uppercase text-ash">Care status</p>
          <h2 id="dashboard-status" className="display-serif mt-3 text-3xl font-light">
            {dashboard.caseStatus.label}
          </h2>
          <p className="mt-3 max-w-prose text-pretty text-[1rem] text-ink/75">
            {dashboard.caseStatus.summary}
          </p>
        </div>
        <dl className="grid min-w-48 gap-3 text-[0.92rem]">
          <div>
            <dt className="font-mono text-[0.68rem] uppercase tracking-eyebrow text-ash">
              Updated
            </dt>
            <dd className="mt-1 text-ink/80">
              {dashboard.caseStatus.updatedAt ?? dashboard.generatedAt}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[0.68rem] uppercase tracking-eyebrow text-ash">
              Source
            </dt>
            <dd className="mt-1 text-ink/80">MDI status mirror</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function ActionPanel({
  actions,
  title,
}: {
  actions: DashboardAction[];
  title: string;
}) {
  return (
    <section aria-labelledby="dashboard-actions" className="border border-ash-line p-6">
      <p className="text-eyebrow uppercase text-ash">Actions</p>
      <h2 id="dashboard-actions" className="mt-3 text-xl font-semibold">
        {title}
      </h2>
      <ul className="mt-5 space-y-4">
        {actions.map((action) => (
          <li key={`${action.code}-${action.label}`} className="border-t border-ash-line pt-4 first:border-t-0 first:pt-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-medium text-ink">{action.label}</p>
                <p className="mt-1 text-[0.95rem] leading-6 text-ink/70">
                  {action.summary}
                </p>
                <p className="mt-2 font-mono text-[0.68rem] uppercase tracking-eyebrow text-ash">
                  {action.code}
                </p>
              </div>
              {action.href ? (
                <a
                  href={action.href}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-clay-deep px-5 py-2.5 text-[0.95rem] font-medium text-cream transition-colors duration-250 ease-out-quart hover:bg-clay"
                >
                  Open
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BillingPanel({
  cancellation,
  dashboard,
}: {
  cancellation?: BillingCancellationControls;
  dashboard: PatientDashboardViewModel;
}) {
  return (
    <section aria-labelledby="dashboard-billing" className="border border-ash-line p-6">
      <p className="text-eyebrow uppercase text-ash">Billing</p>
      <h2 id="dashboard-billing" className="mt-3 text-xl font-semibold">
        {dashboard.billing.label}
      </h2>
      <p className="mt-3 text-[0.95rem] leading-6 text-ink/70">
        {dashboard.billing.summary}
      </p>
      <p className="mt-5 font-mono text-[0.68rem] uppercase tracking-eyebrow text-clay-deep">
        {dashboard.billing.code}
      </p>
      {dashboard.billing.canCancel && cancellation ? (
        <div className="mt-5 border-t border-ash-line pt-5">
          <CancellationControl cancellation={cancellation} />
        </div>
      ) : null}
    </section>
  );
}

function CancellationControl({
  cancellation,
}: {
  cancellation: BillingCancellationControls;
}) {
  if (cancellation.state === "confirming") {
    return (
      <div className="space-y-3">
        <p className="text-[0.95rem] leading-6 text-ink/70">
          Cancellation takes effect at the end of the current billing cycle. There is no cancellation fee.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={cancellation.onConfirm}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-clay-deep px-5 py-2.5 text-[0.95rem] font-medium text-cream transition-colors duration-250 ease-out-quart hover:bg-clay"
          >
            Confirm cancellation
          </button>
          <button
            type="button"
            onClick={cancellation.onDismiss}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-ash-line px-5 py-2.5 text-[0.95rem] font-medium text-ink transition-colors duration-250 ease-out-quart hover:border-clay hover:text-clay-deep"
          >
            Keep subscription
          </button>
        </div>
      </div>
    );
  }

  if (cancellation.state === "submitted") {
    return (
      <p className="text-[0.95rem] leading-6 text-ink/70">
        Cancellation is scheduled. The billing status will refresh shortly.
      </p>
    );
  }

  if (cancellation.state === "unavailable") {
    return (
      <div className="space-y-3">
        <p className="text-[0.95rem] leading-6 text-ink/70">
          We could not submit cancellation right now. No account, billing, or care information was changed by this page.
        </p>
        <button
          type="button"
          onClick={cancellation.onBegin}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-ash-line px-5 py-2.5 text-[0.95rem] font-medium text-ink transition-colors duration-250 ease-out-quart hover:border-clay hover:text-clay-deep"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={cancellation.state === "submitting"}
      onClick={cancellation.onBegin}
      className="inline-flex min-h-11 items-center justify-center rounded-full border border-ash-line px-5 py-2.5 text-[0.95rem] font-medium text-ink transition-colors duration-250 ease-out-quart hover:border-clay hover:text-clay-deep disabled:cursor-not-allowed disabled:opacity-60"
    >
      {cancellation.state === "submitting" ? "Cancelling" : "Cancel subscription"}
    </button>
  );
}

function AccountPanel({
  dashboard,
}: {
  dashboard: PatientDashboardViewModel;
}) {
  return (
    <section aria-labelledby="dashboard-account" className="border border-ash-line p-6">
      <p className="text-eyebrow uppercase text-ash">Account</p>
      <h2 id="dashboard-account" className="mt-3 text-xl font-semibold">
        {dashboard.account.label}
      </h2>
      <dl className="mt-4 space-y-3 text-[0.95rem]">
        <div>
          <dt className="text-ash">Status</dt>
          <dd className="text-ink/80">{dashboard.account.status}</dd>
        </div>
        <div>
          <dt className="text-ash">Residency</dt>
          <dd className="text-ink/80">{dashboard.account.residencyState ?? "Not available"}</dd>
        </div>
      </dl>
    </section>
  );
}

function SupportPanel({
  dashboard,
}: {
  dashboard: PatientDashboardViewModel;
}) {
  return (
    <section aria-labelledby="dashboard-support" className="border border-ash-line p-6">
      <p className="text-eyebrow uppercase text-ash">Support</p>
      <h2 id="dashboard-support" className="mt-3 text-xl font-semibold">
        {dashboard.support.label}
      </h2>
      <p className="mt-3 text-[0.95rem] leading-6 text-ink/70">
        {dashboard.support.summary}
      </p>
      <Link
        href="/about#contact"
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-ash-line px-5 py-2.5 text-[0.95rem] font-medium text-ink transition-colors duration-250 ease-out-quart hover:border-clay hover:text-clay-deep"
      >
        Contact support
      </Link>
    </section>
  );
}
