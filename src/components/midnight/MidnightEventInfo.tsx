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
    <div>
      {sections.map((section, i) => (
        <div key={section.title} className={i > 0 ? "mt-16 max-md:mt-12" : ""}>
          <h2 className="font-[family-name:var(--font-sans)] text-xs font-semibold tracking-[0.15em] uppercase mb-8 pb-4 border-b border-foreground/[0.05] text-foreground/30">
            {section.title}
          </h2>
          <p className="font-[family-name:var(--font-display)] text-base max-md:text-[15px] leading-[1.95] text-foreground/55 tracking-[0.01em]">
            {section.content}
          </p>
        </div>
      ))}
    </div>
  );
}
