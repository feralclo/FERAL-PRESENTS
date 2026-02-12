"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { useHeaderScroll } from "@/hooks/useHeaderScroll";

// Countdown target: Thursday 29 January 2026, 6PM CET (UTC+1)
const TARGET = new Date("2026-01-29T17:00:00Z").getTime();

/**
 * Kompass Klub event page — matches /event/kompass-klub-7-march/index.html exactly.
 * Has countdown timer for ticket sale + external Paylogic tickets.
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
      {/* Navigation */}
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
        {/* Event Hero */}
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
            <div className="event-hero__scanline" />
          </div>
          <div className="container">
            <div className="event-hero__content">
              <a href="/" className="event-hero__back">
                <span className="event-hero__back-arrow">&larr;</span>
                <span>Back to all events</span>
              </a>

              <div className="event-hero__meta">
                <span className="event-hero__tag">
                  {expired
                    ? "TICKETS ON SALE NOW"
                    : "SALE OPENS THU 29TH JAN 6PM"}
                </span>
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
            </div>
          </div>
        </section>

        {/* Event Content */}
        <section className="event-content">
          <div className="container">
            <div className="event-content__grid">
              {/* Left: Event Info */}
              <div className="event-info" id="eventInfo">
                <div className="event-info__section event-info__section--about">
                  <h2 className="event-info__heading">About</h2>
                  <p className="event-info__text">
                    We&apos;re gearing up for a rousing debut by{" "}
                    <a href="https://www.instagram.com/onlynumbers_uju/" target="_blank" rel="noopener noreferrer">@onlynumbers_uju</a>
                    {" "}&amp;{" "}
                    <a href="https://www.instagram.com/vladimircauchemar/" target="_blank" rel="noopener noreferrer">@vladimircauchemar</a>
                    {" "}- backed up by stronghold{" "}
                    <a href="https://www.instagram.com/basswell/" target="_blank" rel="noopener noreferrer">@basswell</a>
                    {" "}and the grittiest of local selectors to keep the pressure high.
                  </p>
                </div>

                <div className="event-info__section event-info__section--lineup">
                  <h2 className="event-info__heading">Lineup</h2>
                  <div className="event-info__lineup">
                    {[
                      "BASSWELL",
                      "ONLYNUMBERS",
                      "VLADIMIR CAUCHEMAR",
                      "JANE MUSS",
                      "VECNA",
                      "SANDY KLETZ",
                    ].map((artist) => (
                      <div className="event-info__artist" key={artist}>
                        <span className="event-info__artist-name">
                          {artist}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="event-info__section event-info__section--details">
                  <h2 className="event-info__heading">Details</h2>
                  <p className="event-info__text">
                    This is an 18+ event. Valid photo ID required at the door. No
                    re-entry. The venue operates a zero-tolerance policy.
                    Accessibility info available on request.
                  </p>
                </div>
              </div>

              {/* Right: Ticket Widget */}
              <aside className="event-tickets" id="tickets">
                <div className="event-tickets__box">
                  <h3 className="event-tickets__heading">
                    Get Tickets<span className="text-red">_</span>
                  </h3>

                  <div className={`countdown${expired ? " countdown--expired" : ""}`} id="countdown">
                    <p className="countdown__label">
                      {expired ? "TICKETS ARE LIVE!" : "SALE GOES LIVE IN"}
                    </p>
                    <div className="countdown__timer">
                      <div className="countdown__unit">
                        <span className="countdown__number">
                          {String(timeLeft.days).padStart(2, "0")}
                        </span>
                        <span className="countdown__text">DAYS</span>
                      </div>
                      <div className="countdown__separator">:</div>
                      <div className="countdown__unit">
                        <span className="countdown__number">
                          {String(timeLeft.hours).padStart(2, "0")}
                        </span>
                        <span className="countdown__text">HRS</span>
                      </div>
                      <div className="countdown__separator">:</div>
                      <div className="countdown__unit">
                        <span className="countdown__number">
                          {String(timeLeft.minutes).padStart(2, "0")}
                        </span>
                        <span className="countdown__text">MIN</span>
                      </div>
                      <div className="countdown__separator">:</div>
                      <div className="countdown__unit">
                        <span className="countdown__number">
                          {String(timeLeft.seconds).padStart(2, "0")}
                        </span>
                        <span className="countdown__text">SEC</span>
                      </div>
                    </div>
                    <p className="countdown__date">THU 29 JAN &mdash; 6PM CET</p>
                    <div className="countdown__pulse" />
                  </div>

                  {expired && (
                    <a
                      href="https://shop.paylogic.com/8e3489c94b1d4d4f8fe835a832129d35"
                      className="btn btn--primary event-tickets__cta"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        e.preventDefault();
                        handleBuyTickets();
                      }}
                    >
                      BUY TICKETS NOW
                    </a>
                  )}
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
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

function calculateTimeLeft(target: number) {
  const diff = Math.max(0, target - Date.now());
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}
