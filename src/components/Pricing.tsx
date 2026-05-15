import { conditions } from "@/lib/data";

export function Pricing() {
  return (
    <section id="pricing" className="bg-cream-warm py-24 text-ink md:py-32">
      <div className="mx-auto max-w-page px-6 md:px-10">
        <div className="grid grid-cols-1 gap-y-12 lg:grid-cols-12 lg:gap-x-12">
          <header className="lg:col-span-5">
            <p className="text-eyebrow uppercase text-ash">Pricing</p>
            <h2 className="display-serif mt-5 text-display-md font-light text-balance">
              All-in monthly pricing, on the same page as the rest of the site.
            </h2>
            <p className="mt-6 max-w-prose text-pretty text-ink/75">
              Cash-pay, no insurance. Each price below is the full all-in
              monthly cost for the visit and the medication — no separate
              dispensing fee, no shipping surcharge, no auto-upgrade after the
              first month. Eligibility for compounded GLP-1 and investigational
              peptides is determined clinically.
            </p>
          </header>

          <dl className="lg:col-span-7">
            {conditions.map((condition) => (
              <div
                key={condition.slug}
                className="grid grid-cols-1 gap-y-4 border-t border-ash-line py-6 last:border-b md:grid-cols-12 md:items-start md:gap-x-6"
              >
                <dt className="md:col-span-6">
                  <p className="text-base font-medium text-ink md:text-lg">
                    {condition.name}
                  </p>
                  <p className="mt-1 text-sm text-ash">
                    {condition.treatments.join(", ")}
                  </p>
                </dt>
                <dd className="md:col-span-6">
                  {condition.pricingTiers && condition.pricingTiers.length > 0 ? (
                    <ul className="space-y-2">
                      {condition.pricingTiers.map((tier) => (
                        <li
                          key={tier.label}
                          className="flex items-baseline justify-between gap-4 border-b border-ash-line/60 pb-2 last:border-b-0 last:pb-0"
                        >
                          <span className="text-sm text-ink">
                            <span className="font-medium">{tier.label}</span>
                            <span className="text-ash"> · {tier.includes}</span>
                          </span>
                          <span className="display-serif text-xl font-light text-clay-deep">
                            ${tier.monthly}
                            <span className="ml-1 text-sm text-ash">/mo</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rounded border border-dashed border-ash-line bg-cream/60 p-3 text-sm text-ash">
                      <p className="font-mono text-[0.72rem] uppercase tracking-eyebrow text-clay-deep">
                        TODO: tiered pricing
                      </p>
                      <p className="mt-1">
                        Tier-by-tier pricing is being finalized. The single
                        placeholder figure below is not a final price.
                      </p>
                      <p className="mt-2 text-ink/70">
                        Placeholder:{" "}
                        <span className="display-serif text-lg font-light text-clay-deep">
                          ${condition.startingFrom}/mo
                        </span>
                      </p>
                    </div>
                  )}
                </dd>
              </div>
            ))}
            <p className="mt-6 max-w-prose text-sm text-ash">
              We will not charge a card before confirming we can see you in
              your state. Compounded medications are not FDA-approved (see each
              category card above). Individual results vary.
            </p>
          </dl>
        </div>
      </div>
    </section>
  );
}
