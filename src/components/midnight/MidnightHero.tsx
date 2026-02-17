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
  minPrice?: number;
  currSymbol?: string;
}

export function MidnightHero({
  title,
  date,
  doors,
  location,
  age,
  bannerImage,
  tag,
  minPrice,
  currSymbol,
}: MidnightHeroProps) {
  return (
    <section className="midnight-hero midnight-hero-glass-border relative flex items-end justify-center text-center overflow-hidden bg-background">
      {/* Background image via CSS — avoids iOS Safari <img> + object-fit
          compositor bug that causes "pop and enlarge" during scroll.
          scale(1.05) prevents edge gaps on varied aspect ratios.
          saturate(1.15) enriches colours through the dark overlays. */}
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

      {/* Cinematic depth overlays — aggressive bottom fade dissolves
          the artwork into the page background for seamless transition */}
      <div className="absolute inset-0 z-[1] pointer-events-none">
        <div className="midnight-hero-vignette absolute inset-0" />
        <div className="midnight-hero-reflection absolute inset-0" />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg,
              rgba(0,0,0,0.25) 0%,
              rgba(0,0,0,0.05) 10%,
              transparent 22%,
              transparent 38%,
              rgba(0,0,0,0.2) 50%,
              rgba(0,0,0,0.5) 62%,
              rgba(0,0,0,0.78) 75%,
              var(--color-background) 92%
            )`,
          }}
        />
        <div className="midnight-hero-frame absolute inset-0" />
      </div>

      {/* Content — large cinematic typography
           max-lg:z-[11] lifts content above the ticket section (z-10) in the
           overlap zone so the CTA button is tappable on mobile. */}
      <div className="relative z-[2] max-lg:z-[11] w-full max-w-[900px] px-6 pb-14 max-md:px-5 max-md:pb-9 max-[480px]:px-4 max-[480px]:pb-7">
        {tag && (
          <div className="inline-flex items-center gap-2.5 font-[family-name:var(--font-mono)] text-[10px] font-medium tracking-[0.18em] uppercase text-foreground/50 mb-6 max-md:mb-4 max-[480px]:text-[9px]">
            <span
              className="w-1.5 h-1.5 rounded-full bg-primary"
              style={{
                boxShadow: "0 0 10px var(--color-primary)",
                animation: "midnight-pulse 2.5s ease-in-out infinite",
              }}
            />
            {tag}
          </div>
        )}

        <h1 className="font-[family-name:var(--font-display)] text-[clamp(3rem,9vw,5.5rem)] max-md:text-[clamp(2.2rem,10vw,3.2rem)] max-[480px]:text-[clamp(1.8rem,9vw,2.6rem)] font-black tracking-[-0.04em] leading-[0.88] text-foreground [text-wrap:balance] mb-7 max-md:mb-5 max-[480px]:mb-4">
          {title}
        </h1>

        {/* Metadata — date, location, doors, age in compact rows */}
        <div className="flex items-center justify-center gap-3 max-md:gap-2.5 flex-wrap font-[family-name:var(--font-display)] text-[15px] max-md:text-sm max-[480px]:text-[13px] font-medium text-foreground/75 tracking-[0.01em]">
          <span>{date}</span>
          <span className="w-[3px] h-[3px] rounded-full bg-foreground/25 shrink-0" />
          <span>{location}</span>
        </div>

        {(doors || age) && (
          <div className="flex items-center justify-center gap-2 mt-1.5 font-[family-name:var(--font-display)] text-[13px] max-md:text-xs max-[480px]:text-[11px] text-foreground/35">
            {doors && <span>Doors {doors}</span>}
            {doors && age && <span className="opacity-40">&middot;</span>}
            {age && <span>{age}</span>}
          </div>
        )}

        {minPrice != null && minPrice > 0 && currSymbol && (
          <p className="mt-7 max-md:mt-5 max-[480px]:mt-4 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.12em] uppercase text-foreground/40">
            From {currSymbol}{minPrice % 1 === 0 ? minPrice : minPrice.toFixed(2)}
          </p>
        )}

        <Button
          size="lg"
          variant="outline"
          className="mt-7 max-md:mt-5 max-[480px]:mt-4 max-[480px]:w-full px-10 text-sm font-semibold tracking-[0.03em] rounded-xl bg-white/[0.06] border-white/[0.12] text-foreground/90 hover:bg-white/[0.1] hover:border-white/[0.2] transition-all duration-200"
          onClick={() =>
            document
              .getElementById("tickets")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        >
          Get Tickets
          <svg className="ml-2 w-4 h-4 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </Button>
      </div>
    </section>
  );
}
