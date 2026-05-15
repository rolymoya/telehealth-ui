const steps = [
  {
    n: "01",
    name: "Tell us what is going on",
    body:
      "A real intake, written like a conversation with a clinician, not a survey. Twelve to fifteen minutes, no upsell modules in the middle.",
  },
  {
    n: "02",
    name: "A licensed clinician reviews",
    body:
      "An independent clinician licensed in your state reviews your intake. Most categories are async; new starts and anything sensitive get a real video visit. You see the name and state of licensure of the clinician assigned to your care.",
  },
  {
    n: "03",
    name: "A licensed pharmacy dispenses",
    body:
      "If you are prescribed, a licensed pharmacy partner — a 503A compounding pharmacy for compounded medications — fills the prescription and ships it to you discreetly. Apothem does not dispense medication itself; the pharmacy is a separate licensed entity.",
  },
  {
    n: "04",
    name: "Follow-up and an off-ramp",
    body:
      "Your clinician follows up at the cadence the protocol calls for. Cancel in two clicks; no phone tree, no fees.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="bg-cream py-24 text-ink md:py-32"
    >
      <div className="mx-auto max-w-page px-6 md:px-10">
        <header className="max-w-3xl">
          <p className="text-eyebrow uppercase text-ash">How a visit goes</p>
          <h2 className="display-serif mt-5 text-display-md font-light text-balance">
            Four steps. None of them invented to feel like progress.
          </h2>
        </header>

        <ol className="mt-16 grid grid-cols-1 gap-x-10 gap-y-14 md:mt-24 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <li key={step.n} className="border-t border-clay-deep pt-6">
              <p className="display-serif text-5xl font-light leading-none text-clay-deep md:text-6xl">
                {step.n}
              </p>
              <h3 className="display-serif mt-7 text-2xl font-light leading-tight text-balance">
                {step.name}
              </h3>
              <p className="mt-4 text-pretty text-ink/75">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
