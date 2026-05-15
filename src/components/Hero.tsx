import Link from "next/link";
import { ArrowRight } from "./Icons";
import { Nav } from "./Nav";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-clay text-cream">
      <Nav />

      <div className="mx-auto max-w-page px-6 pb-24 pt-20 md:px-10 md:pb-32 md:pt-28 lg:pb-40 lg:pt-36">
        <div className="grid grid-cols-1 gap-x-12 gap-y-12 lg:grid-cols-12">
          <div className="lg:col-span-9 xl:col-span-8">
            <p className="text-eyebrow uppercase text-cream/80">
              Telehealth, made considered
            </p>

            <h1 className="display-serif mt-6 text-display-xl font-light text-cream text-balance">
              Care for the things you quietly look up at night.
            </h1>

            <p className="mt-7 max-w-measure text-[1.075rem] leading-[1.55] text-cream/95 md:text-[1.15rem]">
              Direct visits with US-licensed clinicians for the categories you
              wish were less of a search-bar moment. Sexual health, hair, weight,
              and physician-supervised peptides. No nine-page intake. No
              automated upsell.
            </p>

            <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
              <Link
                href="/get-started"
                className="group inline-flex items-center gap-2.5 rounded-full bg-cream px-6 py-3.5 text-[0.98rem] font-medium text-clay-deep transition-[transform,background] duration-300 ease-out-expo hover:-translate-y-[1px] hover:bg-cream-warm"
              >
                Start a visit
                <ArrowRight className="h-4 w-4 transition-transform duration-300 ease-out-expo group-hover:translate-x-1" />
              </Link>
              <Link
                href="#how-it-works"
                className="group inline-flex items-center gap-2 text-[0.98rem] text-cream/90 transition-colors duration-200 hover:text-cream"
              >
                Read how visits work
                <span
                  aria-hidden="true"
                  className="inline-block h-px w-7 bg-cream/60 transition-[width,background] duration-300 ease-out-expo group-hover:w-10 group-hover:bg-cream"
                />
              </Link>
            </div>

            <p className="mt-10 max-w-prose text-sm text-cream/80">
              Cash-pay, no insurance gymnastics. Available in all 50 states
              through our licensed clinician network.
            </p>
          </div>

          <aside
            aria-hidden="true"
            className="hidden self-end pl-2 lg:col-span-3 lg:block xl:col-span-4"
          >
            <ul className="border-t border-cream/40 pt-5 font-mono text-[0.78rem] uppercase tracking-eyebrow text-cream/75">
              <li className="border-b border-cream/20 py-3">01 Sexual health</li>
              <li className="border-b border-cream/20 py-3">02 Hair</li>
              <li className="border-b border-cream/20 py-3">03 Weight</li>
              <li className="py-3">04 Peptides</li>
            </ul>
            <p className="mt-5 text-[0.78rem] uppercase tracking-eyebrow text-cream/70">
              Care categories
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
