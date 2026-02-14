"use client";

import { MapPin } from "lucide-react";

interface AuraEventInfoProps {
  aboutText?: string;
  detailsText?: string;
  description?: string;
  venue?: string;
  venueAddress?: string;
}

/**
 * Checks whether a block of text looks like a structured list
 * (lines starting with -, *, or a number followed by a dot/paren).
 */
function looksLikeList(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;
  const listLineCount = lines.filter((l) =>
    /^\s*[-*]\s|^\s*\d+[.)]\s/.test(l)
  ).length;
  return listLineCount / lines.length >= 0.5;
}

/**
 * Renders text that looks like a bullet / numbered list as a clean <ul>,
 * otherwise renders it as a whitespace-preserving paragraph.
 */
function TextBlock({ text }: { text: string }) {
  if (looksLikeList(text)) {
    const items = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => l.replace(/^[-*]\s*/, "").replace(/^\d+[.)]\s*/, ""));

    return (
      <ul className="space-y-2 text-[15px] leading-relaxed text-muted-foreground">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[7px] block h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p className="text-[15px] leading-[1.75] text-muted-foreground whitespace-pre-line">
      {text}
    </p>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs uppercase tracking-wider font-medium text-muted-foreground mb-3">
      {children}
    </h3>
  );
}

export function AuraEventInfo({
  aboutText,
  detailsText,
  description,
  venue,
  venueAddress,
}: AuraEventInfoProps) {
  const showAbout = aboutText || (!aboutText && !detailsText && description);
  const aboutContent = aboutText || description;

  if (!showAbout && !detailsText && !venue) return null;

  return (
    <div className="max-w-prose space-y-10">
      {/* About */}
      {showAbout && aboutContent && (
        <section>
          <SectionHeading>About</SectionHeading>
          <TextBlock text={aboutContent} />
        </section>
      )}

      {/* Details */}
      {detailsText && (
        <section>
          <SectionHeading>Details</SectionHeading>
          <TextBlock text={detailsText} />
        </section>
      )}

      {/* Venue */}
      {venue && (
        <section>
          <SectionHeading>Venue</SectionHeading>
          <div className="flex items-start gap-2">
            <MapPin size={15} className="mt-[3px] shrink-0 text-muted-foreground" />
            <div>
              <p className="text-[15px] font-semibold text-foreground">
                {venue}
              </p>
              {venueAddress && (
                <p className="text-sm leading-relaxed text-muted-foreground mt-0.5">
                  {venueAddress}
                </p>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
