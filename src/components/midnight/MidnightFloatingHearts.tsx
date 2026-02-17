"use client";

/**
 * Floating hearts animation for Valentine tier tickets.
 * 5 heart spans with staggered delays — keyframes defined in midnight-effects.css.
 */

const HEARTS = [
  { left: "8%", delay: "0s", duration: "7s", size: "12px" },
  { left: "25%", delay: "1.5s", duration: "5.5s", size: "15px" },
  { left: "50%", delay: "3s", duration: "6.5s", size: "13px" },
  { left: "72%", delay: "2s", duration: "5s", size: "11px" },
  { left: "90%", delay: "4s", duration: "7.5s", size: "14px" },
];

export function MidnightFloatingHearts() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {HEARTS.map((h, i) => (
        <span
          key={i}
          className="absolute bottom-[-20px] opacity-0"
          style={{
            left: h.left,
            fontSize: h.size,
            animation: `floatHeart ${h.duration} ease-in infinite`,
            animationDelay: h.delay,
            filter: "drop-shadow(0 0 3px rgba(232, 54, 93, 0.4))",
          }}
        >
          {"\u2665"}
        </span>
      ))}
    </div>
  );
}
