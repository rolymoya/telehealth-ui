import { clinicians } from "@/lib/data";

export function Clinicians() {
  return (
    <section
      id="clinicians"
      className="bg-sage-soft py-24 text-ink md:py-32"
    >
      <div className="mx-auto max-w-page px-6 md:px-10">
        <header className="max-w-3xl">
          <p className="text-eyebrow uppercase text-sage-deep">
            Who you'll see
          </p>
          <h2 className="display-serif mt-5 text-display-md font-light text-balance">
            Real clinicians, named on the page they work behind.
          </h2>
          <p className="mt-6 max-w-prose text-pretty text-ink/75">
            We do not pool. The clinician who reads your intake is the one who
            writes the prescription and answers the messages after. Three are
            featured here; our full network of US-licensed clinicians covers all
            50 states, and you will see the name and state of licensure of the
            clinician assigned to your care before your visit.
          </p>
        </header>

        <ul className="mt-14 grid grid-cols-1 gap-y-12 md:mt-20 md:grid-cols-3 md:gap-x-8 md:gap-y-0 lg:gap-x-12">
          {clinicians.map((clinician) => (
            <li key={clinician.slug} className="group">
              <div
                aria-hidden="true"
                className="relative aspect-[4/5] w-full overflow-hidden bg-sage transition-colors duration-500 ease-out-expo group-hover:bg-sage-deep"
              >
                <span className="display-serif absolute bottom-5 left-5 text-7xl font-light leading-none text-cream/90 md:text-8xl">
                  {clinician.initial}
                </span>
                <span className="absolute right-4 top-4 text-eyebrow uppercase text-cream/60">
                  Photo to come
                </span>
              </div>
              <div className="mt-6">
                <h3 className="display-serif text-2xl font-light text-ink">
                  {clinician.name}
                </h3>
                <p className="mt-1 text-sm text-ash">
                  {clinician.credential} · {clinician.state}
                </p>
                <p className="mt-4 text-pretty text-[0.97rem] text-ink/80">
                  {clinician.bio}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
