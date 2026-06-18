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
      <Nav variant="light" />
      <main id="main">
        <section className="mx-auto max-w-page px-6 py-16 text-ink md:px-10 md:py-24">
          <div className="max-w-measure">
            <p className="text-eyebrow uppercase text-ash">{eyebrow}</p>
            <h1 className="display-serif mt-4 text-display-md font-light text-balance">
              {title}
            </h1>
            <p className="mt-5 text-pretty text-[1.0625rem] text-ink/75">
              {body}
            </p>
            <p className="mt-8">
              <span className="font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep">
                TODO:
              </span>
              <span className="ml-2 text-[1rem] text-ink/65">
                Live workflow details for this step are being connected.
              </span>
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
