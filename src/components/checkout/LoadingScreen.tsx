"use client";

import { useState, useEffect } from "react";

const STEPS = [
  { label: "Preparing...", progress: 10 },
  { label: "Loading payment system...", progress: 25 },
  { label: "Initialising...", progress: 40 },
  { label: "Adding tickets...", progress: 60 },
  { label: "Securing...", progress: 95 },
];

/**
 * Loading interstitial with animated progress bar.
 * Matches existing checkout loading screen behavior.
 */
export function LoadingScreen() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = STEPS.map((_, i) =>
      setTimeout(() => setStep(i), i * 800)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const current = STEPS[step] || STEPS[STEPS.length - 1];

  return (
    <div
      style={{
        background: "#0e0e0e",
        padding: "40px 20px",
        textAlign: "center",
        borderRadius: "8px",
        marginBottom: "1rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "300px",
          height: "4px",
          background: "#1a1a1a",
          borderRadius: "2px",
          margin: "0 auto 16px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${current.progress}%`,
            height: "100%",
            background: "#ff0033",
            borderRadius: "2px",
            transition: "width 0.6s ease",
          }}
        />
      </div>
      <p
        style={{
          color: "#888",
          fontSize: "0.8rem",
          fontFamily: "var(--font-space-mono), 'Space Mono', monospace",
          letterSpacing: "1px",
        }}
      >
        {current.label}
      </p>
    </div>
  );
}
