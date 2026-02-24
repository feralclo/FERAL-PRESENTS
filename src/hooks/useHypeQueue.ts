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
  /** How many people moved in the last batch (for "X got through" feedback) */
  lastBatchSize: number;
  /** Whether we're in the "nearly there" zone (position ≤ 5) */
  nearFront: boolean;
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

interface BatchEntry {
  time: number;
  position: number;
  batchSize: number;
}

/** Pre-generate the batch schedule so it's deterministic and refresh-safe */
function generateBatchSchedule(
  startingPosition: number,
  durationMs: number,
  seed: number,
): BatchEntry[] {
  const rand = seededRandom(seed);
  const schedule: BatchEntry[] = [];
  let pos = startingPosition;
  let t = 0;

  // Generate batches that cover ~92% of duration, leaving 8% for final sprint to 0
  const targetDuration = durationMs * 0.92;

  // First batch happens quickly — no awkward frozen start
  const firstPause = 400 + rand() * 400; // 400-800ms
  t += firstPause;
  const firstBatchSize = Math.max(1, Math.floor(pos * 0.02 + rand() * pos * 0.04));
  pos = Math.max(1, pos - firstBatchSize);
  schedule.push({ time: t, position: pos, batchSize: firstBatchSize });

  while (pos > 1 && t < targetDuration) {
    const progressRatio = t / targetDuration;
    let pauseMin: number, pauseMax: number;

    if (progressRatio < 0.25) {
      // Fast start — things are moving, excitement builds
      pauseMin = 1200; pauseMax = 2800;
    } else if (progressRatio < 0.5) {
      // Slow tension — the middle drags, doubt creeps in
      pauseMin = 2800; pauseMax = 5500;
    } else if (progressRatio < 0.75) {
      // Building again — hope returns
      pauseMin = 1800; pauseMax = 4000;
    } else {
      // Sprint to the end — rapid drops, adrenaline
      pauseMin = 600; pauseMax = 1800;
    }

    const pause = pauseMin + rand() * (pauseMax - pauseMin);
    t += pause;

    // Batch size: relative to remaining position, with more variation
    const remaining = pos;
    let batchMin: number, batchMax: number;

    if (progressRatio < 0.25) {
      // Bigger early batches — queue is moving fast
      batchMin = Math.max(1, Math.floor(remaining * 0.05));
      batchMax = Math.max(3, Math.floor(remaining * 0.15));
    } else if (progressRatio < 0.5) {
      // Smaller batches — slower, more tension
      batchMin = Math.max(1, Math.floor(remaining * 0.02));
      batchMax = Math.max(2, Math.floor(remaining * 0.08));
    } else if (progressRatio < 0.75) {
      // Medium batches — picking up
      batchMin = Math.max(1, Math.floor(remaining * 0.04));
      batchMax = Math.max(2, Math.floor(remaining * 0.12));
    } else {
      // Final sprint — fast drops
      batchMin = Math.max(1, Math.floor(remaining * 0.08));
      batchMax = Math.max(2, Math.floor(remaining * 0.25));
    }

    const batchSize = Math.floor(batchMin + rand() * (batchMax - batchMin));
    const newPos = Math.max(1, pos - batchSize);
    const actualBatch = pos - newPos;
    pos = newPos;
    schedule.push({ time: t, position: pos, batchSize: actualBatch });
  }

  // Final entry: position 0 at the end
  schedule.push({ time: durationMs, position: 0, batchSize: pos });

  return schedule;
}

// Context-aware status messages — rotate through these, they feel like real system messages
const STATUS_MESSAGES_EARLY = [
  "Connecting to ticket server",
  "Verifying session",
  "Processing requests ahead of you",
  "Allocating your session",
];

const STATUS_MESSAGES_MID = [
  "Processing requests ahead of you",
  "Verifying ticket availability",
  "Your position is being held",
  "Server load is high — hang tight",
  "Validating access",
];

