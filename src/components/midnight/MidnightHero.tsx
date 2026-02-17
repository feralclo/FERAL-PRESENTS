"use client";

import { Button } from "@/components/ui/button";

interface MidnightHeroProps {
  title: string;
  date: string;
  doors: string;
  location: string;
  age: string;
  bannerImage: string;
  tag?: string;
}

export function MidnightHero({
  title,
  date,
  doors,
  location,
  age,
  bannerImage,
  tag,
}: MidnightHeroProps) {
  return (
    <section className="midnight-hero midnight-hero-glass-border relative flex items-end justify-center text-center overflow-hidden bg-background">
      {/* Background image via CSS — avoids iOS Safari <img> + object-fit
          compositor bug that causes "pop and enlarge" during scroll.
          scale(1.05) prevents edge gaps on varied aspect ratios.
          saturate(1.15) enriches colours through the glass overlays. */}
      {bannerImage && (
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${bannerImage})`,
            filter: "saturate(1.15)",
            transform: "scale(1.05)",
          }}
        />
      )}

      {/* Glass depth overlays */}
      <div className="absolute inset-0 z-[1] pointer-events-none">
        <div className="midnight-hero-vignette absolute inset-0" />
        <div className="midnight-hero-reflection absolute inset-0" />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg,
              rgba(0,0,0,0.2) 0%,
              rgba(0,0,0,0.05) 15%,
              transparent 30%,
              transparent 50%,
              rgba(0,0,0,0.4) 65%,
              rgba(0,0,0,0.7) 82%,
              var(--color-background) 100%
            )`,
          }}
        />
        <div className="midnight-hero-frame absolute inset-0" />
      </div>

      {/* Content */}
      <div className="relative z-[2] w-full max-w-[800px] px-6 pb-12 max-md:px-5 max-md:pb-7 max-[480px]:px-4 max-[480px]:pb-5">
        {tag && (
          <div className="inline-flex items-center gap-2 font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.15em] uppercase text-foreground/60 mb-5 max-[480px]:text-[9px] max-[480px]:mb-3.5">
            <span
              className="w-1.5 h-1.5 rounded-full bg-primary"
              style={{
                boxShadow: "0 0 12px var(--color-primary)",
                animation: "midnight-pulse 2s ease-in-out infinite",
              }}
            />
            {tag}
          </div>
        )}

        <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.5rem,7vw,5rem)] max-md:text-[clamp(2rem,9vw,3rem)] max-[480px]:text-[clamp(1.6rem,8vw,2.4rem)] font-extrabold tracking-[-0.03em] leading-[0.95] text-foreground [text-wrap:balance] mb-6 max-md:mb-5 max-[480px]:mb-4">
          {title}
        </h1>

        <div className="flex items-center justify-center gap-4 max-md:gap-3 max-[480px]:gap-2 flex-wrap font-[family-name:var(--font-display)] text-[15px] max-md:text-sm max-[480px]:text-[13px] font-medium text-foreground/80 tracking-[0.01em] mb-2">
          <span>{date}</span>
          <span className="w-1 h-1 rounded-full bg-foreground/30 shrink-0" />
          <span>{location}</span>
        </div>

        {(doors || age) && (
          <div className="flex items-center justify-center gap-2 font-[family-name:var(--font-display)] text-[13px] max-md:text-xs max-[480px]:text-[11px] text-foreground/40">
            {doors && <span>Doors {doors}</span>}
            {doors && age && <span className="opacity-50">&middot;</span>}
            {age && <span>{age}</span>}
          </div>
        )}

        <Button
          size="lg"
          className="mt-8 max-md:mt-6 max-[480px]:mt-6 max-[480px]:w-full px-10 text-sm font-semibold tracking-[0.02em] rounded-[10px]"
          onClick={() =>
            document
              .getElementById("tickets")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        >
          Get Tickets
        </Button>
      </div>
    </section>
  );
}
