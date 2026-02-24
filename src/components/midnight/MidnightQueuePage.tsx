"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { VerifiedBanner } from "@/components/layout/VerifiedBanner";
import { MidnightFooter } from "./MidnightFooter";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { useHypeQueue } from "@/hooks/useHypeQueue";
import { Check, Ticket } from "lucide-react";
import type { Event, TicketTypeRow } from "@/types/events";

import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

interface MidnightQueuePageProps {
  event: Event & { ticket_types: TicketTypeRow[] };
  durationSeconds: number;
  onReleased: () => void;
}

/** Spawn a burst of particles from the card center */
function spawnParticles(container: HTMLElement) {
  const count = 24;
  const colors = [
    "rgba(52, 211, 153, 0.9)",
    "rgba(110, 231, 183, 0.8)",
    "rgba(255, 255, 255, 0.7)",
    "rgba(167, 139, 250, 0.8)",
  ];

  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const distance = 80 + Math.random() * 120;
    const size = 3 + Math.random() * 4;
    const duration = 600 + Math.random() * 400;

    el.style.cssText = `
      position: absolute;
      top: 50%; left: 50%;
      width: ${size}px; height: ${size}px;
      border-radius: 50%;
      background: ${colors[i % colors.length]};
      pointer-events: none;
      z-index: 50;
      transform: translate(-50%, -50%) scale(1);
      animation: midnight-particle ${duration}ms cubic-bezier(0.25, 1, 0.5, 1) forwards;
      --px: ${Math.cos(angle) * distance}px;
      --py: ${Math.sin(angle) * distance}px;
    `;
    container.appendChild(el);
    setTimeout(() => el.remove(), duration);
  }
}

