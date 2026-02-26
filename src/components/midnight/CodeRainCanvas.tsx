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

// Real code / error strings — each column picks one and types it out
const ERROR_LINES = [
  "SYSTEM_ERROR",
  "FATAL_EXCEPTION",
  "SEGMENTATION_FAULT",
  "BUFFER_OVERFLOW",
  "NULL_POINTER",
  "STACK_OVERFLOW",
  "MEMORY_LEAK",
  "ACCESS_DENIED",
  "CORE_DUMP",
  "ERR_CORRUPT",
  "PANIC",
  "DEADLOCK",
  "throw new Error()",
  "process.exit(1)",
  "return undefined",
  "catch(err)",
  "fatal: cannot",
  "ERROR 0xDEAD",
  "ERROR 0xFF0033",
  "WARN: overflow",
  "ERR_CONNECTION",
  "SIGKILL",
  "SIGSEGV",
  "exit code 1",
  ">>> BREACH",
  ">>> OVERRIDE",
  "kernel panic",
  "undefined ref",
  "ERR_TIMEOUT",
  "abort()",
  "0xDEADBEEF",
  "0xBADC0DE",
  "0xFF0033",
  "rm -rf /",
  "chmod 000",
  "PERMISSION ERR",
  "FILE_NOT_FOUND",
  "OUT_OF_MEMORY",
  "CRITICAL FAIL",
  "DATA_CORRUPT",
  "DISK_READ_ERR",
  "INVALID_STATE",
  "HEAP_OVERFLOW",
  "BUS_ERROR",
  "BROKEN_PIPE",
  "CONNECTION_RST",
  "ECONNREFUSED",
  "ENOMEM",
];

// Single chars for variety between error strings
const FILLER = "0123456789ABCDEF{}[]();:=/><|&!?_-+*#@$%";

interface ColumnState {
  text: string;
  charIndex: number;
  y: number;
  speed: number;
  gap: number; // pause between strings
}

function pickErrorLine(): string {
  return ERROR_LINES[Math.floor(Math.random() * ERROR_LINES.length)];
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
  const columnsRef = useRef<ColumnState[]>([]);
  const lastFrameRef = useRef<number>(0);
  const resolvedColorRef = useRef<string>("#ff0033");

  const resolveColor = useCallback(() => {
    if (color) return color;
    if (typeof window === "undefined") return "#ff0033";
    const el =
      document.querySelector("[data-theme='midnight']") ||
      document.documentElement;
    const accent = getComputedStyle(el).getPropertyValue("--accent").trim();
    return accent || "#ff0033";
  }, [color]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    resolvedColorRef.current = resolveColor();

    const initColumns = (w: number, h: number) => {
      const count = Math.floor(w / columnGap);
      columnsRef.current = Array.from({ length: count }, () => ({
        text: pickErrorLine(),
        charIndex: 0,
        y: Math.random() * h * 0.5,
        speed: 0.6 + Math.random() * 0.8,
        gap: 0,
      }));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      initColumns(rect.width, rect.height);
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const targetInterval = 1000 / 20; // 20fps — slightly slower for readability

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
      if (w === 0 || h === 0) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      // Trail fade — dark overlay each frame
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      ctx.fillRect(0, 0, w, h);

      ctx.font = `${fontSize}px "Space Mono", "Courier New", monospace`;
      ctx.textBaseline = "top";

      const cols = columnsRef.current;
      const c = resolvedColorRef.current;

      for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        const x = i * columnGap + 2;

        // Gap between strings — skip frames
        if (col.gap > 0) {
          col.gap--;
          continue;
        }

        // Current character to render
        const char = col.charIndex < col.text.length
          ? col.text[col.charIndex]
          : FILLER[Math.floor(Math.random() * FILLER.length)];

        // Head character — bright
        ctx.fillStyle = c;
        ctx.globalAlpha = opacity;
        ctx.fillText(char, x, col.y);

        // Dimmer trail echo 1-2 chars above
        if (col.charIndex > 0 && col.charIndex <= col.text.length) {
          const prevChar = col.text[col.charIndex - 1];
          ctx.globalAlpha = opacity * 0.4;
          ctx.fillText(prevChar, x, col.y - fontSize);
          if (col.charIndex > 1) {
            ctx.globalAlpha = opacity * 0.15;
            ctx.fillText(col.text[col.charIndex - 2], x, col.y - fontSize * 2);
          }
        }

        ctx.globalAlpha = 1;

        // Advance
        col.y += fontSize * col.speed * speed;
        col.charIndex++;

        // When string is fully typed, reset with new string
        if (col.charIndex > col.text.length + 3) {
          col.text = pickErrorLine();
          col.charIndex = 0;
          col.speed = 0.6 + Math.random() * 0.8;
          // Random gap before next string
          col.gap = Math.floor(Math.random() * 15);

          // Reset to top once past bottom
          if (col.y > h) {
            col.y = -fontSize * 2;
          }
        }

        // Wrap when past bottom
        if (col.y > h + fontSize * 4) {
          col.y = -fontSize * 2;
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    if (prefersReducedMotion) {
      // Draw a single static frame
      const rect = canvas.getBoundingClientRect();
      ctx.fillStyle = "rgba(0, 0, 0, 1)";
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.font = `${fontSize}px "Space Mono", "Courier New", monospace`;
      ctx.textBaseline = "top";
      const c = resolvedColorRef.current;
      const cols = columnsRef.current;
      for (let frame = 0; frame < 40; frame++) {
        for (let i = 0; i < cols.length; i++) {
          const col = cols[i];
          const x = i * columnGap + 2;
          const char = col.charIndex < col.text.length
            ? col.text[col.charIndex]
            : FILLER[Math.floor(Math.random() * FILLER.length)];
          ctx.fillStyle = c;
          ctx.globalAlpha = opacity * (0.05 + Math.random() * 0.3);
          ctx.fillText(char, x, col.y);
          ctx.globalAlpha = 1;
          col.y += fontSize * col.speed * speed;
          col.charIndex++;
          if (col.charIndex > col.text.length + 3) {
            col.text = pickErrorLine();
            col.charIndex = 0;
            col.speed = 0.6 + Math.random() * 0.8;
            if (col.y > rect.height) col.y = -fontSize * 2;
          }
        }
      }
      return () => observer.disconnect();
    }

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      observer.disconnect();
    };
  }, [active, fontSize, columnGap, speed, opacity, resolveColor]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
