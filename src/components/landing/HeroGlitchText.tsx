"use client";

import { useRef, useEffect } from "react";

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*<>/\\|=-_";

interface HeroGlitchTextProps {
  line1: string;
  line2: string;
}

/**
 * Scramble-reveal hero text animation with periodic glitch bursts.
 * Exact port of main.js hero text logic (lines 151-275).
 */
export function HeroGlitchText({ line1, line2 }: HeroGlitchTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const line1Ref = useRef<HTMLSpanElement>(null);
  const line2Ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const lines = [line1Ref.current, line2Ref.current].filter(Boolean) as HTMLSpanElement[];
    const lineTexts = [line1, line2];

    // Blank lines initially
    lines.forEach((line) => (line.textContent = ""));

    let glitchTimer: ReturnType<typeof setTimeout> | null = null;
    let glitchInterval: ReturnType<typeof setInterval> | null = null;

    function scrambleRevealLines() {
      const resolved: boolean[][] = lineTexts.map(() => []);
      let frameCount = 0;

      // Fire strobe flash
      if (flashRef.current) {
        flashRef.current.classList.add("hero-glitch__flash--active");
        setTimeout(() => {
          flashRef.current?.classList.remove("hero-glitch__flash--active");
        }, 700);
      }

      function tick() {
        let allDone = true;

        for (let li = 0; li < lines.length; li++) {
          const text = lineTexts[li];
          let output = "";

          for (let i = 0; i < text.length; i++) {
            if (resolved[li][i]) {
              output += text[i];
            } else if (text[i] === " ") {
              resolved[li][i] = true;
              output += " ";
            } else {
              allDone = false;
              const stagger = li * 12;
              if (
                frameCount > i * 2 + 6 + stagger &&
                Math.random() < 0.35
              ) {
                resolved[li][i] = true;
                output += text[i];
              } else {
                output +=
                  SCRAMBLE_CHARS[
                    Math.floor(Math.random() * SCRAMBLE_CHARS.length)
                  ];
              }
            }
          }
          lines[li].textContent = output;
        }

        frameCount++;

        if (!allDone) {
          requestAnimationFrame(tick);
        } else {
          lines.forEach((line, i) => (line.textContent = lineTexts[i]));
          startPeriodicGlitch();
        }
      }

      tick();
    }

    function startPeriodicGlitch() {
      function doGlitch() {
        let burstCount = 0;
        const maxBursts = 4 + Math.floor(Math.random() * 5);
        containerRef.current?.classList.add("hero-glitch--active");

        glitchInterval = setInterval(() => {
          if (burstCount >= maxBursts) {
            lines.forEach((line, i) => (line.textContent = lineTexts[i]));
            containerRef.current?.classList.remove("hero-glitch--active");
            if (glitchInterval) clearInterval(glitchInterval);
            return;
          }

          for (let li = 0; li < lines.length; li++) {
            const text = lineTexts[li];
            let glitched = "";
            for (let i = 0; i < text.length; i++) {
              if (Math.random() < 0.2) {
                glitched +=
                  SCRAMBLE_CHARS[
                    Math.floor(Math.random() * SCRAMBLE_CHARS.length)
                  ];
              } else {
                glitched += text[i];
              }
            }
            lines[li].textContent = glitched;
          }
          burstCount++;
        }, 50);
      }

      function scheduleNext() {
        const delay = 3000 + Math.random() * 5000;
        glitchTimer = setTimeout(() => {
          doGlitch();
          scheduleNext();
        }, delay);
      }
      scheduleNext();
    }

    // Kick off after delay
    const initTimer = setTimeout(scrambleRevealLines, 600);

    return () => {
      clearTimeout(initTimer);
      if (glitchTimer) clearTimeout(glitchTimer);
      if (glitchInterval) clearInterval(glitchInterval);
    };
  }, [line1, line2]);

  return (
    <div className="relative flex items-center justify-center opacity-0 translate-y-10 animate-[heroReveal_1s_cubic-bezier(0.16,1,0.3,1)_0.3s_forwards]">
      <div
        className="hero-glitch relative flex flex-col items-center gap-0 font-[family-name:var(--font-mono)] text-[clamp(36px,9vw,100px)] font-bold tracking-[clamp(4px,1vw,12px)] leading-[1.1] uppercase text-white"
        ref={containerRef}
        data-text={`${line1} ${line2}`}
        aria-label={`${line1} ${line2}`}
      >
        <span
          className="hero-glitch__line block relative"
          ref={line1Ref}
          data-text={line1}
        >
          {line1}
        </span>
        <span
          className="hero-glitch__line block relative"
          ref={line2Ref}
          data-text={line2}
        >
          {line2}
        </span>
      </div>
      {/* Scanning line through text */}
      <div className="hero-glitch__scanline absolute top-0 -left-[10%] w-[120%] h-[3px] opacity-70 pointer-events-none z-10" />
      {/* Flash overlay for strobe entrance */}
      <div className="hero-glitch__flash fixed top-0 left-0 w-screen h-screen bg-white opacity-0 pointer-events-none z-[9999]" ref={flashRef} />
    </div>
  );
}
