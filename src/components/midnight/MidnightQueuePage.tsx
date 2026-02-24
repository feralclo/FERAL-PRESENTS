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

/** Format position with comma separators for realism */
function formatPosition(n: number): string {
  return n.toLocaleString("en-GB");
}

/** Spawn a staggered burst of particles from the card center */
function spawnParticles(container: HTMLElement, wave: number) {
  const counts = [28, 16, 10]; // 3 waves: big burst, medium, small
  const count = counts[Math.min(wave, counts.length - 1)];
  const delays = [0, 200, 500];
  const delay = delays[Math.min(wave, delays.length - 1)];

  const colors = [
    "rgba(52, 211, 153, 0.9)",   // emerald
    "rgba(110, 231, 183, 0.8)",  // light emerald
    "rgba(255, 255, 255, 0.8)",  // white
    "rgba(167, 139, 250, 0.7)",  // violet
    "rgba(52, 211, 153, 0.6)",   // faded emerald
  ];

  setTimeout(() => {
    for (let i = 0; i < count; i++) {
      const el = document.createElement("div");
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const distance = (wave === 0 ? 100 : 60) + Math.random() * (wave === 0 ? 140 : 80);
      const size = (wave === 0 ? 3 : 2) + Math.random() * (wave === 0 ? 5 : 3);
      const duration = 500 + Math.random() * 500;

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
      setTimeout(() => el.remove(), duration + 50);
    }
  }, delay);
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

  // Batch drop feedback — show "X got through" briefly
  const [batchFeedback, setBatchFeedback] = useState<string | null>(null);
  const [batchFeedbackKey, setBatchFeedbackKey] = useState(0);

  useEffect(() => {
    if (queue.position !== prevPositionRef.current && queue.position < prevPositionRef.current) {
      const dropped = prevPositionRef.current - queue.position;
      prevPositionRef.current = queue.position;

      // Pop animation on position
      setPositionPop(true);
      const t = setTimeout(() => setPositionPop(false), 300);

      // Batch feedback — only show when meaningful batches drop
      if (dropped >= 2) {
        setBatchFeedbackKey((k) => k + 1);
        setBatchFeedback(`${dropped} people just got through`);
        const t2 = setTimeout(() => setBatchFeedback(null), 2500);
        return () => { clearTimeout(t); clearTimeout(t2); };
      }

      return () => clearTimeout(t);
    }
    prevPositionRef.current = queue.position;
  }, [queue.position]);

  // Release celebration — multi-stage
  const isReleasing = queue.phase === "releasing";
  const [releaseStage, setReleaseStage] = useState(0); // 0=none, 1=flash, 2=celebration, 3=exit
  const hasSpawnedParticles = useRef(false);

  // Multi-stage release animation
  useEffect(() => {
    if (!isReleasing) return;

    // Stage 1: Brief white flash (0ms)
    setReleaseStage(1);

    // Spawn 3 waves of particles
    if (cardRef.current && !hasSpawnedParticles.current) {
      hasSpawnedParticles.current = true;
      spawnParticles(cardRef.current, 0); // big burst
      spawnParticles(cardRef.current, 1); // medium follow-up
      spawnParticles(cardRef.current, 2); // sparkle tail
    }

    // Stage 2: Celebration content (300ms)
    const t1 = setTimeout(() => setReleaseStage(2), 300);

    // Stage 3: Exit fade (2500ms)
    const t2 = setTimeout(() => setReleaseStage(3), 2500);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isReleasing]);

  // Final callback after exit fade
  const handleTransitionEnd = useCallback(() => {
    if (releaseStage === 3) {
      queue.onReleased();
      onReleased();
    }
  }, [releaseStage, queue.onReleased, onReleased]);

  // Fallback: if released fires (e.g. from localStorage on refresh), call onReleased
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

  // Near-front state: position ≤ 5, things get intense
  const isNearFront = queue.nearFront;

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
        {/* Full-viewport hero background — transitions on release */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${heroImage})`,
            filter: isReleasing
              ? "brightness(0.55) blur(0px)"
              : "brightness(0.35) blur(4px)",
            transform: isReleasing ? "scale(1.03)" : "scale(1)",
            transition: "filter 1.2s cubic-bezier(0.16, 1, 0.3, 1), transform 1.5s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />

        {/* Vignette overlays */}
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 40%, transparent 20%, rgba(0, 0, 0, 0.7) 100%)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.65) 100%)" }} />

        {/* White flash overlay — stage 1 of release */}
        {releaseStage >= 1 && releaseStage < 3 && (
          <div
            className="absolute inset-0 z-20 pointer-events-none"
            style={{
              background: "rgba(255, 255, 255, 0.15)",
              opacity: releaseStage === 1 ? 1 : 0,
              transition: "opacity 800ms ease-out",
            }}
          />
        )}

        {/* Content — centered card */}
        <div
          className={`relative z-10 flex flex-col items-center justify-center min-h-screen px-5 py-24 max-md:py-20 max-md:pt-[calc(var(--header-height)+32px)]`}
          style={{
            opacity: releaseStage === 3 ? 0 : 1,
            transform: releaseStage === 3 ? "scale(0.97)" : "scale(1)",
            transition: "opacity 700ms ease, transform 700ms ease",
          }}
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
                      backgroundColor: isReleasing ? "#34D399" : isNearFront ? "#FBBF24" : "var(--color-primary)",
                      animation: isReleasing ? "none" : "midnight-pulse 2s ease-in-out infinite",
                    }}
                  />
                  <span
                    className="relative inline-flex size-2 rounded-full"
                    style={{ backgroundColor: isReleasing ? "#34D399" : isNearFront ? "#FBBF24" : "var(--color-primary)" }}
                  />
                </span>
                <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/70 flex items-center gap-1.5">
                  {releaseStage >= 2 ? (
                    <>
                      <Check className="size-3" style={{ color: "#34D399" }} />
                      You&apos;re in!
                    </>
                  ) : isNearFront ? (
                    "Almost there"
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
              {releaseStage >= 2 ? (
                /* Release celebration — stage 2 */
                <div className="text-center py-6 animate-in fade-in zoom-in-95 duration-500">
                  <div
                    className="inline-flex items-center justify-center size-16 rounded-full mb-4 midnight-queue-icon-glow"
                    style={{ background: "rgba(52, 211, 153, 0.12)", border: "1px solid rgba(52, 211, 153, 0.25)" }}
                  >
                    <Ticket className="size-7" style={{ color: "#34D399" }} />
                  </div>
                  <h2 className="font-[family-name:var(--font-mono)] text-xl font-bold text-foreground mb-2">
                    Tickets are ready
                  </h2>
                  <p className="font-[family-name:var(--font-sans)] text-[13px] text-foreground/50">
                    Taking you there now&hellip;
                  </p>
                </div>
              ) : (
                /* Active queue state */
                <>
                  {/* Position counter — large, prominent */}
                  <div className="flex items-baseline gap-3 mb-2">
                    <span
                      className={`font-[family-name:var(--font-mono)] text-[clamp(2.2rem,8vw,3.5rem)] font-bold tabular-nums leading-none ${positionPop ? "midnight-queue-position-pop" : ""} ${isNearFront ? "text-[#FBBF24]" : "text-foreground"}`}
                      style={{ transition: "color 500ms ease" }}
                    >
                      {formatPosition(queue.position)}
                    </span>
                    <span className="font-[family-name:var(--font-sans)] text-[13px] text-foreground/35">
                      {queue.position === 1 ? "person ahead" : "people ahead"}
                    </span>
                  </div>

                  {/* Batch feedback — "X people just got through" */}
                  <div className="h-5 mb-4">
                    {batchFeedback && (
                      <p
                        key={batchFeedbackKey}
                        className="font-[family-name:var(--font-sans)] text-[11px] text-emerald-400/70 animate-in fade-in slide-in-from-bottom-1 duration-300"
                      >
                        {batchFeedback}
                      </p>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="relative h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden mb-5">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full ${isNearFront ? "midnight-queue-glow-near" : "midnight-queue-glow"}`}
                      style={{
                        width: `${Math.min(100, queue.progress)}%`,
                        background: isNearFront
                          ? "linear-gradient(90deg, #FBBF24, #F59E0B)"
                          : `linear-gradient(90deg, color-mix(in srgb, var(--color-primary) 70%, transparent), var(--color-primary))`,
                        transition: "width 600ms cubic-bezier(0.25, 1, 0.5, 1), background 500ms ease",
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

                  {/* Status message — system-style operational text */}
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
              {event.queue_subtitle || "Don\u2019t refresh \u2014 you\u2019ll keep your place"}
            </p>
          )}
        </div>
      </main>

      <MidnightFooter />
    </>
  );
}
