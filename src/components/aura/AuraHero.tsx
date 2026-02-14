"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Clock, Users, ArrowDown } from "lucide-react";
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
  fromPrice?: string;
}

export function AuraHero({
  title,
  date,
  dateRaw,
  doors,
  location,
  age,
  bannerImage,
  tagLine,
  fromPrice,
}: AuraHeroProps) {
  const scrollToTickets = () => {
    document.getElementById("tickets")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="space-y-8 px-5 sm:px-8 pt-8 sm:pt-10">
      <div className="mx-auto max-w-2xl space-y-8">
        {/* Banner image */}
        {bannerImage && (
          <div className="overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bannerImage}
              alt={title}
              className="w-full aspect-[2/1] sm:aspect-[21/9] object-cover"
            />
          </div>
        )}

        {/* Title and tagline */}
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.1]">
            {title}
          </h1>
          {tagLine && (
            <p className="text-lg sm:text-xl text-muted-foreground max-w-lg">
              {tagLine}
            </p>
          )}
        </div>

        {/* Event meta info */}
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

        {/* Price anchor */}
        {fromPrice && (
          <p className="text-sm text-muted-foreground">
            From <span className="text-2xl font-bold text-foreground tabular-nums">{fromPrice}</span>
          </p>
        )}

        {/* CTA + Countdown */}
        <div className="flex flex-col items-start gap-4">
          <Button size="lg" className="text-base font-semibold px-8" onClick={scrollToTickets}>
            Get Tickets
            <ArrowDown size={16} />
          </Button>
          {dateRaw && new Date(dateRaw).getTime() > Date.now() && (
            <AuraCountdown targetDate={dateRaw} />
          )}
        </div>
      </div>
    </section>
  );
}