const STATUS_MESSAGES_LATE = [
  "Almost through",
  "Preparing your access",
  "Securing your spot",
  "Nearly there — stay on this page",
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
  const [lastBatchSize, setLastBatchSize] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusKey, setStatusKey] = useState(0);
  const statusIndexRef = useRef(0);
  const prevScheduleIndexRef = useRef(-1);

  // Derive progress from position
  const progress = startingPosition > 0
    ? Math.min(100, ((startingPosition - position) / startingPosition) * 100)
    : 100;

  const nearFront = position > 0 && position <= 5;

  // Fuzzy estimated wait — intentionally vague like real queues
  const estimatedWait = useMemo(() => {
    if (phase === "releasing" || phase === "released") return "";
    const elapsed = Date.now() - entryTime;
    const remaining = Math.max(0, durationMs - elapsed);
    const secs = Math.round(remaining / 1000);
    if (secs <= 5) return "a few seconds";
    if (secs < 20) return "less than 30 seconds";
    if (secs < 45) return "less than a minute";
    if (secs < 90) return "about a minute";
    return `~${Math.ceil(secs / 60)} min`;
  }, [phase, durationMs, entryTime, position]); // position dep forces re-eval on batch ticks

  // Main timer — check batch schedule every 500ms
  useEffect(() => {
    if (phase !== "active" || !enabled) return;

    // Find current schedule index based on elapsed time
    const findCurrentIndex = (elapsed: number) => {
      let idx = -1;
      for (let i = 0; i < schedule.length; i++) {
        if (elapsed >= schedule[i].time) {
          idx = i;
        } else {
          break;
        }
      }
      return idx;
    };

    // Set initial caught-up position
    const initialElapsed = Date.now() - entryTime;
    const initialIdx = findCurrentIndex(initialElapsed);
    if (initialIdx >= 0) {
      const entry = schedule[initialIdx];
      if (entry.position <= 0) {
        setPosition(0);
        setPhase("releasing");
        return;
      }
      setPosition(entry.position);
      prevScheduleIndexRef.current = initialIdx;
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - entryTime;
      const currentIdx = findCurrentIndex(elapsed);

      if (currentIdx > prevScheduleIndexRef.current && currentIdx >= 0) {
        const entry = schedule[currentIdx];
        setPosition(entry.position);
        setLastBatchSize(entry.batchSize);
        prevScheduleIndexRef.current = currentIdx;

        if (entry.position <= 0 || elapsed >= durationMs) {
          setPosition(0);
          setPhase("releasing");
          clearInterval(interval);
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [phase, enabled, entryTime, durationMs, startingPosition, schedule]);

  // Status message rotation — context-aware based on progress
  useEffect(() => {
    if (phase !== "active" || !enabled) return;

    function showNext() {
      const elapsed = Date.now() - entryTime;
      const progressRatio = elapsed / durationMs;

      // Pick from the right pool based on where we are
      let pool: string[];
      if (progressRatio < 0.25) {
        pool = STATUS_MESSAGES_EARLY;
      } else if (progressRatio < 0.7) {
        pool = STATUS_MESSAGES_MID;
      } else {
        pool = STATUS_MESSAGES_LATE;
      }

      const idx = statusIndexRef.current % pool.length;
      statusIndexRef.current += 1;
      setStatusKey((k) => k + 1);
      setStatusMessage(pool[idx]);
    }

    // First message after 2.5s
    const firstTimeout = setTimeout(showNext, 2500);
    // Subsequent messages every 5-7s (varies to feel less robotic)
    const interval = setInterval(showNext, 5500);
    return () => { clearTimeout(firstTimeout); clearInterval(interval); };
  }, [phase, enabled, durationMs, entryTime]);

  // "Releasing" phase — marks localStorage, pauses for celebration, then released
  useEffect(() => {
    if (phase !== "releasing") return;
    try { localStorage.setItem(passedKey, "1"); } catch { /* ignore */ }
    const t = setTimeout(() => setPhase("released"), 3200);
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
      lastBatchSize,
      nearFront,
    }),
    [phase, progress, position, estimatedWait, statusMessage, statusKey, onReleased, lastBatchSize, nearFront],
  );
}
