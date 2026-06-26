export type PricingTier = {
  label: string;
  monthly: string;
  includes: string;
};

export type Condition = {
  slug: string;
  name: string;
  treats: string;
  treatments: string[];
  // Placeholder single-number price used while tier pricing is being defined.
  // Surfaced as "currently from" copy, not "starting at" marketing copy.
  startingFrom: string;
  // TODO: populate per-condition tiers from product. Replace startingFrom usage
  // once tiers are filled in. Each tier must list an exact all-in monthly price.
  pricingTiers: PricingTier[] | null;
  blurb: string;
  fdaStatus:
    | "fda-approved"
    | "compounded-not-fda-approved"
    | "investigational-not-fda-approved";
  fdaNote: string;
};

export const conditions: Condition[] = [
  {
    slug: "sexual-health",
    name: "Sexual health",
    treats: "Erectile difficulty, performance, longevity",
    treatments: ["Sildenafil", "Tadalafil daily", "Tadalafil PRN"],
    startingFrom: "39",
    pricingTiers: null,
    blurb:
      "Generic medication, prescribed by a US-licensed clinician after a real visit. Discreet shipping. No subscription tricks.",
    fdaStatus: "fda-approved",
    fdaNote:
      "Sildenafil and tadalafil are FDA-approved medications dispensed by a licensed pharmacy partner.",
  },
  {
    slug: "hair",
    name: "Hair",
    treats: "Male and female pattern hair loss",
    treatments: ["Finasteride", "Topical minoxidil", "Oral minoxidil"],
    startingFrom: "25",
    pricingTiers: null,
    blurb:
      "The two molecules with real evidence behind them. Your clinician picks what fits your shedding pattern, hairline, and tolerance.",
    fdaStatus: "fda-approved",
    fdaNote:
      "Finasteride and minoxidil are FDA-approved medications dispensed by a licensed pharmacy partner. Oral minoxidil for hair loss is prescribed off-label.",
  },
  {
    slug: "weight",
    name: "Weight",
    treats: "Metabolic care for clinically eligible adults",
    treatments: ["Compounded semaglutide", "Compounded tirzepatide"],
    startingFrom: "199",
    pricingTiers: null,
    blurb:
      "GLP-1 therapy with a real intake, real labs, and real follow-up. We will turn down patients who do not clinically qualify. Results vary by patient.",
    fdaStatus: "compounded-not-fda-approved",
    fdaNote:
      "Compounded semaglutide and compounded tirzepatide are not FDA-approved. They are not the same as Ozempic, Wegovy, Mounjaro, or Zepbound, and have not been evaluated by the FDA for safety, efficacy, or quality. They are prepared by a licensed 503A compounding pharmacy partner under a valid prescription from a clinician licensed in your state.",
  },
  {
    slug: "peptides",
    name: "Peptides",
    treats: "Investigational, physician-supervised protocols",
    treatments: ["BPC-157", "Retatrutide"],
    startingFrom: "89",
    pricingTiers: null,
    blurb:
      "Research-tier peptides, prescribed only when clinically appropriate, dispensed through a licensed compounding pharmacy partner. Results vary by patient.",
    fdaStatus: "investigational-not-fda-approved",
    fdaNote:
      "BPC-157 and retatrutide are investigational and not FDA-approved. They are prepared by a licensed 503A compounding pharmacy partner under physician supervision and a valid prescription. The full regulatory status is disclosed before you order.",
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
    a: "Anytime from your account, no phone tree. Cancellation and refund handling depends on clinician review and pharmacy shipment status; the full policy is in the Terms.",
  },
  {
    q: "What states are you available in?",
    a: "Apoth intends to coordinate care nationwide where clinician licensure, clinical eligibility, and pharmacy shipping rules support the requested care category. Eligibility is confirmed during intake — we will not activate subscription billing before clinical approval.",
  },
];

export const usStates: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

export const navLinks = [
  { href: "/#what-we-treat", label: "What we treat" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#clinicians", label: "Clinicians" },
];
