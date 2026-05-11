export type Condition = {
  slug: string;
  name: string;
  treats: string;
  treatments: string[];
  startingFrom: string;
  blurb: string;
};

export const conditions: Condition[] = [
  {
    slug: "sexual-health",
    name: "Sexual health",
    treats: "Erectile difficulty, performance, longevity",
    treatments: ["Sildenafil", "Tadalafil daily", "Tadalafil PRN"],
    startingFrom: "39",
    blurb:
      "Generic medication, prescribed by a US-licensed clinician after a real visit. Discreet shipping. No subscription tricks.",
  },
  {
    slug: "hair",
    name: "Hair",
    treats: "Male and female pattern hair loss",
    treatments: ["Finasteride", "Topical minoxidil", "Oral minoxidil"],
    startingFrom: "25",
    blurb:
      "The two molecules with real evidence behind them. Your clinician picks what fits your shedding pattern, hairline, and tolerance.",
  },
  {
    slug: "weight",
    name: "Weight",
    treats: "Metabolic care for clinically eligible adults",
    treatments: ["Compounded semaglutide", "Compounded tirzepatide"],
    startingFrom: "199",
    blurb:
      "GLP-1 therapy with a real intake, real labs, and real follow-up. We will turn down patients who do not clinically qualify.",
  },
  {
    slug: "peptides",
    name: "Peptides",
    treats: "Investigational, physician-supervised protocols",
    treatments: ["BPC-157", "Retatrutide"],
    startingFrom: "89",
    blurb:
      "Research-tier peptides, prescribed only when clinically appropriate, dispensed through licensed compounding pharmacies. We will tell you what is and is not FDA-approved before you start.",
  },
];

export type Clinician = {
  slug: string;
  name: string;
  credential: string;
  state: string;
  bio: string;
  initial: string;
};

export const clinicians: Clinician[] = [
  {
    slug: "elena-park",
    name: "Elena Park, MD",
    credential: "Internal Medicine",
    state: "Licensed in CA, NY, TX, FL, IL",
    bio: "Twelve years in primary care before telehealth. Believes the worst medicine is the kind that talks down to the patient.",
    initial: "EP",
  },
  {
    slug: "marcus-rivera",
    name: "Marcus Rivera, NP",
    credential: "Family Nurse Practitioner",
    state: "Licensed in CA, AZ, NV, CO, WA",
    bio: "Specialises in metabolic health and men's care. Will read your last three blood panels before the visit.",
    initial: "MR",
  },
  {
    slug: "harriet-okafor",
    name: "Harriet Okafor, DO",
    credential: "Family Medicine",
    state: "Licensed in NY, NJ, MA, PA, GA, FL",
    bio: "Practiced in a public hospital before going independent. Reads peptide research the way other people read novels.",
    initial: "HO",
  },
];

export type FaqItem = { q: string; a: string };

export const faqs: FaqItem[] = [
  {
    q: "Do you take insurance?",
    a: "Not yet. Visits and medication are cash-pay so we can keep prices flat and predictable. We will provide a superbill on request if you want to file for out-of-network reimbursement.",
  },
  {
    q: "How does prescribing actually work?",
    a: "Every prescription is written by a US-licensed clinician after a real visit. Async for stable refills, video for new starts, controlled substances, or anything that needs a closer look. We will turn down requests that are not clinically appropriate.",
  },
  {
    q: "Are peptides legal? Are they safe?",
    a: "Some peptides on this site (BPC-157, Retatrutide) are not FDA-approved and are considered research-tier. We prescribe them through licensed 503A compounding pharmacies under physician supervision, and only when the clinical picture supports it. We tell you the regulatory status before you order.",
  },
  {
    q: "Can I cancel?",
    a: "Anytime, in two clicks, no phone tree. We do not honor charges for medication that has not shipped. If something we shipped is wrong on our end, we replace it.",
  },
  {
    q: "What states are you available in?",
    a: "We are currently active in twenty-eight states across our clinical team. Check eligibility at the start of intake. We will not collect a card before confirming we can actually see you.",
  },
];

export const navLinks = [
  { href: "#what-we-treat", label: "What we treat" },
  { href: "#pricing", label: "Pricing" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#clinicians", label: "Clinicians" },
];
