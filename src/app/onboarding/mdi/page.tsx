import type { Metadata } from "next";
import { MdiIntakeClient } from "./MdiIntakeClient";

export const metadata: Metadata = {
  title: "Clinical intake · Apoth",
  description: "Complete the MDI-backed clinical questionnaire.",
};

export default function MdiHandoffPage() {
  return (
    <main className="bg-cream px-5 py-10 text-ink sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 max-w-3xl">
          <p className="text-eyebrow uppercase text-ash">Onboarding</p>
          <h1 className="mt-4 text-[2rem] font-semibold leading-tight text-ink sm:text-[2.6rem]">
            Clinical intake
          </h1>
          <p className="mt-4 text-[1.05rem] leading-7 text-ink/72">
            Answer the MDI questionnaire here. Apoth sends the response to MDI
            and keeps only the handoff status and opaque case pointers.
          </p>
        </div>
        <MdiIntakeClient />
      </div>
    </main>
  );
}
