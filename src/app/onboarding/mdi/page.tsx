import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { MdiIntakeClient } from "./MdiIntakeClient";

export const metadata: Metadata = {
  title: "Clinical intake · Apoth",
  description: "Complete the MDI-backed clinical questionnaire.",
};

export default function MdiHandoffPage() {
  return (
    <>
      <Nav variant="light" />
      <main id="main" className="bg-[#f9f9fa] px-5 py-10 text-ink sm:px-8 lg:px-12 lg:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-5 max-w-3xl rounded-[26px] bg-[#4e80ee] p-7 text-white shadow-soft sm:p-10">
            <p className="text-eyebrow uppercase text-white/70">Onboarding</p>
            <h1 className="display-serif mt-4 text-[2rem] leading-tight sm:text-[2.6rem]">
              MDI questionnaire
            </h1>
            <p className="mt-4 text-[1.05rem] leading-7 text-white/80">
              Answer the MDI questionnaire here after your profile is linked.
              Apoth sends responses to MDI and keeps only the handoff status and
              opaque case pointers. Medication disclosure comes after submission
              when it applies.
            </p>
          </div>
          <MdiIntakeClient />
        </div>
      </main>
      <Footer />
    </>
  );
}
