"use client";

import { useEffect, useRef } from "react";

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&!";

function scrambleReveal(
  el: HTMLElement,
  finalText: string,
  duration: number,
  callback?: () => void
) {
  const startTime = Date.now();
  const len = finalText.length;
  el.style.opacity = "1";

  function tick() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    let output = "";
    for (let i = 0; i < len; i++) {
      if (finalText[i] === " ") {
        output += " ";
      } else if (i / len < progress - 0.1) {
        output += finalText[i];
      } else {
        output +=
          SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      }
    }
    el.textContent = output;
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = finalText;
      if (callback) callback();
    }
  }
  tick();
}

function wordReveal(el: HTMLElement, delayStart: number) {
  const text = el.textContent?.trim() || "";
  const words = text.split(/\s+/);
  el.innerHTML = "";
  words.forEach((word, i) => {
    const span = document.createElement("span");
    span.className = "about-word";
    span.textContent = word;
    el.appendChild(span);
    if (i < words.length - 1) {
      el.appendChild(document.createTextNode(" "));
    }
  });
  const wordEls = el.querySelectorAll(".about-word");
  wordEls.forEach((w, i) => {
    setTimeout(() => {
      w.classList.add("visible");
    }, delayStart + i * 30);
  });
}

function counterSpin(el: HTMLElement, finalNum: string, duration: number) {
  const startTime = Date.now();
  function tick() {
    const elapsed = Date.now() - startTime;
    if (elapsed < duration) {
      el.textContent = "0" + Math.floor(Math.random() * 10);
      requestAnimationFrame(tick);
    } else {
      el.textContent = finalNum;
    }
  }
  tick();
}

export function AboutSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const closerTextRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    // Pillar animations
    const pillars = section.querySelectorAll(".about-pillar");
    const pillarObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (
            entry.isIntersecting &&
            !(entry.target as HTMLElement).dataset.animated
          ) {
            (entry.target as HTMLElement).dataset.animated = "true";
            entry.target.classList.add("revealed");

            const pillar = entry.target;
            const indexSpan = pillar.querySelector(
              ".about-pillar-index span"
            ) as HTMLElement | null;
            const titleEl = pillar.querySelector(
              ".about-pillar-title"
            ) as HTMLElement | null;
            const textEl = pillar.querySelector(
              ".about-pillar-text"
            ) as HTMLElement | null;

            if (indexSpan) {
              const finalNum = indexSpan.textContent || "";
              counterSpin(indexSpan, finalNum, 400);
            }

            if (titleEl) {
              const finalTitle = titleEl.textContent || "";
              setTimeout(() => scrambleReveal(titleEl, finalTitle, 600), 200);
            }

            if (textEl) {
              wordReveal(textEl, 500);
            }

            pillarObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -40px 0px" }
    );

    pillars.forEach((p) => pillarObserver.observe(p));

    // Hero title reveal
    const heroEl = section.querySelector(".about-hero");
    if (heroEl) {
      const heroObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("revealed");
              heroObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.1 }
      );
      heroObserver.observe(heroEl);
    }

    // Closer animation
    const closer = section.querySelector(".about-closer");
    const closerText = closerTextRef.current;
    if (closer && closerText) {
      const closerFinal = closerText.textContent || "";
      closerText.textContent = "";
      const closerObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (
              entry.isIntersecting &&
              !(entry.target as HTMLElement).dataset.animated
            ) {
              (entry.target as HTMLElement).dataset.animated = "true";
              entry.target.classList.add("revealed");
              setTimeout(() => {
                scrambleReveal(closerText, closerFinal, 800, () => {
                  closerText.classList.add("anim-done");
                });
              }, 300);
              closerObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.3 }
      );
      closerObserver.observe(closer);
    }

    return () => {
      pillarObserver.disconnect();
    };
  }, []);

  return (
    <section
      id="about"
      ref={sectionRef}
      className="pb-20 max-md:pb-14 overflow-hidden bg-background"
    >
      {/* Top divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent mb-14 max-md:mb-10" />

      <div className="max-w-[1200px] mx-auto px-6 max-md:px-4">
        {/* Hero heading */}
        <div className="about-hero text-center mb-14 max-md:mb-10 opacity-0">
          <span className="about-label font-[family-name:var(--font-mono)] text-[11px] tracking-[0.25em] uppercase text-primary mb-4 block opacity-0 translate-y-3 transition-all duration-700">
            [ABOUT]
          </span>
          <h2 className="font-[family-name:var(--font-mono)] text-[clamp(32px,6vw,72px)] font-bold tracking-[clamp(3px,0.8vw,8px)] uppercase leading-[1.15] mt-5">
            <span className="about-title-line block">
              ENERGY OF THE
            </span>
            <span className="about-title-line block text-primary">
              FERAL FAMILY
            </span>
          </h2>
        </div>

        {/* Pillars */}
        <div className="flex flex-col max-w-[800px] mx-auto">
          {[
            {
              num: "01",
              title: "Curated Chaos",
              text: "We believe a night out should be an insane journey, not a playlist. Our lineups are meticulously crafted to break the mould, constructing a specific narrative that demands your full attention. No filler. No fluff. Just a relentless progression of sound.",
            },
            {
              num: "02",
              title: "Total Immersion",
              text: "Production is our obsession. We don\u2019t just book a venue; we terraform it. By hauling in our own external rigs and custom visual architecture, we erase the space you walked into and replace it with the World of Feral.",
            },
            {
              num: "03",
              title: "The Energy",
              text: "It\u2019s a frequency you have to feel to understand. The visuals warp reality, the sound hits your chest, and the Feral family brings an energy that doesn\u2019t exist on any other dancefloor.",
            },
          ].map((pillar) => (
            <div
              key={pillar.num}
              className="about-pillar flex items-start gap-8 max-md:flex-col max-md:gap-4 py-14 max-md:py-10 relative"
            >
              <div className="about-pillar-index shrink-0 w-12 h-12 max-md:w-9 max-md:h-9 flex items-center justify-center border border-primary/10 relative overflow-hidden opacity-0 scale-0">
                <span className="font-[family-name:var(--font-mono)] text-sm font-bold text-primary tracking-[0.15em] relative z-[1]">
                  {pillar.num}
                </span>
              </div>
              <div className="flex-1 overflow-hidden">
                <h3 className="about-pillar-title font-[family-name:var(--font-mono)] text-[clamp(20px,3vw,32px)] font-bold tracking-[0.1em] uppercase mb-4 leading-[1.2] opacity-0">
                  {pillar.title}
                  <span className="text-primary">.</span>
                </h3>
                <p className="about-pillar-text font-[family-name:var(--font-display)] text-[clamp(14px,1.6vw,16px)] leading-[1.9] text-foreground/50 max-w-[600px]">
                  {pillar.text}
                </p>
              </div>
              <div className="about-pillar-line absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-primary via-primary/30 to-transparent scale-x-0 origin-left" />
            </div>
          ))}
        </div>

        {/* Closer */}
        <div className="about-closer text-center mt-14 max-md:mt-10 pt-14 max-md:pt-10 relative">
          <p
            ref={closerTextRef}
            className="about-closer-text font-[family-name:var(--font-mono)] text-[clamp(22px,4vw,44px)] font-bold tracking-[clamp(4px,0.8vw,10px)] uppercase opacity-0"
          >
            If you know, you know
            <span className="text-primary">.</span>
          </p>
        </div>
      </div>
    </section>
  );
}
