"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useHypeQueue } from "@/hooks/useHypeQueue";
import { Check } from "lucide-react";

interface AuraQueuePageProps {
  eventId: string;
  durationSeconds: number;
  onReleased: () => void;
  title?: string | null;
  subtitle?: string | null;
}

export function AuraQueuePage({ eventId, durationSeconds, onReleased, title, subtitle }: AuraQueuePageProps) {
  const queue = useHypeQueue({
    eventId,
    durationSeconds,
    enabled: true,
  });

  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (queue.phase === "released" && !celebrating) {
      setCelebrating(true);
      const t = setTimeout(() => {
        queue.onReleased();
        onReleased();
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [queue.phase, celebrating, queue.onReleased, onReleased]);

  const formatWait = (secs: number) => {
    if (secs <= 0) return "0s";
    if (secs < 60) return `${secs}s`;
    return `~${Math.ceil(secs / 60)}m`;
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            {celebrating ? "You're in!" : (title || "You're in the queue")}
          </h2>
          <Badge
            variant={celebrating ? "default" : "secondary"}
            className={celebrating ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/20" : ""}
          >
            {celebrating ? (
              <span className="flex items-center gap-1">
                <Check className="size-3" />
                Ready
              </span>
            ) : (
              `#${queue.position.toLocaleString()}`
            )}
          </Badge>
        </div>

        {/* Progress bar */}
        <Progress
          value={queue.progress}
          className="h-2"
        />

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: `#${queue.position.toLocaleString()}`, label: "Position" },
            { value: queue.ahead.toLocaleString(), label: "Ahead" },
            { value: formatWait(queue.estimatedWait), label: "Est. Wait" },
          ].map(({ value, label }) => (
            <div
              key={label}
              className="rounded-lg bg-muted/50 py-3 text-center"
            >
              <div className="text-base font-bold tabular-nums">{value}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Social proof */}
        {queue.socialProof && !celebrating && (
          <p
            key={queue.socialProof.key}
            className="text-sm text-muted-foreground text-center animate-in fade-in duration-500"
          >
            {queue.socialProof.text}
          </p>
        )}

        {/* Anxiety flash */}
        {queue.anxietyFlash && !celebrating && (
          <p
            key={queue.anxietyFlash.key}
            className="text-xs font-medium text-center text-orange-500 animate-in fade-in duration-300"
          >
            {queue.anxietyFlash.text}
          </p>
        )}

        {/* Celebrating */}
        {celebrating && (
          <p className="text-sm text-center text-muted-foreground animate-in fade-in duration-300">
            Taking you to tickets...
          </p>
        )}

        {/* Footer note */}
        {!celebrating && (
          <p className="text-[11px] text-center text-muted-foreground/60">
            {subtitle || "Don\u0027t close this tab"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
