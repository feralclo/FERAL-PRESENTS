"use client";

import { useState, useEffect } from "react";

const TOTAL_SECONDS = 482; // 8:02

/**
 * 8-minute checkout countdown timer.
 * Shows urgency and matches existing checkout timer behavior.
 */
export function CheckoutTimer() {
  const [remaining, setRemaining] = useState(TOTAL_SECONDS);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 0) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = remaining / TOTAL_SECONDS;
  const isUrgent = remaining <= 120;

  return (
    <div
      className={`checkout-timer ${isUrgent ? "checkout-timer--urgent" : ""}`}
      style={{
        background: "#1a1a1a",
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <span
          style={{
            color: isUrgent ? "#ff0033" : "#888",
            fontSize: "0.75rem",
            letterSpacing: "1px",
            fontFamily: "var(--font-space-mono), 'Space Mono', monospace",
          }}
        >
          TICKETS RESERVED FOR
        </span>
        <span
          style={{
            color: isUrgent ? "#ff0033" : "#fff",
            fontSize: "1.2rem",
            fontWeight: 700,
            fontFamily: "var(--font-space-mono), 'Space Mono', monospace",
          }}
        >
          {minutes}:{seconds.toString().padStart(2, "0")}
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: "3px",
          background: "#2a2a2a",
          borderRadius: "2px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: isUrgent ? "#ff0033" : "#ff0033",
            borderRadius: "2px",
            transition: "width 1s linear",
            boxShadow: isUrgent ? "0 0 8px rgba(255,0,51,0.5)" : "none",
          }}
        />
      </div>
    </div>
  );
}
