import Image from "next/image";

import {
  ArrowRight,
  BadgeDollarSign,
  CalendarX2,
  Check,
  Clock3,
  FlaskConical,
  PackageCheck,
  Plane,
  Sparkles,
  Truck,
  UserRound,
} from "lucide-react";

import { InteractiveCard } from "@/components/marketing-v2/InteractiveCard";
import { MobileMenu } from "@/components/marketing-v2/MobileMenu";
import { MotionObserver } from "@/components/marketing-v2/MotionObserver";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/marketing-v2/ui/Accordion";
import { Button } from "@/components/marketing-v2/ui/Button";
import { checkoutHref } from "@/lib/public-commerce";

const weightCheckoutHref = checkoutHref("weight");

const services = [
  {
    title: "Weight loss, built around you",
    compactTitle: "Weight loss, built around you",
    subtitle: "Personalized care for lasting progress.",
    price: "From $99/mo*",
    tone: "from-[#63251b] via-[#A53F2B] to-[#d98a6f]",
    textTone: "light",
    href: "/weight-loss",
    image: "Transparent product still life — injection pen and three GLP-1 medication vials, vertical 4:5 PNG",
    imageSrc: null,
    imageAlt: null,
    fullBleedImage: false,
    imagePair: {
      vial: "/images/home-weight-loss-vial.webp",
    },
  },
  {
    title: "Fuller-looking hair starts here",
    compactTitle: "Regrow your hair",
    subtitle: "Targeted treatments for healthier-looking growth.",
    price: "Plans from $83/mo",
    tone: "from-[#680000] via-[#A30000] to-[#df4c3c]",
    textTone: "light",
    href: weightCheckoutHref,
    image: "Transparent hair-care product still life — topical dropper, treatment bottle, and tablet pouch, vertical 4:5 PNG",
    imageSrc: "/images/hair-growth-card.webp",
    imageAlt: "Person touching fuller dark hair",
    fullBleedImage: true,
    imagePair: null,
  },
  {
    title: "Sexual health, handled discreetly",
    compactTitle: "Treat ED discreetly",
    subtitle: "Private care for confidence and connection.",
    price: "Plans from $49/mo",
    tone: "from-[#a84800] via-[#FF7700] to-[#ffbc5f]",
    textTone: "light",
    href: weightCheckoutHref,
    image: "Discreet sexual-health product still life — minimal tablet pack and unbranded prescription bottle, cool studio lighting, transparent PNG",
    imageSrc: "/images/sexual-health-card.webp",
    imageAlt: "Hand holding a small tablet",
    fullBleedImage: true,
    imagePair: null,
  },
];

const faqs = [
  ["What states do you serve?", "Online care is available where clinician licensure, clinical eligibility, and pharmacy shipping rules support the requested treatment. Availability is confirmed during intake."],
  ["Do you take insurance?", "Insurance is not required. Programs use straightforward membership pricing, and eligible customers may use FSA or HSA funds for qualifying purchases."],
  ["What medications do your providers prescribe?", "A licensed provider reviews your health history and recommends a treatment only when appropriate. Available options vary by program, state, and individual needs."],
  ["Are prescriptions and medication included?", "Your personalized plan clearly states what is included before checkout. Provider support and expedited shipping are included with all displayed plans."],
  ["How quickly can I get started?", "Most people complete the online intake in a few minutes. A provider then reviews the information and follows up with next steps."],
];