export function MidnightQueuePage({ event, durationSeconds, onReleased }: MidnightQueuePageProps) {
  const headerHidden = useHeaderScroll();
  const queue = useHypeQueue({
    eventId: event.id,
    durationSeconds,
    enabled: true,
    capacity: event.capacity,
  });

  const cardRef = useRef<HTMLDivElement>(null);

  // Track position changes for pop animation
  const prevPositionRef = useRef(queue.position);
  const [positionPop, setPositionPop] = useState(false);

  useEffect(() => {
    if (queue.position !== prevPositionRef.current && queue.position < prevPositionRef.current) {
      prevPositionRef.current = queue.position;
      setPositionPop(true);
      const t = setTimeout(() => setPositionPop(false), 250);
      return () => clearTimeout(t);
    }
    prevPositionRef.current = queue.position;
  }, [queue.position]);

  // Release celebration
  const isReleasing = queue.phase === "releasing";
  const [exitTransition, setExitTransition] = useState(false);
  const hasSpawnedParticles = useRef(false);

  // Spawn particles when releasing starts
  useEffect(() => {
    if (isReleasing && cardRef.current && !hasSpawnedParticles.current) {
      hasSpawnedParticles.current = true;
      spawnParticles(cardRef.current);
    }
  }, [isReleasing]);

  // Start exit transition 1.8s into release, then call onReleased
  useEffect(() => {
    if (!isReleasing) return;
    const exitTimer = setTimeout(() => setExitTransition(true), 1800);
    return () => clearTimeout(exitTimer);
  }, [isReleasing]);

  // Final callback after exit fade
  const handleTransitionEnd = useCallback(() => {
    if (exitTransition) {
      queue.onReleased();
      onReleased();
    }
  }, [exitTransition, queue.onReleased, onReleased]);

  useEffect(() => {
    if (queue.released) {
      queue.onReleased();
      onReleased();
    }
  }, [queue.released, queue.onReleased, onReleased]);

  const heroImage =
    event.hero_image ||
    event.cover_image ||
    `/api/media/event_${event.id}_banner`;

  const dateDisplay = (() => {
    const d = new Date(event.date_start);
    return d
      .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      .toUpperCase();
  })();

  const locationDisplay = [event.venue_name, event.city].filter(Boolean).join(", ");

  return (
    <>
      <header
        className={`header${headerHidden ? " header--hidden" : ""}`}
        id="header"
      >
        <VerifiedBanner />
        <Header />
      </header>

      <main className="relative min-h-screen bg-background overflow-hidden">
        {/* Full-viewport hero background */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-1000"
          style={{
            backgroundImage: `url(${heroImage})`,
            filter: isReleasing ? "brightness(0.6) blur(0px)" : "brightness(0.4) blur(3px)",
            transform: isReleasing ? "scale(1.02)" : "scale(1)",
          }}
        />

        {/* Vignette overlays */}
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 40%, transparent 20%, rgba(0, 0, 0, 0.7) 100%)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.65) 100%)" }} />

        {/* Content — centered card */}
        <div
          className={`relative z-10 flex flex-col items-center justify-center min-h-screen px-5 py-24 max-md:py-20 max-md:pt-[calc(var(--header-height)+32px)] transition-opacity duration-700 ${exitTransition ? "opacity-0" : "opacity-100"}`}
          onTransitionEnd={handleTransitionEnd}
        >
          <div
            ref={cardRef}
            className={`midnight-announcement-card relative w-full max-w-[460px] rounded-2xl overflow-hidden transition-all duration-700 ${isReleasing ? "midnight-queue-release" : ""}`}
          >
            {/* Inner content with padding */}
            <div className="relative z-10 p-8 max-md:p-6">
              {/* Status badge */}
              <div className="flex items-center gap-2 mb-7 max-md:mb-5">
                <span className="relative flex size-2">
                  <span
                    className="absolute inline-flex size-full rounded-full opacity-75"
                    style={{
                      backgroundColor: isReleasing ? "#34D399" : "var(--color-primary)",
                      animation: isReleasing ? "none" : "midnight-pulse 2s ease-in-out infinite",
                    }}
                  />
                  <span
                    className="relative inline-flex size-2 rounded-full"
                    style={{ backgroundColor: isReleasing ? "#34D399" : "var(--color-primary)" }}
                  />
                </span>
                <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/70 flex items-center gap-1.5">
                  {isReleasing ? (
                    <>
                      <Check className="size-3" style={{ color: "#34D399" }} />
                      You&apos;re in!
                    </>
                  ) : (
                    event.queue_title || "In Queue"
                  )}
                </span>
              </div>

              {/* Event name */}
              <h1 className="font-[family-name:var(--font-mono)] text-[clamp(1.4rem,4vw,2rem)] font-bold uppercase leading-[1.15] tracking-[0.04em] text-foreground mb-2">
                {event.name}
              </h1>

              {/* Date & venue — compact */}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mb-8 max-md:mb-6">
                <span className="font-[family-name:var(--font-sans)] text-[13px] text-foreground/50">
                  {dateDisplay}
                </span>
                {locationDisplay && (
                  <>
                    <span className="text-foreground/15">&middot;</span>
                    <span className="font-[family-name:var(--font-sans)] text-[13px] text-foreground/50">
                      {locationDisplay}
                    </span>
                  </>
                )}
              </div>

              {/* ── Position & Progress ── */}
              {isReleasing ? (
                /* Release state */
                <div className="text-center py-6 animate-in fade-in zoom-in-95 duration-500">
                  <div className="inline-flex items-center justify-center size-16 rounded-full mb-4"
                    style={{ background: "rgba(52, 211, 153, 0.1)", border: "1px solid rgba(52, 211, 153, 0.2)" }}>
                    <Ticket className="size-7" style={{ color: "#34D399" }} />
                  </div>
                  <h2 className="font-[family-name:var(--font-mono)] text-xl font-bold text-foreground mb-2">
                    Tickets are ready
                  </h2>
                  <p className="font-[family-name:var(--font-sans)] text-[13px] text-foreground/50">
                    Taking you there now...
                  </p>
                </div>
              ) : (
                /* Active queue state */
                <>
                  {/* Position counter */}
                  <div className="flex items-baseline gap-3 mb-5">
                    <span
                      className={`font-[family-name:var(--font-mono)] text-[clamp(2rem,7vw,3rem)] font-bold text-foreground tabular-nums leading-none ${positionPop ? "midnight-queue-position-pop" : ""}`}
                    >
                      {queue.position}
                    </span>
                    <span className="font-[family-name:var(--font-sans)] text-[13px] text-foreground/35">
                      {queue.position === 1 ? "person ahead" : "people ahead"}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="relative h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden mb-5">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full midnight-queue-glow"
                      style={{
                        width: `${Math.min(100, queue.progress)}%`,
                        background: `linear-gradient(90deg, color-mix(in srgb, var(--color-primary) 70%, transparent), var(--color-primary))`,
                        transition: "width 600ms cubic-bezier(0.25, 1, 0.5, 1)",
                      }}
                    />
                  </div>

                  {/* Estimated wait — single subtle line */}
                  <div className="flex items-center justify-between mb-6">
                    <span className="font-[family-name:var(--font-sans)] text-[12px] text-foreground/30">
                      Estimated wait
                    </span>
                    <span className="font-[family-name:var(--font-mono)] text-[12px] text-foreground/50 tabular-nums">
                      {queue.estimatedWait}
                    </span>
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent mb-5" />

                  {/* Status message — operational, not hype */}
                  <div className="h-5 flex items-center justify-center">
                    {queue.statusMessage && (
                      <p
                        key={queue.statusKey}
                        className="font-[family-name:var(--font-sans)] text-[12px] text-foreground/30 text-center animate-in fade-in duration-500"
                      >
                        {queue.statusMessage}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Subtitle / note below card */}
          {!isReleasing && (
            <p className="mt-5 font-[family-name:var(--font-sans)] text-[11px] text-foreground/18 tracking-wide">
              {event.queue_subtitle || "Don't refresh — you'll keep your place"}
            </p>
          )}
        </div>
      </main>

      <MidnightFooter />
    </>
  );
}
