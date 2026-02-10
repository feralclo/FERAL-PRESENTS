"use client";

import { useRef, useEffect } from "react";

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*<>/\\|=-_";

/**
 * Scramble-reveal hero text animation with periodic glitch bursts.
 * Exact port of main.js hero text logic (lines 151-275).
 */
export function HeroGlitchText() {
  const containerRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const line1Ref = useRef<HTMLSpanElement>(null);
  const line2Ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const lines = [line1Ref.current, line2Ref.current].filter(Boolean) as HTMLSpanElement[];
    const lineTexts = ["BORN ON THE", "DANCE FLOOR"];

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
  }, []);

  return (
    <div className="hero__tagline-wrapper">
      <div
        className="hero-glitch"
        ref={containerRef}
        data-text="BORN ON THE DANCE FLOOR"
        aria-label="BORN ON THE DANCE FLOOR"
      >
        <span
          className="hero-glitch__line"
          ref={line1Ref}
          data-text="BORN ON THE"
        >
          BORN ON THE
        </span>
        <span
          className="hero-glitch__line"
          ref={line2Ref}
          data-text="DANCE FLOOR"
        >
          DANCE FLOOR
        </span>
      </div>
      <div className="hero-glitch__scanline" />
      <div className="hero-glitch__flash" ref={flashRef} />
    </div>
  );
}
