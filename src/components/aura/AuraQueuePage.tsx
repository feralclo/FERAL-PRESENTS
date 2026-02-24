"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useHypeQueue } from "@/hooks/useHypeQueue";
import { Check, Ticket } from "lucide-react";

interface AuraQueuePageProps {
  eventId: string;
  durationSeconds: number;
  onReleased: () => void;
  title?: string | null;
  subtitle?: string | null;
  capacity?: number | null;
}

export function AuraQueuePage({ eventId, durationSeconds, onReleased, title, subtitle, capacity }: AuraQueuePageProps) {
  const queue = useHypeQueue({
    eventId,
    durationSeconds,
    enabled: true,
    capacity,
  });

  const isReleasing = queue.phase === "releasing";
  const [exitFade, setExitFade] = useState(false);

  // Exit transition after release celebration
  useEffect(() => {
    if (!isReleasing) return;
    const t = setTimeout(() => setExitFade(true), 1800);
    return () => clearTimeout(t);
  }, [isReleasing]);

  useEffect(() => {
    if (queue.released) {
      queue.onReleased();
      onReleased();
    }
  }, [queue.released, queue.onReleased, onReleased]);

  return (
    <Card className={`transition-all duration-500 ${exitFade ? "opacity-0 scale-[0.98]" : ""}`}
      onTransitionEnd={() => { if (exitFade) { queue.onReleased(); onReleased(); } }}
    >
      <CardContent className="p-6 space-y-5">
        {isReleasing ? (
          /* Release celebration */
          <div className="text-center py-4 animate-in fade-in zoom-in-95 duration-500">
            <div className="inline-flex items-center justify-center size-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-3">
              <Ticket className="size-5 text-emerald-500" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight mb-1">
              You&apos;re in!
            </h2>
            <p className="text-sm text-muted-foreground">
              Loading tickets...
            </p>
          </div>
        ) : (
          /* Active queue */
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">
                {title || "In Queue"}
              </h2>
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {queue.estimatedWait}
              </span>
            </div>

            {/* Position — large number */}
            <div className="flex items-baseline gap-2.5">
              <span className="text-3xl font-bold tabular-nums">
                {queue.position}
              </span>
              <span className="text-sm text-muted-foreground">
                {queue.position === 1 ? "person ahead" : "people ahead"}
              </span>
            </div>

            {/* Progress bar */}
            <Progress value={queue.progress} className="h-1.5" />

            {/* Status message */}
            <div className="h-4 flex items-center">
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
              {subtitle || "Don\u0027t refresh — you\u0027ll keep your place"}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
