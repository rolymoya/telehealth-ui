import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";

export function ProductPlaceholder({
  body,
  eyebrow,
  title,
}: {
  body: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <>
      <Nav variant="light" announcement={false} />
      <main id="main">
        <section className="mx-auto max-w-[920px] px-5 py-10 text-ink md:px-8 md:py-20">
          <div className="overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-soft">
            <div className="h-2 bg-[#f5df75]" aria-hidden="true" />
            <div className="max-w-measure p-7 sm:p-10">
            <p className="text-eyebrow uppercase text-ash">{eyebrow}</p>
            <h1 className="display-serif mt-4 text-display-md font-light text-balance">
              {title}
            </h1>
            <p className="mt-5 text-pretty text-[1.0625rem] text-ink/75">
              {body}
            </p>
            <p className="mt-8">
              <span className="rounded-full bg-[#eef3ff] px-3 py-1.5 font-semibold uppercase tracking-[0.1em] text-[0.68rem] text-[#315fbf]">
                TODO:
              </span>
              <span className="ml-2 text-[1rem] text-ink/65">
                Live workflow details for this step are being connected.
              </span>
            </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
