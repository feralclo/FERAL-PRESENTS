"use client";

import { MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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
      <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p className="text-sm leading-7 text-muted-foreground whitespace-pre-line">
      {text}
    </p>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs uppercase tracking-widest font-medium text-muted-foreground mb-3">
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

  const sections: React.ReactNode[] = [];

  if (showAbout && aboutContent) {
    sections.push(
      <div key="about">
        <SectionHeading>About</SectionHeading>
        <TextBlock text={aboutContent} />
      </div>
    );
  }

  if (detailsText) {
    sections.push(
      <div key="details">
        <SectionHeading>Details</SectionHeading>
        <TextBlock text={detailsText} />
      </div>
    );
  }

  if (venue) {
    sections.push(
      <div key="venue">
        <SectionHeading>Venue</SectionHeading>
        <div className="flex items-start gap-3">
          <Badge variant="outline" className="gap-1.5 shrink-0 mt-0.5">
            <MapPin size={12} />
          </Badge>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {venue}
            </p>
            {venueAddress && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {venueAddress}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className="max-w-prose">
      <CardContent className="space-y-6">
        {sections.map((section, i) => (
          <div key={i}>
            {i > 0 && <Separator className="mb-6" />}
            {section}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
