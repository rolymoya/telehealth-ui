import Link from "next/link";
import { conditions } from "@/lib/data";
import { ArrowRight } from "./Icons";

export function Conditions() {
  return (
    <section
      id="what-we-treat"
      className="bg-cream py-24 text-ink md:py-32 lg:py-40"
    >
      <div className="mx-auto max-w-page px-6 md:px-10">
        <header className="grid grid-cols-1 gap-y-6 lg:grid-cols-12 lg:gap-x-12">
          <p className="text-eyebrow uppercase text-ash lg:col-span-3">
            What we treat
          </p>
          <div className="lg:col-span-9">
            <h2 className="display-serif text-display-lg font-light text-ink text-balance">
              Four categories. Real medications, real clinicians, real
              follow-up.
            </h2>
            <p className="mt-6 max-w-measure text-pretty text-ink/75">
              We chose categories where the patient is usually well-informed
              already and what they need is a clinician who will read the chart
              and answer the actual question. Pricing is per-condition and
              starts here.
            </p>
          </div>
        </header>

        <ol className="mt-16 border-b border-ash-line md:mt-24">
          {conditions.map((condition, index) => (
            <li key={condition.slug} className="border-t border-ash-line">
              <Link
                href={`/conditions/${condition.slug}`}
                className="group grid grid-cols-1 gap-y-5 py-9 transition-colors duration-300 ease-out-quart hover:bg-clay-tint/40 md:grid-cols-12 md:gap-x-10 md:py-11 lg:py-14"
              >
                <div className="flex items-start gap-5 md:col-span-5 lg:col-span-5">
                  <span className="mt-2 font-mono text-xs uppercase tracking-eyebrow text-ash">
                    {`0${index + 1}`}
                  </span>
                  <div>
                    <h3 className="display-serif text-display-md font-light text-ink">
                      {condition.name}
                    </h3>
                    <p className="mt-2 text-sm text-ash">{condition.treats}</p>
                  </div>
                </div>

                <p className="text-pretty text-ink/80 md:col-span-5 lg:col-span-5">
                  {condition.blurb}
                </p>

                <div className="flex items-end justify-between gap-6 md:col-span-2 md:flex-col md:items-end md:justify-end md:text-right">
                  <div>
                    <p className="text-eyebrow uppercase text-ash">From</p>
                    <p className="display-serif mt-1 text-3xl font-light text-clay-deep md:text-4xl">
                      ${condition.startingFrom}
                      <span className="ml-1 text-base text-ash">/mo</span>
                    </p>
                  </div>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ash-line text-ink transition-all duration-300 ease-out-expo group-hover:border-clay-deep group-hover:bg-clay-deep group-hover:text-cream">
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 ease-out-expo group-hover:translate-x-0.5" />
                    <span className="sr-only">Read about {condition.name}</span>
                  </span>
                </div>
              </Link>

              <p className="-mt-3 pb-8 text-sm text-ash md:-mt-4 md:pb-10 md:pl-12 lg:pb-12">
                {condition.treatments.join(" · ")}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
