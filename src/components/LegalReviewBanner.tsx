export function LegalReviewBanner() {
  return (
    <div className="border-b border-[#4e80ee]/20 bg-[#eef3ff]">
      <div className="mx-auto max-w-[1270px] px-5 py-4 lg:px-6">
        <p className="text-pretty text-sm leading-relaxed text-[#343437]">
          <span className="font-semibold uppercase tracking-[0.12em] text-[0.68rem] text-[#315fbf]">
            Draft for legal review ·
          </span>{" "}
          This document is a starting point intended for review by a healthcare
          attorney before launch. It is not legal advice, has not been reviewed
          by counsel, and should not be relied upon as the final terms governing
          your use of Apoth.
        </p>
      </div>
    </div>
  );
}
