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
    span.className = "word";
    span.textContent = word;
    el.appendChild(span);
    if (i < words.length - 1) {
      el.appendChild(document.createTextNode(" "));
    }
  });
  const wordEls = el.querySelectorAll(".word");
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

/**
 * About section with JS-driven pillar animations.
 * Exact port of main.js about section (lines 362-500).
 */
export function AboutSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const closerTextRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    // Pillar animations
    const pillars = section.querySelectorAll(".about__pillar");
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
              ".about__pillar-index span"
            ) as HTMLElement | null;
            const titleEl = pillar.querySelector(
              ".about__pillar-title"
            ) as HTMLElement | null;
            const textEl = pillar.querySelector(
              ".about__pillar-text"
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

    // Closer animation
    const closer = section.querySelector(".about__closer");
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

    // Scroll reveal for general data-reveal elements in this section
    const revealElements = section.querySelectorAll("[data-reveal]");
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
    );
    revealElements.forEach((el) => revealObserver.observe(el));

    return () => {
      pillarObserver.disconnect();
      revealObserver.disconnect();
    };
  }, []);

  return (
    <section className="about" id="about" ref={sectionRef}>
      <div className="container">
        <div className="about__hero" data-reveal="">
          <span className="section-header__label">[ABOUT]</span>
          <h2 className="about__title">
            <span className="about__title-line">ENERGY OF THE</span>
            <span className="about__title-line text-red">FERAL FAMILY</span>
          </h2>
        </div>

        <div className="about__pillars">
          <div className="about__pillar" data-reveal="">
            <div className="about__pillar-index">
              <span>01</span>
            </div>
            <div className="about__pillar-content">
              <h3 className="about__pillar-title">
                Curated Chaos<span className="text-red">.</span>
              </h3>
              <p className="about__pillar-text">
                We believe a night out should be an insane journey, not a
                playlist. Our lineups are meticulously crafted to break the
                mould, constructing a specific narrative that demands your full
                attention. No filler. No fluff. Just a relentless progression of
                sound.
              </p>
            </div>
            <div className="about__pillar-line" />
          </div>

          <div className="about__pillar" data-reveal="">
            <div className="about__pillar-index">
              <span>02</span>
            </div>
            <div className="about__pillar-content">
              <h3 className="about__pillar-title">
                Total Immersion<span className="text-red">.</span>
              </h3>
              <p className="about__pillar-text">
                Production is our obsession. We don&apos;t just book a venue; we
                terraform it. By hauling in our own external rigs and custom
                visual architecture, we erase the space you walked into and
                replace it with the World of Feral.
              </p>
            </div>
            <div className="about__pillar-line" />
          </div>

          <div className="about__pillar" data-reveal="">
            <div className="about__pillar-index">
              <span>03</span>
            </div>
            <div className="about__pillar-content">
              <h3 className="about__pillar-title">
                The Energy<span className="text-red">.</span>
              </h3>
              <p className="about__pillar-text">
                It&apos;s a frequency you have to feel to understand. The
                visuals warp reality, the sound hits your chest, and the Feral
                family brings an energy that doesn&apos;t exist on any other
                dancefloor.
              </p>
            </div>
            <div className="about__pillar-line" />
          </div>
        </div>

        <div className="about__closer" data-reveal="">
          <p className="about__closer-text" ref={closerTextRef}>
            If you know, you know<span className="text-red">.</span>
          </p>
        </div>
      </div>
    </section>
  );
}
