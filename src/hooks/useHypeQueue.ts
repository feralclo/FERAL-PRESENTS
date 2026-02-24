"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

export type QueuePhase = "waiting" | "active" | "released";

interface SocialProofMessage {
  text: string;
  key: number;
}

interface AnxietyFlash {
  text: string;
  key: number;
}

export interface HypeQueueState {
  /** Current phase: waiting (not started), active (in queue), released (done) */
  phase: QueuePhase;
  /** 0-100 progress through the queue */
  progress: number;
  /** Current fake position in queue (counts down) */
  position: number;
  /** Number of people "ahead" (position - 1) */
  ahead: number;
  /** Estimated wait in seconds */
  estimatedWait: number;
  /** Current rotating social proof message */
  socialProof: SocialProofMessage | null;
  /** Current anxiety flash (brief urgency message) */
  anxietyFlash: AnxietyFlash | null;
  /** Whether the queue has been released (user can proceed) */
  released: boolean;
  /** Call to acknowledge release and transition to tickets */
  onReleased: () => void;
}

interface UseHypeQueueOptions {
  eventId: string;
  durationSeconds: number;
  enabled: boolean;
}

/** Deterministic seed from event ID for consistent starting position */
function hashEventId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Non-linear easing: fast start, slow tension, brief pauses, fast sprint */
function queueEasing(t: number): number {
  // Piecewise cubic: 0-0.2 (fast), 0.2-0.5 (slow), 0.5-0.8 (medium), 0.8-1.0 (fast)
  if (t <= 0.2) {
    // Fast initial drop — covers 0→35% of progress
    return (t / 0.2) * 0.35;
  } else if (t <= 0.5) {
    // Slow tension build — covers 35→55% (crawl)
    const local = (t - 0.2) / 0.3;
    return 0.35 + local * 0.2;
  } else if (t <= 0.8) {
    // Medium pace — covers 55→80%
    const local = (t - 0.5) / 0.3;
    return 0.55 + local * 0.25;
  } else {
    // Fast sprint to finish — covers 80→100%
    const local = (t - 0.8) / 0.2;
    return 0.8 + local * 0.2;
  }
}

const SOCIAL_PROOF_TEMPLATES = [
  (n: number) => `${n.toLocaleString()} people are waiting`,
  (n: number) => `${Math.floor(n * 0.12).toLocaleString()} people just got through`,
  () => "High demand right now",
  (n: number) => `${Math.floor(n * 0.08).toLocaleString()} tickets claimed so far`,
  () => "Tickets selling fast",
];

const ANXIETY_THRESHOLDS: { progress: number; text: string }[] = [
  { progress: 25, text: "Limited availability" },
  { progress: 55, text: "High demand detected" },
  { progress: 75, text: "Almost there..." },
];

export function useHypeQueue({ eventId, durationSeconds, enabled }: UseHypeQueueOptions): HypeQueueState {
  const passedKey = `feral_queue_passed_${eventId}`;
  const enteredKey = `feral_queue_entered_${eventId}`;

  // Check localStorage for already-passed state
  const [phase, setPhase] = useState<QueuePhase>(() => {
    if (!enabled) return "waiting";
    try {
      if (typeof window !== "undefined" && localStorage.getItem(passedKey)) {
        return "released";
      }
    } catch { /* ignore */ }
    return "active";
  });

  const [progress, setProgress] = useState(0);
  const [socialProof, setSocialProof] = useState<SocialProofMessage | null>(null);
  const [anxietyFlash, setAnxietyFlash] = useState<AnxietyFlash | null>(null);
  const firedAnxietyRef = useRef<Set<number>>(new Set());
  const socialProofIndexRef = useRef(0);
  const socialProofKeyRef = useRef(0);
  const anxietyKeyRef = useRef(0);

  // Persist entry time for refresh safety (lazy-init via useState)
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

  // Starting position seeded from event ID
  const startingPosition = useMemo(() => {
    const seed = hashEventId(eventId);
    return 1500 + (seed % 3000); // 1500-4500 range
  }, [eventId]);

  // Derive position from progress
  const position = useMemo(() => {
    if (phase === "released") return 0;
    // Add jitter based on progress for "batch" feel
    const basePosition = Math.max(1, Math.round(startingPosition * (1 - progress / 100)));
    const jitter = Math.floor(Math.sin(progress * 0.7) * 15);
    return Math.max(1, basePosition + jitter);
  }, [progress, startingPosition, phase]);

  const ahead = Math.max(0, position - 1);
  const estimatedWait = Math.max(0, Math.round(durationSeconds * (1 - progress / 100)));

  // Main timer — runs every 200ms for smooth progress
  useEffect(() => {
    if (phase !== "active" || !enabled) return;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - entryTime) / 1000;
      const rawT = Math.min(1, elapsed / durationSeconds);
      const easedProgress = Math.min(100, queueEasing(rawT) * 100);

      setProgress(easedProgress);

      if (rawT >= 1) {
        setPhase("released");
        try { localStorage.setItem(passedKey, "1"); } catch { /* ignore */ }
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [phase, enabled, entryTime, durationSeconds, passedKey]);

  // Social proof rotation — every ~8s
  useEffect(() => {
    if (phase !== "active" || !enabled) return;

    function showNext() {
      const idx = socialProofIndexRef.current % SOCIAL_PROOF_TEMPLATES.length;
      const template = SOCIAL_PROOF_TEMPLATES[idx];
      socialProofKeyRef.current += 1;
      setSocialProof({
        text: template(startingPosition),
        key: socialProofKeyRef.current,
      });
      socialProofIndexRef.current += 1;
    }

    // Show first one immediately
    showNext();
    const interval = setInterval(showNext, 8000);
    return () => clearInterval(interval);
  }, [phase, enabled, startingPosition]);

  // Anxiety flashes — at specific progress thresholds
  useEffect(() => {
    if (phase !== "active" || !enabled) return;

    for (const threshold of ANXIETY_THRESHOLDS) {
      if (progress >= threshold.progress && !firedAnxietyRef.current.has(threshold.progress)) {
        firedAnxietyRef.current.add(threshold.progress);
        anxietyKeyRef.current += 1;
        setAnxietyFlash({ text: threshold.text, key: anxietyKeyRef.current });

        // Clear after 3s
        const k = anxietyKeyRef.current;
        setTimeout(() => {
          setAnxietyFlash((prev) => (prev?.key === k ? null : prev));
        }, 3000);
      }
    }
  }, [progress, phase, enabled]);

  const onReleased = useCallback(() => {
    setPhase("released");
    try { localStorage.setItem(passedKey, "1"); } catch { /* ignore */ }
  }, [passedKey]);

  return useMemo(
    () => ({
      phase,
      progress,
      position,
      ahead,
      estimatedWait,
      socialProof,
      anxietyFlash,
      released: phase === "released",
      onReleased,
    }),
    [phase, progress, position, ahead, estimatedWait, socialProof, anxietyFlash, onReleased]
  );
}
