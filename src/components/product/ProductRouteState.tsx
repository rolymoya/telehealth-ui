import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";

type ProductStateTone =
  | "billing"
  | "loading"
  | "maintenance"
  | "mdi"
  | "not-found"
  | "route-error";

type ProductRouteStateAction =
  | {
      href: string;
      label: string;
      variant?: "primary" | "secondary";
    }
  | {
      disabled?: boolean;
      label: string;
      onClick: () => void;
      variant?: "primary" | "secondary";
    };

type ProductRouteStateProps = {
  actions?: ProductRouteStateAction[];
  body: string;
  eyebrow: string;
  status?: string;
  title: string;
  live?: boolean;
  tone?: ProductStateTone;
};

const toneLabels = {
  billing: "Billing",
  loading: "Preparing",
  maintenance: "Maintenance",
  mdi: "Care workflow",
  "not-found": "Not found",
  "route-error": "Recovery",
} satisfies Record<ProductStateTone, string>;

export function ProductRouteState({
  actions = [],
  body,
  eyebrow,
  live = false,
  status,
  title,
  tone = "maintenance",
}: ProductRouteStateProps) {
  return (
    <>
      <Nav variant="light" />
      <main id="main" className="text-ink">
        <section className="mx-auto max-w-page px-6 py-16 md:px-10 md:py-24">
          <div className="grid gap-10 md:grid-cols-[0.72fr_1.28fr] md:items-start">
            <div className="border-l-2 border-clay-deep pl-5">
              <p className="text-eyebrow uppercase text-ash">{eyebrow}</p>
              <p className="mt-4 font-mono text-[0.78rem] uppercase tracking-eyebrow text-clay-deep">
                {status ?? toneLabels[tone]}
              </p>
            </div>
            <div
              aria-live={live ? "polite" : undefined}
              className="max-w-measure"
              role={live ? "status" : undefined}
            >
              <h1 className="display-serif text-display-md font-light text-balance">
                {title}
              </h1>
              <p className="mt-5 text-pretty text-[1.0625rem] text-ink/75">
                {body}
              </p>
              {actions.length > 0 ? (
                <div className="mt-8 flex flex-wrap gap-3">
                  {actions.map((action) => (
                    <ProductStateAction key={action.label} action={action} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function ProductStateAction({
  action,
}: {
  action: ProductRouteStateAction;
}) {
  const className = actionClassName(action.variant);

  if ("href" in action) {
    return (
      <a href={action.href} className={className}>
        {action.label}
      </a>
    );
  }

  return (
    <button
      aria-disabled={action.disabled ? true : undefined}
      className={className}
      disabled={action.disabled}
      onClick={action.onClick}
      type="button"
    >
      {action.label}
    </button>
  );
}

function actionClassName(variant: ProductRouteStateAction["variant"]) {
  const disabledState = "disabled:cursor-not-allowed disabled:opacity-60";
  if (variant === "secondary") {
    return `inline-flex min-h-11 items-center rounded-full border border-ash-line px-5 py-2.5 text-[0.95rem] font-medium text-ink transition-colors duration-250 ease-out-quart hover:border-clay hover:text-clay-deep ${disabledState}`;
  }
  return `inline-flex min-h-11 items-center rounded-full bg-clay-deep px-5 py-2.5 text-[0.95rem] font-medium text-cream transition-colors duration-250 ease-out-quart hover:bg-clay ${disabledState}`;
}
