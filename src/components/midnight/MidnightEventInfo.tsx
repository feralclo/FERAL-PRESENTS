"use client";

import { Separator } from "@/components/ui/separator";

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
        <div key={section.title} className={i > 0 ? "mt-14 max-md:mt-10" : ""}>
          <h2 className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.2em] uppercase mb-7 pb-4 border-b border-foreground/[0.06] text-foreground/35">
            {section.title}
          </h2>
          <p className="font-[family-name:var(--font-display)] text-base leading-[1.85] text-foreground/60 tracking-[0.01em]">
            {section.content}
          </p>
        </div>
      ))}
    </div>
  );
}
