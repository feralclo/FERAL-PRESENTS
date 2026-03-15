"use client";

import { useEffect, useState } from "react";

const COLORS = ["#34D399", "#8B5CF6", "#FBBF24", "#38BDF8", "#F43F5E", "#A78BFA"];

interface Particle {
  id: number;
  cx: string;
  cy: string;
  cr: string;
  color: string;
  size: number;
  shape: "square" | "circle";
}

function SaleConfetti() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const p: Particle[] = Array.from({ length: 8 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 8 + (Math.random() - 0.5) * 0.5;
      const dist = 20 + Math.random() * 30;
      return {
        id: i,
        cx: `${Math.cos(angle) * dist}px`,
        cy: `${Math.sin(angle) * dist - 10}px`,
        cr: `${Math.random() * 360}deg`,
        color: COLORS[i % COLORS.length],
        size: 3 + Math.random() * 3,
        shape: Math.random() > 0.5 ? "square" : "circle",
      };
    });
    setParticles(p);

    const cleanup = setTimeout(() => setParticles([]), 700);
    return () => clearTimeout(cleanup);
  }, []);

  if (particles.length === 0) return null;

  return (
    <span className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">
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
            borderRadius: p.shape === "circle" ? "50%" : "1px",
          } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

export { SaleConfetti };
