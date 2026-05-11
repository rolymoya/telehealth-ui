import { faqs } from "@/lib/data";
import { Plus } from "./Icons";

export function Faq() {
  return (
    <section id="faq" className="bg-cream py-24 text-ink md:py-32">
      <div className="mx-auto max-w-page px-6 md:px-10">
        <div className="grid grid-cols-1 gap-y-10 lg:grid-cols-12 lg:gap-x-12">
          <header className="lg:col-span-4">
            <p className="text-eyebrow uppercase text-ash">Common questions</p>
            <h2 className="display-serif mt-5 text-display-md font-light text-balance">
              Answered without lawyer voice.
            </h2>
            <p className="mt-6 max-w-prose text-pretty text-ink/75">
              If something below is wrong about your situation, the right answer
              is a real visit, not a longer FAQ.
            </p>
          </header>

          <ul className="border-b border-ash-line lg:col-span-8">
            {faqs.map((item, idx) => (
              <li key={idx} className="border-t border-ash-line">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-left text-[1.05rem] font-medium text-ink transition-colors duration-200 hover:text-clay-deep md:py-7 md:text-[1.15rem] [&::-webkit-details-marker]:hidden">
                    <span className="text-pretty">{item.q}</span>
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ash-line text-ink transition-colors duration-200 group-hover:border-clay-deep group-hover:text-clay-deep group-open:border-clay-deep group-open:bg-clay-deep group-open:text-cream">
                      <Plus className="h-4 w-4 transition-transform duration-300 ease-out-expo group-open:rotate-45" />
                      <span className="sr-only">Toggle answer</span>
                    </span>
                  </summary>
                  <div className="overflow-hidden pb-7 pr-12 text-pretty text-ink/80 md:pb-8">
                    {item.a}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
