"use client";

interface MidnightEventInfoProps {
  aboutText?: string | null;
  detailsText?: string | null;
  description?: string | null;
}

export function MidnightEventInfo({
  aboutText,
  detailsText,
  description,
}: MidnightEventInfoProps) {
  const hasStructured = aboutText || detailsText;
  const sections: { title: string; content: string }[] = [];

  if (aboutText) sections.push({ title: "About", content: aboutText });
  if (detailsText) sections.push({ title: "Details", content: detailsText });
  if (!hasStructured && description) {
    sections.push({ title: "About", content: description });
  }

  if (sections.length === 0) return null;

  return (
    <div className="rounded-xl bg-foreground/[0.02] border border-foreground/[0.05] px-5 py-6 max-[480px]:px-4 max-[480px]:py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      {sections.map((section, i) => (
        <div key={section.title} className={i > 0 ? "mt-8 max-md:mt-6 pt-8 max-md:pt-6 border-t border-foreground/[0.04]" : ""}>
          <h2 className="font-[family-name:var(--font-sans)] text-xs font-bold tracking-[0.18em] uppercase mb-7 pb-4 border-b border-foreground/[0.06] text-foreground/60">
            {section.title}
          </h2>
          <div className={section.title === "About" ? "border-l-2 border-primary/30 pl-5 max-[480px]:pl-4" : ""}>
            <p className="font-[family-name:var(--font-display)] text-base max-md:text-[15px] leading-[1.95] text-foreground/75 tracking-[0.01em] whitespace-pre-line">
              {section.content}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
