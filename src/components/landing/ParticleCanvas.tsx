"use client";

import { useRef, useEffect, useCallback } from "react";

interface Particle {
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  size: number;
  alpha: number;
  baseAlpha: number;
}

const GRID_SPACING = 40;
const PARTICLE_BASE_SIZE = 1;
const INTERACTION_RADIUS = 150;

/**
 * Interactive particle grid canvas for the hero section.
 * Exact port of main.js particle grid (lines 9-148).
 */
export function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(undefined);

  const initParticles = useCallback((width: number, height: number) => {
    const particles: Particle[] = [];
    const cols = Math.ceil(width / GRID_SPACING) + 1;
    const rows = Math.ceil(height / GRID_SPACING) + 1;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const baseAlpha = 0.15 + Math.random() * 0.1;
        particles.push({
          baseX: i * GRID_SPACING,
          baseY: j * GRID_SPACING,
          x: i * GRID_SPACING,
          y: j * GRID_SPACING,
          size: PARTICLE_BASE_SIZE,
          alpha: baseAlpha,
          baseAlpha,
        });
      }
    }
    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;

    function resize() {
      width = canvas!.width = canvas!.offsetWidth;
      height = canvas!.height = canvas!.offsetHeight;
      initParticles(width, height);
    }

    function drawParticles() {
      ctx!.clearRect(0, 0, width, height);
      const mouse = mouseRef.current;
      const particles = particlesRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const dx = mouse.x - p.baseX;
        const dy = mouse.y - p.baseY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < INTERACTION_RADIUS) {
          const force = (INTERACTION_RADIUS - dist) / INTERACTION_RADIUS;
          const angle = Math.atan2(dy, dx);
          const pushX = Math.cos(angle) * force * 20;
          const pushY = Math.sin(angle) * force * 20;

          p.x += (p.baseX - pushX - p.x) * 0.15;
          p.y += (p.baseY - pushY - p.y) * 0.15;
          p.size += (PARTICLE_BASE_SIZE + force * 2.5 - p.size) * 0.15;
          p.alpha +=
            (Math.min(1, p.baseAlpha + force * 0.8) - p.alpha) * 0.15;

          // Draw connections to nearby affected particles
          for (let j = i + 1; j < particles.length; j++) {
            const p2 = particles[j];
            const dx2 = mouse.x - p2.baseX;
            const dy2 = mouse.y - p2.baseY;
            const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

            if (dist2 < INTERACTION_RADIUS) {
              const px = p.x - p2.x;
              const py = p.y - p2.y;
              const pDist = Math.sqrt(px * px + py * py);

              if (pDist < GRID_SPACING * 1.8) {
                const lineAlpha =
                  (1 - pDist / (GRID_SPACING * 1.8)) * force * 0.3;
                ctx!.beginPath();
                ctx!.moveTo(p.x, p.y);
                ctx!.lineTo(p2.x, p2.y);
                ctx!.strokeStyle = `rgba(255, 0, 51, ${lineAlpha})`;
                ctx!.lineWidth = 0.5;
                ctx!.stroke();
              }
            }
          }
        } else {
          p.x += (p.baseX - p.x) * 0.08;
          p.y += (p.baseY - p.y) * 0.08;
          p.size += (PARTICLE_BASE_SIZE - p.size) * 0.08;
          p.alpha += (p.baseAlpha - p.alpha) * 0.08;
        }

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
        ctx!.fill();
      }
    }

    function animate() {
      drawParticles();
      animationRef.current = requestAnimationFrame(animate);
    }

    function onMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    function onMouseLeave() {
      mouseRef.current = { x: -1000, y: -1000 };
    }

    function onTouchMove(e: TouchEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouseRef.current = {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }

    function onTouchEnd() {
      mouseRef.current = { x: -1000, y: -1000 };
    }

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);
    window.addEventListener("resize", resize);

    resize();
    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("resize", resize);
    };
  }, [initParticles]);

  return <canvas className="hero__canvas" ref={canvasRef} />;
}