const footerGroups = [
  {
    heading: "Care",
    links: [
      { label: "GLP-1 treatments", href: "/weight-loss" },
      { label: "Weight management", href: "/weight-loss" },
      { label: "Start a visit", href: weightCheckoutHref },
      { label: "Patient login", href: "/sign-in" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About Apoth", href: "/about" },
      { label: "How it works", href: "/weight-loss#how-it-works" },
      { label: "FAQs", href: "/#faq" },
      { label: "Contact", href: "/about#contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms of service", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Telehealth disclosure", href: "/terms#telehealth-disclosure" },
      { label: "Notice of privacy practices", href: "/privacy#notice-of-privacy-practices" },
    ],
  },
] as const;

function ArrowLink({ label = "Learn more", light = false }: { label?: string; light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] ${light ? "text-white" : "text-foreground"}`}>
      {label}
      <span className={`grid h-7 w-7 place-items-center rounded-full border transition-transform duration-200 group-hover:translate-x-1 group-focus-visible:translate-x-1 ${light ? "border-white/55" : "border-foreground/30"}`}>
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </span>
  );
}

export default function Home() {
  return (
    <main id="main" className="marketing-v2 overflow-hidden bg-[#f9f9fa]">
      <MotionObserver />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        Skip to main content
      </a>

      <div className="bg-[#4E80EE] px-4 py-2.5 text-center text-xs font-light text-white">
        Free expedited shipping on all orders
      </div>

      <header className="sticky top-0 z-50 border-b border-black/[0.04] bg-[#f9f9fa]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[58px] max-w-[1400px] items-center justify-between px-5 sm:h-[74px] lg:px-8">
          <a href="/" className="font-serif text-[30px] font-bold leading-none tracking-[-0.06em] sm:text-[36px]" aria-label="Apoth home">
            apoth
          </a>
          <nav className="hidden items-center gap-10 text-sm font-semibold lg:flex" aria-label="Primary navigation">
            <a className="transition-opacity hover:opacity-55" href="/weight-loss">Weight Loss</a>
            <a className="transition-opacity hover:opacity-55" href="/about">About</a>
            <a className="transition-opacity hover:opacity-55" href="#faq">FAQs</a>
          </nav>
          <div className="flex items-center gap-3">
            <Button asChild className="hidden sm:inline-flex"><a href={weightCheckoutHref}>Get started</a></Button>
            <Button asChild variant="outline" className="hidden px-5 sm:inline-flex">
              <a href="/sign-in"><UserRound className="h-4 w-4" /> Login</a>
            </Button>
            <MobileMenu ctaHref={weightCheckoutHref} />
          </div>
        </div>
      </header>

      <div id="main-content">
        <section id="services" className="mx-auto max-w-[1270px] px-5 pb-10 pt-5 sm:pt-16 lg:px-6">
          <div className="grid items-center gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:gap-10">
            <div className="animate-fade-up">
              <h1 className="display-tight max-w-[720px] text-[42px] font-normal sm:font-normal sm:text-[40px] lg:text-[64px]">
                Better health has
                <br /> never been easier
              </h1>
              <p className="mt-2 text-base font-thin tracking-[-0.02em] text-foreground/65 sm:mt-3 sm:text-xl">Simple online care for weight management, hair loss, and sexual wellness.</p>
            </div>
            <ul className="space-y-2 pb-0 text-sm text-foreground/65 sm:space-y-3 sm:pb-2 sm:text-base lg:justify-self-end">
              <li className="flex items-center gap-3"><BadgeDollarSign className="h-4 w-4 text-foreground sm:h-5 sm:w-5" /> Straightforward monthly pricing</li>
              <li className="flex items-center gap-3"><Plane className="h-4 w-4 text-foreground sm:h-5 sm:w-5" /> Free shipping on all orders</li>
              <li className="flex items-center gap-3"><CalendarX2 className="h-4 w-4 text-foreground sm:h-5 sm:w-5" /> Pause or cancel anytime</li>
            </ul>
          </div>

          <div className="mx-[-15px] mt-8 sm:mx-auto sm:mt-12 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(290px,0.72fr)] lg:gap-4">
            <InteractiveCard
              href={services[0].href}
              ariaLabel={`Explore ${services[0].title}`}
              glow="light"
              className={`relative block min-h-[260px] overflow-hidden rounded-[22px] bg-gradient-to-br ${services[0].tone} p-6 text-white sm:min-h-[380px] sm:rounded-[24px] sm:p-7 lg:col-start-1 lg:row-start-1`}
            >
              <div className="treatment-card-gradient pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
              <div className="treatment-card-grain pointer-events-none absolute inset-0 z-[1]" aria-hidden="true" />
              <div className="relative z-20 max-w-[220px]">
                <h2 className="text-[28px] font-bold leading-[0.98] tracking-[-0.045em]">{services[0].title}</h2>
                <p className="mt-2 text-sm text-white/80">{services[0].subtitle}</p>
                <p className="mt-1 text-xs text-white/65">{services[0].price}</p>
              </div>
              <div className="pointer-events-none absolute bottom-1 right-[1%] z-10 h-[205px] w-[68%] sm:bottom-2 sm:right-[3%] sm:h-[295px] sm:w-[70%]">
                <span aria-hidden="true" className="weight-loss-vial-shadow" />
                <Image
                  src={services[0].imagePair!.vial}
                  alt="Apoth GLP-1 injection vial"
                  fill
                  priority
                  sizes="(min-width: 1024px) 15vw, 35vw"
                  className="!left-[45%] !top-[2%] !h-[86%] !w-[52%] rotate-[-11deg] scale-[1.98] object-contain object-center transition-transform duration-500 ease-out group-hover:-translate-x-1 group-hover:-translate-y-2 group-hover:rotate-[-16deg] group-hover:scale-[1.28] group-focus-visible:-translate-x-1 group-focus-visible:-translate-y-2 group-focus-visible:rotate-[-16deg] group-focus-visible:scale-[1.28] sm:!left-[45%] sm:!top-[3.5%] sm:!h-[78%] sm:scale-[1.34] sm:group-hover:-translate-x-2 sm:group-hover:-translate-y-3 sm:group-hover:scale-[1.45] sm:group-focus-visible:-translate-x-2 sm:group-focus-visible:-translate-y-3 sm:group-focus-visible:scale-[1.45] motion-reduce:transition-none"
                />
                {/*<Image*/}
                {/*  src={services[0].imagePair!.syringe}*/}
                {/*  alt="Medication syringe"*/}
                {/*  alt="Medication syringe"*/}
                {/*  fill*/}
                {/*  priority*/}
                {/*  sizes="(min-width: 1024px) 30vw, 38vw"*/}
                {/*  className="!left-[50%] !top-[8%] !h-[102%] !w-[46%] rotate-[9deg] scale-[1.38] object-contain object-center transition-transform duration-700 ease-out group-hover:translate-x-2 group-hover:-translate-y-3 group-hover:rotate-[14deg] group-hover:scale-[1.48] group-focus-visible:translate-x-2 group-focus-visible:-translate-y-3 group-focus-visible:rotate-[14deg] group-focus-visible:scale-[1.48] sm:!left-[51%] sm:!top-[2%] sm:!h-[105%] sm:scale-[1.56] sm:group-hover:translate-x-3 sm:group-hover:-translate-y-4 sm:group-hover:scale-[1.7] sm:group-focus-visible:translate-x-3 sm:group-focus-visible:-translate-y-4 sm:group-focus-visible:scale-[1.7] motion-reduce:transition-none"*/}
                {/*/>*/}
              </div>
              <div className="absolute bottom-5 left-6 z-20 sm:bottom-6 sm:left-7"><ArrowLink light /></div>
            </InteractiveCard>

            <div className="mt-1.5 grid gap-1.5 sm:mt-4 sm:grid-cols-2 sm:gap-4 lg:col-start-2 lg:row-start-1 lg:mt-0 lg:grid-cols-1 lg:grid-rows-2">
              {[services[2], services[1]].map((service, index) => (
                <InteractiveCard
                  key={service.title}
                  href={service.href}
                  ariaLabel={`Explore ${service.title}`}
                  revealDelay={(index + 1) * 90}
                  className="relative min-h-[88px] overflow-hidden rounded-[24px] bg-[#f0efeb] px-5 py-4 text-[#191816] [--card-hover-scale:1.01] sm:min-h-[132px] sm:px-6 sm:py-6 lg:min-h-0"
                >
                  <div className="relative z-20 flex h-full max-w-[50%] flex-col justify-center">
                    <h2 className="text-[16px] font-medium leading-[1.05] tracking-[-0.025em] sm:text-[22px] sm:font-semibold sm:tracking-[-0.035em]">{service.compactTitle}</h2>
                    <p className="mt-2 hidden text-xs text-[#191816]/50 sm:block">{service.price}</p>
                  </div>
                  <div className="pointer-events-none absolute inset-y-0 right-9 z-10 w-[42%] overflow-hidden sm:w-[48%]">
                    <Image
                      src={service.imageSrc!}
                      alt={service.imageAlt ?? ""}
                      fill
                      sizes="(min-width: 640px) 20vw, 48vw"
                      className="origin-right object-contain object-right-bottom transition-transform duration-500 ease-out group-hover:-translate-x-1 group-hover:scale-[1.04] group-focus-visible:-translate-x-1 group-focus-visible:scale-[1.04] motion-reduce:transition-none"
                    />
                  </div>
                  <ArrowRight className="absolute right-4 top-1/2 z-20 h-5 w-5 -translate-y-1/2 transition-transform duration-200 group-hover:translate-x-1 group-hover:-translate-y-1/2 group-focus-visible:translate-x-1 group-focus-visible:-translate-y-1/2 sm:right-5" aria-hidden="true" />
                </InteractiveCard>
              ))}
            </div>
          </div>

        </section>

        <div className="overflow-hidden border-y border-black/[0.04] bg-[#e8f2e9] py-4">
          <div className="marquee-track flex w-max animate-marquee items-center">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center gap-12 pr-12 text-xs text-foreground/70 md:gap-20 md:pr-20">
                <span className="flex items-center gap-2"><Truck className="h-4 w-4" /> Free & discreet shipping</span>
                <span className="flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Prepared by a licensed 503A pharmacy</span>
                <span className="flex items-center gap-2"><Clock3 className="h-4 w-4" /> Ongoing provider messaging</span>
                <span className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Customized to your needs</span>
              </div>
            ))}
          </div>
        </div>

        <section id="weight-loss" className="bg-[#f0f0f2] py-20 sm:py-28">
          <div className="mx-auto grid max-w-[1270px] gap-12 px-5 lg:grid-cols-2 lg:items-center lg:px-6">
            <div className="relative min-h-[520px] overflow-hidden rounded-[28px] bg-[#e7e7e9] lg:min-h-[680px]">
              <Image
                src="/images/weight-management-lifestyle.webp"
                alt="A smiling woman moving confidently outdoors"
                fill
                sizes="(min-width: 1024px) 50vw, calc(100vw - 40px)"
                className="object-cover object-center"
              />
            </div>
            <div className="lg:pl-12">
              <p className="eyebrow text-foreground/45">Weight management</p>
              <h2 className="display-tight mt-4 max-w-xl text-[47px] font-bold sm:text-[62px]">Lose weight with a plan made just for you</h2>
              <ul className="mt-9 space-y-5 text-base text-foreground/70">
                {[
                  "Online evaluation by an independent licensed provider",
                  "Access to leading prescription options",
                  "Ongoing clinical support and refills",
                  "Flexible monthly plans",
                ].map((item) => <li key={item} className="flex gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0" /> {item}</li>)}
              </ul>
              <div className="mt-10 flex flex-wrap gap-3">
                <Button asChild size="lg"><a href={weightCheckoutHref}>Get started</a></Button>
              </div>
              <p className="mt-8 max-w-lg text-[10px] leading-4 text-foreground/40">*Prescription treatment requires an online consultation with a licensed provider. Results vary. Compounded medications are not FDA-approved.</p>
            </div>
          </div>
        </section>

        <section id="faq" className="bg-[#ededf0] py-20 sm:py-28">
          <div className="mx-auto grid max-w-[1170px] gap-12 px-5 lg:grid-cols-[0.65fr_1fr] lg:px-6">
            <div>
              <p className="eyebrow text-foreground/45">Good to know</p>
              <h2 className="display-tight mt-4 text-[50px] font-bold sm:text-[64px]">Questions, answered</h2>
              <p className="mt-6 max-w-sm text-sm leading-6 text-foreground/55">Learn how online care works, what your plan includes, and what to expect next.</p>
            </div>
            <Accordion type="single" collapsible className="space-y-3">
              {faqs.map(([question, answer], index) => (
                <AccordionItem key={question} value={`item-${index}`}>
                  <AccordionTrigger>{question}</AccordionTrigger>
                  <AccordionContent>{answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <section id="get-started" className="bg-[#f5df75] px-5 py-20 text-center sm:py-24">
          <div className="mx-auto max-w-3xl">
            <Sparkles className="mx-auto h-8 w-8" />
            <h2 className="display-tight mt-5 text-[50px] font-bold sm:text-[68px]">Feel more like yourself</h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-foreground/65">Tell us about your goals and connect with a licensed provider online.</p>
            <Button asChild size="lg" className="mt-8"><a href={weightCheckoutHref}>Start a visit <ArrowRight className="h-4 w-4" /></a></Button>
          </div>
        </section>
      </div>

      <footer id="footer" className="bg-[#1e1e20] px-5 py-16 text-white lg:px-8">
        <div className="mx-auto max-w-[1270px]">
          <div className="grid gap-12 md:grid-cols-[1.2fr_2fr]">
            <div>
              <div className="font-serif text-[44px] font-bold leading-none tracking-[-0.06em]">apoth</div>
              <p className="mt-6 max-w-sm text-sm leading-6 text-white/60">
                A technology platform for online intake, account access, billing, and independent provider care workflows.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild variant="secondary" size="sm"><a href={weightCheckoutHref}>Start a visit</a></Button>
                <Button asChild variant="outline" size="sm" className="border-white/25 text-white hover:bg-white/10">
                  <a href="/sign-in">Patient login</a>
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
              {footerGroups.map((group) => (
                <div key={group.heading}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35">{group.heading}</p>
                  <ul className="mt-5 space-y-3 text-white/60">
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <a className="transition-colors hover:text-white" href={link.href}>{link.label}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-14 border-t border-white/10 pt-7 text-[11px] leading-5 text-white/40">
            Apoth Health LLC is a technology platform, not a medical provider. Clinical decisions are made by independent licensed clinicians of MD Integrations and affiliates. Compounded semaglutide and compounded tirzepatide are not FDA-approved. The FDA has not evaluated compounded medications for safety, efficacy, or quality. Medication is dispensed by a separate licensed pharmacy partner when prescribed. Results vary.
          </p>
          <p className="mt-3 text-[11px] leading-5 text-white/40">
            They are not the same as Ozempic, Wegovy, Mounjaro, or Zepbound. BPC-157 and retatrutide are investigational and not FDA-approved.
          </p>
          <div className="mt-6 flex flex-col gap-5 text-[11px] text-white/35 sm:flex-row sm:items-center sm:justify-between">
            <span>© 2026 Apoth Health LLC. All rights reserved.</span>
            <span className="flex items-center gap-2"><PackageCheck className="h-4 w-4" /> Prepared by a licensed U.S. pharmacy</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
