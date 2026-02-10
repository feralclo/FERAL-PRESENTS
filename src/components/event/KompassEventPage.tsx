"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";

// Countdown target: Thursday 29 January 2026, 6PM CET (UTC+1)
const TARGET = new Date("2026-01-29T17:00:00Z").getTime();

/**
 * Kompass Klub event page — simpler event with countdown timer + external tickets.
 * Matches existing /event/kompass-klub-7-march/index.html.
 */
export function KompassEventPage() {
  const [timeLeft, setTimeLeft] = useState(() => calculateTimeLeft(TARGET));
  const [expired, setExpired] = useState(() => Date.now() >= TARGET);
  const headerHidden = useHeaderScroll();

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (now >= TARGET) {
        setExpired(true);
        clearInterval(interval);
      } else {
        setTimeLeft(calculateTimeLeft(TARGET));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleBuyTickets = useCallback(() => {
    window.open(
      "https://shop.paylogic.com/8e3489c94b1d4d4f8fe835a832129d35",
      "_blank"
    );
  }, []);

  return (
    <>
      <header className={`header${headerHidden ? " header--hidden" : ""}`} id="header">
        <div className="announcement-banner">
          <span className="announcement-banner__shield">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"
                fill="#fff"
              />
              <path
                d="M10 15.5l-3.5-3.5 1.41-1.41L10 12.67l5.59-5.59L17 8.5l-7 7z"
                fill="#ff0033"
              />
            </svg>
          </span>
          <span className="announcement-banner__verified">
            Official FERAL ticket store
          </span>
        </div>
        <Header />
      </header>

      <main className="event-page" id="eventPage">
        <section className="event-hero">
          <div className="event-hero__bg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/kompass-event-banner.jpg"
              alt="KOMPASS KLUB"
              className="event-hero__bg-img"
            />
            <div
              className="event-hero__darken"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                background: "rgba(0, 0, 0, 0.4)",
                zIndex: 1,
              }}
            />
            <div className="event-hero__noise" />
            <div className="event-hero__scanline" />
          </div>
          <div className="container">
            <div className="event-hero__content">
              <div className="event-hero__topbar">
                <div className="event-hero__meta">
                  <span className="event-hero__tag">
                    {expired
                      ? "TICKETS ON SALE NOW"
                      : "SALE OPENS THU 29TH JAN 6PM CET"}
                  </span>
                </div>
                <a href="/" className="event-hero__back">
                  <span>All Events</span>
                  <span className="event-hero__back-arrow">&rarr;</span>
                </a>
              </div>

              <h1
                className="event-hero__title glitch"
                data-text="KOMPASS KLUB"
              >
                KOMPASS KLUB
              </h1>

              <div className="event-hero__details">
                <div className="event-hero__detail">
                  <span className="event-hero__detail-label">DATE</span>
                  <span className="event-hero__detail-value">
                    7 MARCH 2026
                  </span>
                </div>
                <div className="event-hero__detail">
                  <span className="event-hero__detail-label">DOORS</span>
                  <span className="event-hero__detail-value">
                    11PM &mdash; 7AM
                  </span>
                </div>
                <div className="event-hero__detail">
                  <span className="event-hero__detail-label">LOCATION</span>
                  <span className="event-hero__detail-value">
                    Kompass Klub, Ghent
                  </span>
                </div>
                <div className="event-hero__detail">
                  <span className="event-hero__detail-label">AGE</span>
                  <span className="event-hero__detail-value">18+</span>
                </div>
              </div>

              {/* Countdown or Buy Button */}
              <div style={{ marginTop: "2rem", textAlign: "center" }}>
                {expired ? (
                  <button
                    className="btn btn--primary"
                    onClick={handleBuyTickets}
                    style={{
                      fontSize: "1.1rem",
                      padding: "16px 40px",
                      letterSpacing: "2px",
                    }}
                  >
                    BUY TICKETS NOW
                  </button>
                ) : (
                  <div className="countdown" style={{ display: "flex", justifyContent: "center", gap: "16px" }}>
                    <CountdownUnit value={timeLeft.days} label="DAYS" />
                    <span className="countdown__colon" style={{ fontSize: "2rem", color: "#ff0033", lineHeight: "2.5rem" }}>:</span>
                    <CountdownUnit value={timeLeft.hours} label="HRS" />
                    <span className="countdown__colon" style={{ fontSize: "2rem", color: "#ff0033", lineHeight: "2.5rem" }}>:</span>
                    <CountdownUnit value={timeLeft.minutes} label="MIN" />
                    <span className="countdown__colon" style={{ fontSize: "2rem", color: "#ff0033", lineHeight: "2.5rem" }}>:</span>
                    <CountdownUnit value={timeLeft.seconds} label="SEC" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer__inner">
            <span className="footer__copy">
              &copy; 2026 FERAL PRESENTS. ALL RIGHTS RESERVED.
            </span>
            <span className="footer__status">
              STATUS: <span className="text-red">ONLINE</span>
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontSize: "2.5rem",
          fontWeight: 700,
          fontFamily: "var(--font-space-mono), 'Space Mono', monospace",
          color: "#fff",
          textShadow: "0 0 10px rgba(255, 0, 51, 0.5)",
          lineHeight: 1,
        }}
      >
        {String(value).padStart(2, "0")}
      </div>
      <div
        style={{
          fontSize: "0.65rem",
          color: "#888",
          letterSpacing: "2px",
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function calculateTimeLeft(target: number) {
  const diff = Math.max(0, target - Date.now());
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}
