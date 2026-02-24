"use client";

import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { VerifiedBanner } from "@/components/layout/VerifiedBanner";
import { MidnightFooter } from "./MidnightFooter";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";
import { useHypeQueue } from "@/hooks/useHypeQueue";
import { Check } from "lucide-react";
import type { Event, TicketTypeRow } from "@/types/events";

import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

interface MidnightQueuePageProps {
  event: Event & { ticket_types: TicketTypeRow[] };
  durationSeconds: number;
  onReleased: () => void;
}

export function MidnightQueuePage({ event, durationSeconds, onReleased }: MidnightQueuePageProps) {
  const headerHidden = useHeaderScroll();
  const queue = useHypeQueue({
    eventId: event.id,
    durationSeconds,
    enabled: true,
  });

  // Track position changes for pop animation
  const prevPositionRef = useRef(queue.position);
  const [positionPop, setPositionPop] = useState(false);

  useEffect(() => {
    if (queue.position !== prevPositionRef.current) {
      prevPositionRef.current = queue.position;
      setPositionPop(true);
      const t = setTimeout(() => setPositionPop(false), 200);
      return () => clearTimeout(t);
    }
  }, [queue.position]);

  // Release celebration → transition after 1.5s
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (queue.phase === "released" && !celebrating) {
      setCelebrating(true);
      const t = setTimeout(() => {
        queue.onReleased();
        onReleased();
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [queue.phase, celebrating, queue.onReleased, onReleased]);

  const heroImage =
    event.hero_image ||
    event.cover_image ||
    `/api/media/event_${event.id}_banner`;

  const dateDisplay = (() => {
    const d = new Date(event.date_start);
    return d
      .toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
      .toUpperCase();
  })();

  const locationDisplay = [event.venue_name, event.city]
    .filter(Boolean)
    .join(", ");

  const formatPosition = (n: number) => {
    if (n <= 0) return "#0";
    return `#${n.toLocaleString()}`;
  };

  const formatWait = (secs: number) => {
    if (secs <= 0) return "0s";
    if (secs < 60) return `${secs}s`;
    const m = Math.ceil(secs / 60);
    return `~${m}m`;
  };

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
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${heroImage})`,
            filter: "brightness(0.45) blur(2px)",
          }}
        />

        {/* Radial vignette overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 40%, transparent 20%, rgba(0, 0, 0, 0.7) 100%)",
          }}
        />

        {/* Directional gradient */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.65) 100%)",
          }}
        />

        {/* Content — centered card */}
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-5 py-24 max-md:py-20 max-md:pt-[calc(var(--header-height)+32px)]">
          <div className={`midnight-announcement-card w-full max-w-[480px] rounded-2xl p-8 max-md:p-6 transition-all duration-500 ${celebrating ? "midnight-queue-release" : ""}`}>
            {/* Queue badge */}
            <div className="flex items-center gap-2 mb-6 max-md:mb-5">
              <span className="relative flex size-2">
                <span
                  className="absolute inline-flex size-full rounded-full opacity-75"
                  style={{
                    backgroundColor: celebrating ? "#34D399" : "var(--color-primary)",
                    animation: celebrating ? "none" : "midnight-pulse 2s ease-in-out infinite",
                  }}
                />
                <span
                  className="relative inline-flex size-2 rounded-full"
                  style={{ backgroundColor: celebrating ? "#34D399" : "var(--color-primary)" }}
                />
              </span>
              <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/70 flex items-center gap-1.5">
                {celebrating ? (
                  <>
                    <Check className="size-3" style={{ color: "#34D399" }} />
                    You&apos;re in!
                  </>
                ) : (
                  event.queue_title || "You're in the queue"
                )}
              </span>
            </div>

            {/* Event name */}
            <h1 className="font-[family-name:var(--font-mono)] text-[clamp(1.5rem,4.5vw,2.25rem)] font-bold uppercase leading-[1.1] tracking-[0.04em] text-foreground mb-3 max-md:mb-2.5">
              {event.name}
            </h1>

            {/* Date & venue */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-6 max-md:mb-5">
              <span className="font-[family-name:var(--font-sans)] text-sm text-foreground/60">
                {dateDisplay}
              </span>
              {locationDisplay && (
                <>
                  <span className="text-foreground/20">&middot;</span>
                  <span className="font-[family-name:var(--font-sans)] text-sm text-foreground/60">
                    {locationDisplay}
                  </span>
                </>
              )}
            </div>

            {/* Large position counter */}
            <div className="text-center mb-6 max-md:mb-5">
              <div
                className={`font-[family-name:var(--font-mono)] text-[clamp(2.5rem,8vw,3.5rem)] font-bold text-foreground tabular-nums tracking-tight leading-none ${positionPop ? "midnight-queue-position-pop" : ""}`}
              >
                {celebrating ? (
                  <span style={{ color: "#34D399" }}>0</span>
                ) : (
                  formatPosition(queue.position)
                )}
              </div>
              <div className="font-[family-name:var(--font-sans)] text-[11px] uppercase tracking-[0.12em] text-foreground/35 mt-2">
                {celebrating ? "You're next" : "Your position"}
              </div>
            </div>

            {/* Progress bar */}
            <div className="relative h-2 rounded-full bg-foreground/[0.06] overflow-hidden mb-6 max-md:mb-5">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out midnight-queue-glow"
                style={{
                  width: `${Math.min(100, queue.progress)}%`,
                  background: celebrating
                    ? "linear-gradient(90deg, #34D399, #6EE7B7)"
                    : `linear-gradient(90deg, color-mix(in srgb, var(--color-primary) 80%, transparent), var(--color-primary))`,
                }}
              />
            </div>

            {/* Stats row — 3 columns */}
            <div className="grid grid-cols-3 gap-3 max-md:gap-2 mb-6 max-md:mb-5">
              {[
                { value: formatPosition(queue.position), label: "Position" },
                { value: queue.ahead.toLocaleString(), label: "Ahead" },
                { value: formatWait(queue.estimatedWait), label: "Est. Wait" },
              ].map(({ value, label }) => (
                <div
                  key={label}
                  className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] py-3 max-md:py-2.5 text-center"
                >
                  <div className="font-[family-name:var(--font-mono)] text-lg max-md:text-base font-bold text-foreground tabular-nums tracking-wide">
                    {value}
                  </div>
                  <div className="font-[family-name:var(--font-sans)] text-[10px] uppercase tracking-[0.12em] text-foreground/35 mt-1">
                    {label}
                  </div>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.1] to-transparent mb-5 max-md:mb-4" />

            {/* Social proof */}
            {queue.socialProof && !celebrating && (
              <p
                key={queue.socialProof.key}
                className="font-[family-name:var(--font-sans)] text-[13px] leading-relaxed text-foreground/45 text-center animate-in fade-in duration-500"
              >
                {queue.socialProof.text}
              </p>
            )}

            {/* Anxiety flash */}
            {queue.anxietyFlash && !celebrating && (
              <p
                key={queue.anxietyFlash.key}
                className="mt-3 font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-[0.12em] text-center midnight-queue-anxiety"
                style={{ color: "color-mix(in srgb, var(--color-primary) 80%, #ff4444)" }}
              >
                {queue.anxietyFlash.text}
              </p>
            )}

            {/* Release celebration message */}
            {celebrating && (
              <p className="font-[family-name:var(--font-sans)] text-[14px] text-center text-foreground/60 animate-in fade-in duration-300">
                Hang tight — taking you to tickets...
              </p>
            )}
          </div>

          {/* Privacy note */}
          <p className="mt-5 font-[family-name:var(--font-sans)] text-[11px] text-foreground/20 tracking-wide">
            {celebrating ? "" : (event.queue_subtitle || "Securing your spot — don't close this tab")}
          </p>
        </div>
      </main>

      <MidnightFooter />
    </>
  );
}
