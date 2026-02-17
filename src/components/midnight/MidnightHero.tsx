"use client";

import { useState } from "react";
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
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <section className="relative flex items-end justify-center text-center overflow-hidden bg-background h-[clamp(480px,65vh,750px)] max-md:h-[clamp(380px,55vh,560px)] max-[480px]:h-[clamp(320px,50vh,480px)]">
      {/* Background image */}
      <div className="absolute inset-0 z-0">
        {bannerImage && !imgFailed && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={bannerImage}
            alt=""
            className={`w-full h-full object-cover object-center transition-opacity duration-[800ms] ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            onError={() => setImgFailed(true)}
            onLoad={() => setImgLoaded(true)}
          />
        )}
        {/* Gradient overlay — transparent top, fades to bg */}
        <div
          className="absolute inset-0 z-[1]"
          style={{
            background: "linear-gradient(180deg, transparent 0%, transparent 50%, rgba(0,0,0,0.6) 78%, var(--color-background) 100%)",
          }}
        />
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

        {/* Primary meta — date / venue */}
        <div className="flex items-center justify-center gap-4 max-md:gap-3 max-[480px]:gap-2 flex-wrap font-[family-name:var(--font-display)] text-[15px] max-md:text-sm max-[480px]:text-[13px] font-medium text-foreground/80 tracking-[0.01em] mb-2">
          <span>{date}</span>
          <span className="w-1 h-1 rounded-full bg-foreground/30 shrink-0" />
          <span>{location}</span>
        </div>

        {/* Secondary meta — doors / age */}
        {(doors || age) && (
          <div className="flex items-center justify-center gap-2 font-[family-name:var(--font-display)] text-[13px] max-md:text-xs max-[480px]:text-[11px] text-foreground/40">
            {doors && <span>Doors {doors}</span>}
            {doors && age && <span className="opacity-50">&middot;</span>}
            {age && <span>{age}</span>}
          </div>
        )}

        {/* CTA */}
        <Button
          size="lg"
          className="mt-8 max-md:mt-6 max-[480px]:mt-6 max-[480px]:w-full px-10 text-sm font-semibold tracking-[0.02em] rounded-[10px]"
          onClick={() =>
            document
              .getElementById("tickets")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          Get Tickets
        </Button>
      </div>
    </section>
  );
}
