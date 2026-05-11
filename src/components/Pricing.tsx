import Link from "next/link";
import { conditions } from "@/lib/data";

export function Pricing() {
  return (
    <section
      id="pricing"
      className="bg-cream-warm py-24 text-ink md:py-32"
    >
      <div className="mx-auto max-w-page px-6 md:px-10">
        <div className="grid grid-cols-1 gap-y-12 lg:grid-cols-12 lg:gap-x-12">
          <header className="lg:col-span-5">
            <p className="text-eyebrow uppercase text-ash">Pricing</p>
            <h2 className="display-serif mt-5 text-display-md font-light text-balance">
              In plain numbers, on the same page as the rest of the site.
            </h2>
            <p className="mt-6 max-w-prose text-pretty text-ink/75">
              Cash-pay, no insurance. Pricing is the visit and the medication
              together; we will not split a $39 number into a $19 visit fee and
              a $20 dispensing fee. Eligibility for compounded GLP-1 and
              peptides is determined clinically.
            </p>
          </header>

          <dl className="lg:col-span-7">
            {conditions.map((condition) => (
              <div
                key={condition.slug}
                className="grid grid-cols-12 items-baseline gap-x-6 border-t border-ash-line py-6 last:border-b"
              >
                <dt className="col-span-7 md:col-span-6">
                  <p className="text-base font-medium text-ink md:text-lg">
                    {condition.name}
                  </p>
                  <p className="mt-1 text-sm text-ash">
                    {condition.treatments.join(", ")}
                  </p>
                </dt>
                <dd className="col-span-3 md:col-span-3">
                  <p className="text-eyebrow uppercase text-ash">From</p>
                  <p className="display-serif mt-1 text-2xl font-light text-clay-deep md:text-3xl">
                    ${condition.startingFrom}
                    <span className="ml-1 text-sm text-ash">/mo</span>
                  </p>
                </dd>
                <dd className="col-span-2 md:col-span-3 md:text-right">
                  <Link
                    href={`/conditions/${condition.slug}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-ink underline decoration-ash-line decoration-1 underline-offset-[6px] transition-colors duration-200 hover:text-clay-deep hover:decoration-clay-deep"
                  >
                    Start
                  </Link>
                </dd>
              </div>
            ))}
            <p className="mt-6 max-w-prose text-sm text-ash">
              Prices shown are starting points after clinical eligibility.
              Compounded GLP-1 and investigational peptides require a complete
              intake and, in some cases, recent labs. We will not charge a card
              before confirming we can see you in your state.
            </p>
          </dl>
        </div>
      </div>
    </section>
  );
}
