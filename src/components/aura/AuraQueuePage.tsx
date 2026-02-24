"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useHypeQueue } from "@/hooks/useHypeQueue";
import { Check, Ticket } from "lucide-react";

interface AuraQueuePageProps {
  eventId: string;
  eventName?: string;
  durationSeconds: number;
  onReleased: () => void;
  title?: string | null;
  subtitle?: string | null;
  capacity?: number | null;
}

/** Format position with comma separators */
function formatPosition(n: number): string {
  return n.toLocaleString("en-GB");
}

/** Spawn a mini particle burst from the ticket icon on release */
function spawnReleaseParticles(container: HTMLElement) {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const count = 12;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const distance = 30 + Math.random() * 40;
    const size = 3 + Math.random() * 3;
    el.style.cssText = `
      position: absolute;
      top: 50%; left: 50%;
      width: ${size}px; height: ${size}px;
      border-radius: 50%;
      background: hsl(var(--primary));
      pointer-events: none;
      z-index: 10;
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
      transition: transform 600ms cubic-bezier(0.25, 1, 0.5, 1), opacity 600ms ease;
    `;
    container.appendChild(el);
    // Trigger the animation on the next frame
    requestAnimationFrame(() => {
      el.style.transform = `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px)) scale(0)`;
      el.style.opacity = "0";
    });
    setTimeout(() => el.remove(), 650);
  }
}

export function AuraQueuePage({ eventId, eventName, durationSeconds, onReleased, title, subtitle, capacity }: AuraQueuePageProps) {
  const queue = useHypeQueue({
    eventId,
    eventName: eventName || undefined,
    durationSeconds,
    enabled: true,
    capacity,
  });

  const isReleasing = queue.phase === "releasing";
  const [exitFade, setExitFade] = useState(false);
  const releaseIconRef = useRef<HTMLDivElement>(null);
  const hasSpawnedParticles = useRef(false);

  // Batch feedback
  const [batchFeedback, setBatchFeedback] = useState<string | null>(null);
  const [batchFeedbackKey, setBatchFeedbackKey] = useState(0);
  const [prevPosition, setPrevPosition] = useState(queue.position);

  // Position pop animation
  const [positionPop, setPositionPop] = useState(false);

  useEffect(() => {
    if (queue.position < prevPosition) {
      const dropped = prevPosition - queue.position;

      // Pop animation
      setPositionPop(true);
      const t = setTimeout(() => setPositionPop(false), 200);

      if (dropped >= 2) {
        setBatchFeedbackKey((k) => k + 1);
        setBatchFeedback(`${dropped} people just got through`);
        const t2 = setTimeout(() => setBatchFeedback(null), 2500);
        setPrevPosition(queue.position);
        return () => { clearTimeout(t); clearTimeout(t2); };
      }
      setPrevPosition(queue.position);
      return () => clearTimeout(t);
    }
    setPrevPosition(queue.position);
  }, [queue.position, prevPosition]);

  // Release particles
  useEffect(() => {
    if (isReleasing && releaseIconRef.current && !hasSpawnedParticles.current) {
      hasSpawnedParticles.current = true;
      spawnReleaseParticles(releaseIconRef.current);
    }
  }, [isReleasing]);

  // Exit transition after release celebration
  useEffect(() => {
    if (!isReleasing) return;
    const t = setTimeout(() => setExitFade(true), 2200);
    return () => clearTimeout(t);
  }, [isReleasing]);

  useEffect(() => {
    if (queue.released) {
      queue.onReleased();
      onReleased();
    }
  }, [queue.released, queue.onReleased, onReleased]);

  // Progress bar color: primary → amber (nearFront) → emerald (releasing)
  const progressIndicatorClass = isReleasing
    ? "bg-emerald-500"
    : queue.nearFront
      ? "bg-amber-500"
      : "bg-primary";

  return (
    <Card
      className={`transition-all duration-500 ${exitFade ? "opacity-0 scale-[0.98]" : ""} ${queue.nearFront && !isReleasing ? "border-amber-500/20" : ""}`}
      onTransitionEnd={() => { if (exitFade) { queue.onReleased(); onReleased(); } }}
    >
      <CardContent className="p-6 space-y-4">
        {isReleasing ? (
          /* Release celebration */
          <div className="text-center py-6 animate-in fade-in zoom-in-95 duration-500">
            <div ref={releaseIconRef} className="relative inline-flex items-center justify-center size-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-3">
              <Ticket className="size-6 text-emerald-500" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight mb-1">
              You&apos;re in!
            </h2>
            <p className="text-sm text-muted-foreground">
              Loading tickets&hellip;
            </p>
          </div>
        ) : (
          /* Active queue */
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex size-2">
                  <span
                    className="absolute inline-flex size-full rounded-full opacity-75 animate-ping"
                    style={{ backgroundColor: queue.nearFront ? "#FBBF24" : "hsl(var(--primary))" }}
                  />
                  <span
                    className="relative inline-flex size-2 rounded-full"
                    style={{ backgroundColor: queue.nearFront ? "#FBBF24" : "hsl(var(--primary))" }}
                  />
                </span>
                <h2 className="text-lg font-semibold tracking-tight">
                  {queue.nearFront ? "Almost there" : (title || "In Queue")}
                </h2>
              </div>
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {queue.estimatedWait}
              </span>
            </div>

            {/* Position — large number with pop animation */}
            <div className="flex items-baseline gap-2.5" aria-live="polite">
              <span
                className={`text-3xl font-bold tabular-nums transition-all duration-200 ${queue.nearFront ? "text-amber-500" : ""}`}
                style={{
                  transform: positionPop ? "scale(1.04)" : "scale(1)",
                  transition: "transform 200ms ease-out, color 300ms ease",
                }}
              >
                {formatPosition(queue.position)}
              </span>
              <span className="text-sm text-muted-foreground">
                {queue.position === 1 ? "person ahead" : "people ahead"}
              </span>
            </div>

            {/* Batch feedback */}
            <div className="h-4">
              {batchFeedback && (
                <p
                  key={batchFeedbackKey}
                  className="text-[11px] text-emerald-600 dark:text-emerald-400 animate-in fade-in slide-in-from-bottom-1 duration-300"
                >
                  {batchFeedback}
                </p>
              )}
            </div>

            {/* Progress bar — color transitions based on state */}
            <Progress
              value={queue.progress}
              className="h-1.5"
              indicatorClassName={`transition-colors duration-500 ${progressIndicatorClass}`}
            />

            {/* Status message */}
            <div className="h-4 flex items-center" role="status">
              {queue.statusMessage && (
                <p
                  key={queue.statusKey}
                  className="text-[12px] text-muted-foreground/60 animate-in fade-in duration-500"
                >
                  {queue.statusMessage}
                </p>
              )}
            </div>

            {/* Footer note */}
            <p className="text-[11px] text-center text-muted-foreground/50">
              {subtitle || "Don\u2019t refresh \u2014 you\u2019ll keep your place"}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
