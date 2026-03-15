"use client";

import { useEffect, useState } from "react";

const COLORS = ["#34D399", "#8B5CF6", "#FBBF24", "#38BDF8", "#F43F5E", "#A78BFA", "#FB923C", "#22D3EE"];

interface Particle {
  id: number;
  cx: string;
  cy: string;
  cr: string;
  color: string;
  size: number;
  shape: "square" | "circle" | "star";
  delay: number;
}

function SaleConfetti() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const p: Particle[] = Array.from({ length: 14 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 14 + (Math.random() - 0.5) * 0.6;
      const dist = 30 + Math.random() * 50;
      const shapes: ("square" | "circle" | "star")[] = ["square", "circle", "star"];
      return {
        id: i,
        cx: `${Math.cos(angle) * dist}px`,
        cy: `${Math.sin(angle) * dist - 15}px`,
        cr: `${Math.random() * 540 - 270}deg`,
        color: COLORS[i % COLORS.length],
        size: 5 + Math.random() * 7,
        shape: shapes[i % 3],
        delay: Math.random() * 80,
      };
    });
    setParticles(p);

    const cleanup = setTimeout(() => setParticles([]), 1200);
    return () => clearTimeout(cleanup);
  }, []);

  if (particles.length === 0) return null;

  return (
    <span className="pointer-events-none absolute inset-0 z-10 overflow-visible" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute left-1/2 top-1/2 dashboard-confetti"
          style={{
            "--cx": p.cx,
            "--cy": p.cy,
            "--cr": p.cr,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.shape === "circle" ? "50%" : p.shape === "star" ? "2px" : "1px",
            animationDelay: `${p.delay}ms`,
            boxShadow: `0 0 ${p.size}px ${p.color}60`,
          } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

export { SaleConfetti };
