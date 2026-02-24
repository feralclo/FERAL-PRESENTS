"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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

/* ── Digit Roller ──
   Mechanical odometer effect. Each digit is a column of 0-9,
   translated vertically. Staggered right-to-left delays.
   Falls back to instant swap on prefers-reduced-motion. */
function DigitRoller({ value, isNearFront }: { value: number; isNearFront: boolean }) {
  const formatted = value.toLocaleString("en-GB");
  const digits = formatted.split("");

  // Stagger: rightmost digit transitions first (40ms per position from right)
  const digitIndices = digits.reduce<number[]>((acc, ch) => {
    acc.push(ch >= "0" && ch <= "9" ? acc.filter((x) => x >= 0).length : -1);
    return acc;
  }, []);
  const totalDigits = digitIndices.filter((x) => x >= 0).length;

  return (
    <span className="inline-flex items-baseline" aria-live="polite" aria-atomic="true" role="text">
      <span className="sr-only">{value.toLocaleString("en-GB")} people ahead</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        {digits.map((ch, i) => {
          if (ch < "0" || ch > "9") {
            // Static separator (comma)
            return (
              <span
                key={`sep-${i}`}
                className={`font-[family-name:var(--font-mono)] text-[clamp(2.2rem,8vw,3.5rem)] font-bold ${isNearFront ? "text-[#FBBF24]" : "text-foreground"}`}
                style={{ lineHeight: 1.15, transition: "color 500ms ease" }}
              >
                {ch}
              </span>
            );
          }
          const digit = parseInt(ch, 10);
          const digitIdx = digitIndices[i];
          const staggerDelay = (totalDigits - 1 - digitIdx) * 40;
          return (
            <span
              key={`d-${i}`}
              className="inline-block overflow-hidden text-[clamp(2.2rem,8vw,3.5rem)]"
              style={{ height: "1.15em", lineHeight: 1.15 }}
            >
              <span
                className={`inline-flex flex-col font-[family-name:var(--font-mono)] text-[clamp(2.2rem,8vw,3.5rem)] font-bold tabular-nums ${isNearFront ? "text-[#FBBF24]" : "text-foreground"}`}
                style={{
                  lineHeight: 1.15,
                  transform: `translateY(${-digit * 10}%)`,
                  transition: `transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1) ${staggerDelay}ms, color 500ms ease`,
                }}
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                  <span key={d} style={{ height: "1.15em", display: "block" }}>
                    {d}
                  </span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

/** Spawn a staggered burst of particles from the card center — varied shapes */
function spawnParticles(container: HTMLElement, wave: number) {
  const counts = [28, 16, 10];
  const count = counts[Math.min(wave, counts.length - 1)];
  const delays = [0, 200, 500];
  const delay = delays[Math.min(wave, delays.length - 1)];

  const colors = [
    "rgba(52, 211, 153, 0.9)",
    "rgba(110, 231, 183, 0.8)",
    "rgba(255, 255, 255, 0.8)",
    "rgba(167, 139, 250, 0.7)",
    "rgba(52, 211, 153, 0.6)",
  ];

  // Respect reduced motion
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  setTimeout(() => {
    for (let i = 0; i < count; i++) {
      const el = document.createElement("div");
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const distance = (wave === 0 ? 100 : 60) + Math.random() * (wave === 0 ? 140 : 80);
      const size = (wave === 0 ? 3 : 2) + Math.random() * (wave === 0 ? 5 : 3);
      const duration = 500 + Math.random() * 500;
      const color = colors[i % colors.length];

      // Shape variety: 30% circles, 40% rectangles, 30% squares
      const shapeRoll = (i * 7 + wave * 3) % 10;
      let width: string, height: string, radius: string, rotation: string;
      if (shapeRoll < 3) {
        // Circle
        width = `${size}px`;
        height = `${size}px`;
        radius = "50%";
        rotation = "";
      } else if (shapeRoll < 7) {
        // Rectangle (2:5 ratio)
        width = `${size * 0.5}px`;
        height = `${size * 1.2}px`;
        radius = "1px";
        rotation = `rotate(${Math.random() * 360}deg)`;
      } else {
        // Square
        width = `${size * 0.7}px`;
        height = `${size * 0.7}px`;
        radius = "1px";
        rotation = `rotate(${Math.random() * 45}deg)`;
      }

      el.style.cssText = `
        position: absolute;
        top: 50%; left: 50%;
        width: ${width}; height: ${height};
        border-radius: ${radius};
        background: ${color};
        pointer-events: none;
        z-index: 50;
        transform: translate(-50%, -50%) ${rotation} scale(1);
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
    eventName: event.name,
    durationSeconds,
    enabled: true,
    capacity: event.capacity,
  });

  const cardRef = useRef<HTMLDivElement>(null);

  // Track position changes for pop animation + batch pulse
  const prevPositionRef = useRef(queue.position);
  const [positionPop, setPositionPop] = useState(false);
  const [batchPulse, setBatchPulse] = useState(false);
  const [batchPulseKey, setBatchPulseKey] = useState(0);

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

      // Batch pulse on card border
      setBatchPulse(true);
      setBatchPulseKey((k) => k + 1);
      const t3 = setTimeout(() => setBatchPulse(false), 400);

      // Batch feedback — only show when meaningful batches drop
      if (dropped >= 2) {
        setBatchFeedbackKey((k) => k + 1);
        setBatchFeedback(`${dropped} people just got through`);
        const t2 = setTimeout(() => setBatchFeedback(null), 2500);
        return () => { clearTimeout(t); clearTimeout(t2); clearTimeout(t3); };
      }

      return () => { clearTimeout(t); clearTimeout(t3); };
    }
    prevPositionRef.current = queue.position;
  }, [queue.position]);

  // Release celebration — multi-stage
  const isReleasing = queue.phase === "releasing";
  const [releaseStage, setReleaseStage] = useState(0);
  const hasSpawnedParticles = useRef(false);

  useEffect(() => {
    if (!isReleasing) return;
    setReleaseStage(1);
    if (cardRef.current && !hasSpawnedParticles.current) {
      hasSpawnedParticles.current = true;
      spawnParticles(cardRef.current, 0);
      spawnParticles(cardRef.current, 1);
      spawnParticles(cardRef.current, 2);
    }
    const t1 = setTimeout(() => setReleaseStage(2), 300);
    const t2 = setTimeout(() => setReleaseStage(3), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isReleasing]);

  const handleTransitionEnd = useCallback(() => {
    if (releaseStage === 3) {
      queue.onReleased();
      onReleased();
    }
  }, [releaseStage, queue.onReleased, onReleased]);

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
  const isNearFront = queue.nearFront;

  // Card border color evolution — subtle emotional ramp based on progress
  const cardBorderStyle = useMemo(() => {
    if (isReleasing) return undefined; // release animation takes over
    const p = queue.progress;
    if (p < 25) return { borderColor: "rgba(255, 255, 255, 0.08)" };
    if (p < 75) {
      // Faint primary tint
      const t = (p - 25) / 50; // 0-1 over this range
      return { borderColor: `color-mix(in srgb, var(--color-primary) ${Math.round(4 + t * 6)}%, rgba(255, 255, 255, 0.08))` };
    }
    if (p < 95) {
      return { borderColor: `rgba(251, 191, 36, 0.12)` };
    }
    // 95-100%: pulsing amber (handled by animation)
    return { borderColor: "rgba(251, 191, 36, 0.18)" };
  }, [queue.progress, isReleasing]);

  // Background blur/brightness evolution (75-100% → coming into focus)
  const bgFilterStyle = useMemo(() => {
    if (isReleasing) return { filter: "brightness(0.55) blur(0px)", transform: "scale(1.03)" };
    const p = queue.progress;
    if (p <= 75) return { filter: "brightness(0.35) blur(4px)", transform: "scale(1)" };
    // Interpolate 75-100%: blur 4→1, brightness 0.35→0.45
    const t = (p - 75) / 25;
    const blur = 4 - t * 3;
    const brightness = 0.35 + t * 0.1;
    return { filter: `brightness(${brightness.toFixed(2)}) blur(${blur.toFixed(1)}px)`, transform: "scale(1)" };
  }, [queue.progress, isReleasing]);

  // Session ID display — truncated middle
  const sessionDisplay = useMemo(() => {
    const s = queue.sessionId;
    return `${s.slice(0, 4)}…${s.slice(-4)}`;
  }, [queue.sessionId]);

  // Joined timestamp
  const joinedDisplay = useMemo(() => {
    const d = new Date(queue.entryTime);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }, [queue.entryTime]);

  // Status message phase-based opacity
  const statusOpacity = queue.phaseLabel === "fast"
    ? "text-foreground/20"
    : queue.phaseLabel === "sprint"
      ? "text-foreground/45"
      : "text-foreground/30";

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
        {/* Full-viewport hero background — evolves with progress */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${heroImage})`,
            ...bgFilterStyle,
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
          className="relative z-10 flex flex-col items-center justify-center min-h-screen px-5 py-24 max-md:py-20 max-md:pt-[calc(var(--header-height)+32px)]"
          style={{
            opacity: releaseStage === 3 ? 0 : 1,
            transform: releaseStage === 3 ? "scale(0.97)" : "scale(1)",
            transition: "opacity 700ms ease, transform 700ms ease",
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          <div
            ref={cardRef}
            key={batchPulseKey}
            className={`midnight-announcement-card relative w-full max-w-[460px] rounded-2xl overflow-hidden transition-all duration-700 ${isReleasing ? "midnight-queue-release" : ""} ${batchPulse ? "midnight-queue-batch-pulse" : ""}`}
            style={cardBorderStyle}
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
                  {/* Position counter — animated digit roller */}
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className={positionPop ? "midnight-queue-position-pop" : ""}>
                      <DigitRoller value={queue.position} isNearFront={isNearFront} />
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
                  <div className="h-5 flex items-center justify-center" role="status">
                    {queue.statusMessage && (
                      <p
                        key={queue.statusKey}
                        className={`font-[family-name:var(--font-sans)] text-[12px] ${statusOpacity} text-center animate-in fade-in duration-500`}
                      >
                        {queue.statusMessage}
                      </p>
                    )}
                  </div>

                  {/* Session ID + joined time — authenticity signal */}
                  <div className="mt-4 text-center">
                    <span className="font-[family-name:var(--font-mono)] text-[10px] text-foreground/15 tracking-[0.1em]">
                      Session {sessionDisplay} &middot; Joined {joinedDisplay}
                    </span>
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
