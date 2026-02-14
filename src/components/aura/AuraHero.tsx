"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MapPin, ShieldCheck, Users } from "lucide-react";
import { AuraCountdown } from "./AuraCountdown";

interface AuraHeroProps {
  title: string;
  date: string;
  dateRaw: string;
  doors: string;
  location: string;
  age: string;
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
  const [imgFailed, setImgFailed] = useState(false);
  const showCountdown = dateRaw && new Date(dateRaw).getTime() > Date.now();

  const scrollToTickets = () => {
    document.getElementById("tickets")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-[85vh] flex flex-col justify-end overflow-hidden">
      {/* Background image */}
      {bannerImage && !imgFailed && (
        <div className="absolute inset-0 z-0">
          <img
            src={bannerImage}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
          {/* Warm darkening overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-aura-bg)] via-[var(--color-aura-bg)]/70 to-[var(--color-aura-bg)]/40" />
        </div>
      )}

      {/* Gradient mesh */}
      <div className="aura-mesh" />

      {/* Bottom gradient for content readability */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[var(--color-aura-bg)] to-transparent z-[2]" />

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-12 pt-32 sm:px-8">
        <div className="aura-fade-in-up space-y-6">
          {/* Official badge */}
          <div className="flex items-center gap-2">
            <Badge className="bg-primary/15 text-primary border-primary/25 gap-1.5">
              <ShieldCheck size={12} />
              Official Ticket Store
            </Badge>
          </div>

          {/* Title */}
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            {title}
          </h1>

          {/* Tagline */}
          {tagLine && (
            <p className="max-w-xl text-lg text-muted-foreground leading-relaxed">
              {tagLine}
            </p>
          )}

          {/* Event meta pills */}
          <div className="flex flex-wrap items-center gap-3">
            <MetaPill icon={<Calendar size={14} />} label={date} />
            <MetaPill icon={<Clock size={14} />} label={`Doors ${doors}`} />
            <MetaPill icon={<MapPin size={14} />} label={location} />
            <MetaPill icon={<Users size={14} />} label={age} />
          </div>

          {/* Countdown */}
          {showCountdown && (
            <div className="pt-2">
              <AuraCountdown targetDate={dateRaw} />
            </div>
          )}

          {/* CTA */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              size="lg"
              onClick={scrollToTickets}
              className="aura-glow-accent aura-press rounded-full px-8 text-sm font-semibold"
            >
              Get Tickets
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetaPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-card/60 border border-border/40 px-3.5 py-1.5 text-sm text-foreground/80">
      <span className="text-primary/70">{icon}</span>
      {label}
    </div>
  );
}
