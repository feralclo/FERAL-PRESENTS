"use client";

import { useMemo } from "react";

const CONFETTI_COLORS = ["#8B5CF6", "#A78BFA", "#34D399", "#F59E0B", "#38BDF8", "#F43F5E"];
const PIECE_COUNT = 20;

/**
 * Confetti burst overlay — fixed position, pointer-events-none.
 * Uses CSS custom properties for per-piece random trajectories.
 */
export function ConfettiOverlay() {
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => {
        const angle = (Math.PI * 2 * i) / PIECE_COUNT + (Math.random() - 0.5) * 0.8;
        const distance = 80 + Math.random() * 160;
        return {
          cx: `${Math.cos(angle) * distance}px`,
          cy: `${Math.sin(angle) * distance - 60}px`,
          cr: `${Math.random() * 720 - 360}deg`,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          delay: `${i * 30}ms`,
          borderRadius: i % 3 === 0 ? "50%" : "2px",
          width: `${6 + Math.random() * 6}px`,
          height: `${6 + Math.random() * 6}px`,
        };
      }),
    [],
  );

  return (
    <div className="rep-confetti-container" aria-hidden="true">
      {pieces.map((p, i) => (
        <div
          key={i}
          className="rep-confetti-piece"
          style={{
            "--cx": p.cx,
            "--cy": p.cy,
            "--cr": p.cr,
            backgroundColor: p.color,
            animationDelay: p.delay,
            borderRadius: p.borderRadius,
            width: p.width,
            height: p.height,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
