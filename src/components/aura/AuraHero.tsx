"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Clock, Users } from "lucide-react";
import { AuraCountdown } from "./AuraCountdown";

interface AuraHeroProps {
  title: string;
  date: string;
  dateRaw?: string;
  doors: string;
  location: string;
  age?: string;
  bannerImage?: string;
  tagLine?: string;
}

/**
 * Aura Hero — full-width hero image with dark gradient overlay.
 *
 * Title and tagline overlaid at the bottom of the hero image, fading into the
 * background. Event meta displayed as Badge components below the image.
 * CTA button with amber glow + countdown beside it.
 */
export function AuraHero({
  title,
  date,
  dateRaw,
  doors,
  location,
  age,
  bannerImage,
  tagLine,
}: AuraHeroProps) {
  const scrollToTickets = () => {
    document.getElementById("tickets")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative">
      {/* Full-width hero image with gradient overlay */}
      {bannerImage && (
        <div className="relative h-[50vh] min-h-[320px] max-h-[500px] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerImage}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Dark gradient overlay fading to background */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
          {/* Content overlaid at bottom */}
          <div className="absolute inset-x-0 bottom-0 px-5 sm:px-8 pb-6">
            <div className="mx-auto max-w-2xl aura-fade-in-up">
              <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.1]">
                {title}
              </h1>
              {tagLine && (
                <p className="mt-2 text-base sm:text-lg text-foreground/70 max-w-lg">
                  {tagLine}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* If no banner image, show title without image */}
      {!bannerImage && (
        <div className="px-5 sm:px-8 pt-10 pb-4">
          <div className="mx-auto max-w-2xl aura-fade-in-up">
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.1]">
              {title}
            </h1>
            {tagLine && (
              <p className="mt-3 text-lg text-muted-foreground max-w-lg">
                {tagLine}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Event meta info — Badge-based */}
      <div className="mx-auto max-w-2xl px-5 sm:px-8 pt-5 space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default" className="gap-1.5">
            <Calendar size={12} />
            {date}
          </Badge>
          <Badge variant="outline" className="gap-1.5">
            <Clock size={12} />
            Doors {doors}
          </Badge>
          <Badge variant="outline" className="gap-1.5">
            <MapPin size={12} />
            {location}
          </Badge>
          {age && (
            <Badge variant="outline" className="gap-1.5">
              <Users size={12} />
              {age}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-4">
          <Button
            size="lg"
            className="aura-glow aura-press rounded-lg px-8 font-semibold"
            onClick={scrollToTickets}
          >
            Get Tickets
          </Button>
          {dateRaw && new Date(dateRaw).getTime() > Date.now() && (
            <AuraCountdown targetDate={dateRaw} />
          )}
        </div>

        <div className="aura-divider" />
      </div>
    </section>
  );
}
