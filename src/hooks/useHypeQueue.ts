"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

export type QueuePhase = "active" | "releasing" | "released";

export interface HypeQueueState {
  phase: QueuePhase;
  /** 0-100 progress through the queue */
  progress: number;
  /** Current position in queue (counts down in batches) */
  position: number;
  /** Fuzzy estimated wait string */
  estimatedWait: string;
  /** Current status line (subtle, believable) */
  statusMessage: string | null;
  /** Key for animating status message transitions */
  statusKey: number;
  /** Whether the queue is done */
  released: boolean;
  /** Marks queue as complete in localStorage */
  onReleased: () => void;
}

interface UseHypeQueueOptions {
  eventId: string;
  durationSeconds: number;
  enabled: boolean;
  /** Event capacity — used to derive realistic starting position */
  capacity?: number | null;
}

/** Deterministic seed from event ID */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Seeded pseudo-random (deterministic per seed) */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Pre-generate the batch schedule so it's deterministic and refresh-safe */
function generateBatchSchedule(
  startingPosition: number,
  durationMs: number,
  seed: number,
): { time: number; position: number }[] {
  const rand = seededRandom(seed);
  const schedule: { time: number; position: number }[] = [];
  let pos = startingPosition;
  let t = 0;

  // Generate batches that cover ~95% of duration, leaving last 5% for the final sprint
  const targetDuration = durationMs * 0.92;

  while (pos > 1 && t < targetDuration) {
    // Batch pause: 1.5-4s early on, 2-6s in the middle, 1-2s near the end
    const progressRatio = t / targetDuration;
    let pauseMin: number, pauseMax: number;
    if (progressRatio < 0.3) {
      pauseMin = 1500; pauseMax = 3500;
    } else if (progressRatio < 0.7) {
      pauseMin = 2500; pauseMax = 5500; // Tension — slow middle
    } else {
      pauseMin = 800; pauseMax = 2000; // Sprint at the end
    }
    const pause = pauseMin + rand() * (pauseMax - pauseMin);
    t += pause;

    // Batch size: relative to remaining position
    const remaining = pos;
    const batchMin = Math.max(1, Math.floor(remaining * 0.03));
    const batchMax = Math.max(2, Math.floor(remaining * 0.12));
    const batchSize = Math.floor(batchMin + rand() * (batchMax - batchMin));

    pos = Math.max(1, pos - batchSize);
    schedule.push({ time: t, position: pos });
  }

  // Final entry: position 0 at the end
  schedule.push({ time: durationMs, position: 0 });

  return schedule;
}

const STATUS_MESSAGES = [
  "Processing requests ahead of you",
  "Verifying ticket availability",
  "Allocating your session",
  "Almost through the queue",
  "Securing your spot",
];

