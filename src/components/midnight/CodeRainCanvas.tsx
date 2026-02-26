"use client";

import { useRef, useEffect, useCallback } from "react";

interface CodeRainCanvasProps {
  className?: string;
  color?: string;
  fontSize?: number;
  columnGap?: number;
  speed?: number;
  opacity?: number;
  active?: boolean;
}

// Cyberpunk-flavored character sets
const WORDS = [
  "SYSTEM_ERROR",
  "OVERRIDE",
  "BREACH",
  "0xDEAD",
  "0xFF0033",
  "CORRUPT",
  "NULL_PTR",
  "FATAL",
  "0xBEEF",
  "VOID",
  "HACK",
  "ROOT",
];

// Katakana-style + hex chars for filler
const CHARS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF";

function getRandomChar(): string {
  // 30% chance of a word fragment, 70% single char
  if (Math.random() < 0.3) {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    // Return a single char from the word
    return word[Math.floor(Math.random() * word.length)];
  }
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

export function CodeRainCanvas({
  className = "",
  color,
  fontSize = 14,
  columnGap = 20,
  speed = 1,
  opacity = 0.6,
  active = true,
}: CodeRainCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const dropsRef = useRef<number[]>([]);
  const lastFrameRef = useRef<number>(0);
  const resolvedColorRef = useRef<string>("#ff0033");

  // Resolve color from CSS var or prop
  const resolveColor = useCallback(() => {
    if (color) return color;
    if (typeof window === "undefined") return "#ff0033";
    const el = document.querySelector("[data-theme='midnight']") || document.documentElement;
    const accent = getComputedStyle(el).getPropertyValue("--accent").trim();
    return accent || "#ff0033";
  }, [color]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Check reduced motion
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    resolvedColorRef.current = resolveColor();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      // Initialize drops
      const columns = Math.floor(rect.width / columnGap);
      dropsRef.current = Array.from({ length: columns }, () =>
        Math.random() * (rect.height / fontSize)
      );
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const targetInterval = 1000 / 24; // 24fps

    const draw = (timestamp: number) => {
      if (!active) return;

      const elapsed = timestamp - lastFrameRef.current;
      if (elapsed < targetInterval) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }
      lastFrameRef.current = timestamp;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      // Semi-transparent dark rect for trail fade
      ctx.fillStyle = `rgba(8, 8, 12, 0.12)`;
      ctx.fillRect(0, 0, w, h);

      ctx.font = `${fontSize}px "Space Mono", monospace`;

      const drops = dropsRef.current;
      const c = resolvedColorRef.current;

      for (let i = 0; i < drops.length; i++) {
        const char = getRandomChar();
        const x = i * columnGap;
        const y = drops[i] * fontSize;

        // Head character — bright
        ctx.fillStyle = c;
        ctx.globalAlpha = opacity;
        ctx.fillText(char, x, y);

        // Trail chars fade
        if (Math.random() > 0.7) {
          const trailChar = getRandomChar();
          const trailY = y - fontSize * (1 + Math.floor(Math.random() * 3));
          ctx.globalAlpha = opacity * 0.3;
          ctx.fillText(trailChar, x, trailY);
        }

        ctx.globalAlpha = 1;

        // Reset drop when it passes bottom + random threshold
        if (y > h && Math.random() > 0.975) {
          drops[i] = 0;
        }

        drops[i] += speed;
      }
    };

    // Reduced motion: draw a single static frame
    if (prefersReducedMotion) {
      // Fill black
      const rect = canvas.getBoundingClientRect();
      ctx.fillStyle = "rgba(8, 8, 12, 1)";
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.font = `${fontSize}px "Space Mono", monospace`;
      const c = resolvedColorRef.current;

      const drops = dropsRef.current;
      // Draw several "frames" worth of chars statically
      for (let frame = 0; frame < 30; frame++) {
        for (let i = 0; i < drops.length; i++) {
          const char = getRandomChar();
          const x = i * columnGap;
          const y = drops[i] * fontSize;

          ctx.fillStyle = c;
          ctx.globalAlpha = opacity * (0.1 + Math.random() * 0.4);
          ctx.fillText(char, x, y);
          ctx.globalAlpha = 1;

          if (y > rect.height && Math.random() > 0.9) {
            drops[i] = 0;
          }
          drops[i] += speed;
        }
      }
      return () => observer.disconnect();
    }

    if (active) {
      animRef.current = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(animRef.current);
      observer.disconnect();
    };
  }, [active, fontSize, columnGap, speed, opacity, resolveColor]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
