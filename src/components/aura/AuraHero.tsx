"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
    <section className="space-y-6 px-5 sm:px-8 pt-6">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Banner image */}
        {bannerImage && (
          <div className="overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bannerImage}
              alt={title}
              className="w-full object-cover"
            />
          </div>
        )}

        {/* Title and tagline */}
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-tight">
            {title}
          </h1>
          {tagLine && (
            <p className="text-base sm:text-lg text-muted-foreground max-w-lg">
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

        {/* CTA + Countdown */}
        <div className="flex items-center gap-4">
          <Button size="lg" onClick={scrollToTickets}>
            Get Tickets
          </Button>
          {dateRaw && new Date(dateRaw).getTime() > Date.now() && (
            <AuraCountdown targetDate={dateRaw} />
          )}
        </div>

        <Separator />
      </div>
    </section>
  );
}