export function useHypeQueue({ eventId, durationSeconds, enabled, capacity }: UseHypeQueueOptions): HypeQueueState {
  const passedKey = `feral_queue_passed_${eventId}`;
  const enteredKey = `feral_queue_entered_${eventId}`;
  const durationMs = durationSeconds * 1000;

  // Check localStorage for already-passed state
  const [phase, setPhase] = useState<QueuePhase>(() => {
    if (!enabled) return "released";
    try {
      if (typeof window !== "undefined" && localStorage.getItem(passedKey)) return "released";
    } catch { /* ignore */ }
    return "active";
  });

  // Persist entry time for refresh safety
  const [entryTime] = useState(() => {
    if (typeof window === "undefined") return Date.now();
    try {
      const stored = localStorage.getItem(enteredKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed)) return parsed;
      }
    } catch { /* ignore */ }
    const now = Date.now();
    try { localStorage.setItem(enteredKey, String(now)); } catch { /* ignore */ }
    return now;
  });

  // Derive realistic starting position from capacity
  const seed = useMemo(() => hashId(eventId), [eventId]);
  const startingPosition = useMemo(() => {
    const rand = seededRandom(seed);
    const cap = capacity && capacity > 0 ? capacity : 300;
    // Start at 25-60% of capacity — feels like you joined a real queue
    const ratio = 0.25 + rand() * 0.35;
    return Math.max(8, Math.round(cap * ratio));
  }, [seed, capacity]);

  // Pre-generate batch schedule (deterministic — same on refresh)
  const schedule = useMemo(
    () => generateBatchSchedule(startingPosition, durationMs, seed),
    [startingPosition, durationMs, seed],
  );

  const [position, setPosition] = useState(startingPosition);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusKey, setStatusKey] = useState(0);
  const statusIndexRef = useRef(0);

  // Derive progress from position
  const progress = startingPosition > 0
    ? Math.min(100, ((startingPosition - position) / startingPosition) * 100)
    : 100;

  // Fuzzy estimated wait
  const estimatedWait = useMemo(() => {
    if (phase === "releasing" || phase === "released") return "";
    const elapsed = Date.now() - entryTime;
    const remaining = Math.max(0, durationMs - elapsed);
    const secs = Math.round(remaining / 1000);
    if (secs <= 5) return "a few seconds";
    if (secs < 30) return "less than 30 seconds";
    if (secs < 60) return "less than a minute";
    return `~${Math.ceil(secs / 60)} min`;
  }, [phase, durationMs, entryTime, position]); // position dep forces re-eval on batch ticks

  // Main timer — check batch schedule every 500ms
  useEffect(() => {
    if (phase !== "active" || !enabled) return;

    // On mount, catch up to current position (for refresh mid-queue)
    const catchUp = () => {
      const elapsed = Date.now() - entryTime;
      let currentPos = startingPosition;
      for (const batch of schedule) {
        if (elapsed >= batch.time) {
          currentPos = batch.position;
        } else {
          break;
        }
      }
      return currentPos;
    };

    // Set initial caught-up position
    const initialPos = catchUp();
    if (initialPos <= 0) {
      setPosition(0);
      setPhase("releasing");
      return;
    }
    setPosition(initialPos);

    const interval = setInterval(() => {
      const elapsed = Date.now() - entryTime;
      let currentPos = startingPosition;
      for (const batch of schedule) {
        if (elapsed >= batch.time) {
          currentPos = batch.position;
        } else {
          break;
        }
      }
      setPosition(currentPos);

      if (currentPos <= 0 || elapsed >= durationMs) {
        setPosition(0);
        setPhase("releasing");
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [phase, enabled, entryTime, durationMs, startingPosition, schedule]);

  // Status message rotation — every ~6s, subtle operational messages
  useEffect(() => {
    if (phase !== "active" || !enabled) return;

    function showNext() {
      const idx = statusIndexRef.current % STATUS_MESSAGES.length;
      statusIndexRef.current += 1;
      setStatusKey((k) => k + 1);
      setStatusMessage(STATUS_MESSAGES[idx]);
    }

    // First message after 2s (don't overwhelm on load)
    const firstTimeout = setTimeout(showNext, 2000);
    const interval = setInterval(showNext, 6000);
    return () => { clearTimeout(firstTimeout); clearInterval(interval); };
  }, [phase, enabled]);

  // "Releasing" phase — marks localStorage, pauses 2.5s for celebration, then released
  useEffect(() => {
    if (phase !== "releasing") return;
    try { localStorage.setItem(passedKey, "1"); } catch { /* ignore */ }
    const t = setTimeout(() => setPhase("released"), 2500);
    return () => clearTimeout(t);
  }, [phase, passedKey]);

  const onReleased = useCallback(() => {
    setPhase("released");
    try { localStorage.setItem(passedKey, "1"); } catch { /* ignore */ }
  }, [passedKey]);

  return useMemo(
    () => ({
      phase,
      progress,
      position,
      estimatedWait,
      statusMessage,
      statusKey,
      released: phase === "released",
      onReleased,
    }),
    [phase, progress, position, estimatedWait, statusMessage, statusKey, onReleased],
  );
}
