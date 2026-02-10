"use client";

import { useState, useEffect } from "react";

/**
 * "Last ticket booked X minutes ago" social proof toast.
 * Matches existing tickets page toast behavior.
 * Shows after 5s, hides after 7s.
 */
export function SocialProofToast() {
  const [visible, setVisible] = useState(false);
  const [minutesAgo, setMinutesAgo] = useState(0);

  useEffect(() => {
    // Generate a random time with weighted distribution
    const weights = [
      { min: 1, max: 3, weight: 0.4 },
      { min: 3, max: 8, weight: 0.35 },
      { min: 8, max: 15, weight: 0.2 },
      { min: 15, max: 30, weight: 0.05 },
    ];

    let rand = Math.random();
    let mins = 2;
    for (const w of weights) {
      if (rand < w.weight) {
        mins = w.min + Math.floor(Math.random() * (w.max - w.min));
        break;
      }
      rand -= w.weight;
    }
    setMinutesAgo(mins);

    // Show after 5s
    const showTimer = setTimeout(() => setVisible(true), 5000);

    // Hide after 7s of being visible
    const hideTimer = setTimeout(() => setVisible(false), 12000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  const timeText =
    minutesAgo < 1
      ? "less than 60 seconds ago"
      : minutesAgo === 1
        ? "1 minute ago"
        : `${minutesAgo} minutes ago`;

  return (
    <div className={`social-proof${visible ? " social-proof--visible" : ""}`}>
      <div className="social-proof__title">
        <span className="social-proof__dot" />
        LIVE
      </div>
      <span className="social-proof__text">
        Last ticket booked <span className="social-proof__time">{timeText}</span>
      </span>
    </div>
  );
}
