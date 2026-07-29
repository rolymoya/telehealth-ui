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
        <section className="mx-auto max-w-[980px] px-5 py-10 md:px-8 md:py-20">
          <div className="overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-soft">
            <div className="h-2 bg-[#4e80ee]" aria-hidden="true" />
            <div className="grid gap-8 p-7 md:grid-cols-[0.72fr_1.28fr] md:items-start md:p-10">
            <div>
              <p className="text-eyebrow uppercase text-ash">{eyebrow}</p>
              <p className="mt-4 inline-flex rounded-full bg-[#eef3ff] px-3 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.1em] text-[#315fbf]">
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
    return `inline-flex min-h-11 items-center rounded-full border border-black/15 bg-white px-5 py-2.5 text-[0.95rem] font-semibold text-ink transition-colors hover:bg-black/[0.04] ${disabledState}`;
  }
  return `inline-flex min-h-11 items-center rounded-full bg-[#171719] px-5 py-2.5 text-[0.95rem] font-semibold text-white transition-all hover:-translate-y-px hover:bg-[#343437] ${disabledState}`;
}
