"use client";

import {
  AuroraAccordion,
  AuroraAccordionItem,
  AuroraAccordionTrigger,
  AuroraAccordionContent,
} from "./ui/accordion";

interface AuroraEventInfoProps {
  aboutText?: string;
  detailsText?: string;
  description?: string;
  venueName?: string;
  venueAddress?: string;
  city?: string;
}

export function AuroraEventInfo({
  aboutText,
  detailsText,
  description,
  venueName,
  venueAddress,
  city,
}: AuroraEventInfoProps) {
  const hasAbout = !!aboutText;
  const hasDetails = !!detailsText;
  const hasVenue = !!(venueName || venueAddress);
  const hasDescription = !!description;

  // Build default open sections
  const defaultOpen: string[] = [];
  if (hasAbout) defaultOpen.push("about");
  else if (hasDescription) defaultOpen.push("about");

  return (
    <div>
      <AuroraAccordion type="multiple" defaultValue={defaultOpen}>
        {/* About Section */}
        {(hasAbout || (!hasAbout && !hasDetails && hasDescription)) && (
          <AuroraAccordionItem value="about">
            <AuroraAccordionTrigger>
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                About
              </span>
            </AuroraAccordionTrigger>
            <AuroraAccordionContent>
              <p className="leading-relaxed whitespace-pre-wrap">
                {aboutText || description}
              </p>
            </AuroraAccordionContent>
          </AuroraAccordionItem>
        )}

        {/* Details Section */}
        {hasDetails && (
          <AuroraAccordionItem value="details">
            <AuroraAccordionTrigger>
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
                Details
              </span>
            </AuroraAccordionTrigger>
            <AuroraAccordionContent>
              <p className="leading-relaxed whitespace-pre-wrap">{detailsText}</p>
            </AuroraAccordionContent>
          </AuroraAccordionItem>
        )}

        {/* Venue Section */}
        {hasVenue && (
          <AuroraAccordionItem value="venue">
            <AuroraAccordionTrigger>
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                Venue
              </span>
            </AuroraAccordionTrigger>
            <AuroraAccordionContent>
              <div className="space-y-1">
                {venueName && <p className="font-medium text-aurora-text">{venueName}</p>}
                {venueAddress && <p>{venueAddress}</p>}
                {city && <p>{city}</p>}
              </div>
            </AuroraAccordionContent>
          </AuroraAccordionItem>
        )}
      </AuroraAccordion>
    </div>
  );
}
