import { Hero } from "@/components/Hero";
import { Conditions } from "@/components/Conditions";
import { Pricing } from "@/components/Pricing";
import { HowItWorks } from "@/components/HowItWorks";
import { Clinicians } from "@/components/Clinicians";
import { Faq } from "@/components/Faq";
import { Footer } from "@/components/Footer";

export default function HomePage() {
  return (
    <>
      <main id="main">
        <Hero />
        <Conditions />
        <Pricing />
        <HowItWorks />
        <Clinicians />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
