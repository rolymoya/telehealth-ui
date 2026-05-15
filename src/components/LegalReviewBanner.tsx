export function LegalReviewBanner() {
  return (
    <div className="border-b border-clay-deep/20 bg-clay-tint/40">
      <div className="mx-auto max-w-page px-6 py-4 md:px-10">
        <p className="text-pretty text-sm leading-relaxed text-ink/85">
          <span className="font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep">
            Draft for legal review ·
          </span>{" "}
          This document is a starting point intended for review by a healthcare
          attorney before launch. It is not legal advice, has not been reviewed
          by counsel, and should not be relied upon as the final terms governing
          your use of Apothem.
        </p>
      </div>
    </div>
  );
}
