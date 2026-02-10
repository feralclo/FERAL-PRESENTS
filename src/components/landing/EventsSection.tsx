"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export function EventsSection() {
  const gridRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);

  // Hide swipe hint after user scrolls
  useEffect(() => {
    const grid = gridRef.current;
    const hint = hintRef.current;
    if (!grid || !hint) return;

    function onScroll() {
      if (grid!.scrollLeft > 30) {
        hint!.classList.add("events__scroll-hint--hidden");
      }
    }

    grid.addEventListener("scroll", onScroll, { passive: true });
    return () => grid.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className="events" id="events">
      <div className="container">
        <div className="section-header">
          <span className="section-header__label">[UPCOMING]</span>
          <h2 className="section-header__title">Events</h2>
          <div className="section-header__line" />
          <span className="events__count">2 Events</span>
        </div>

        <div className="events__grid" ref={gridRef}>
          {/* Event 1: Kompass Klub */}
          <Link
            href="/event/kompass-klub-7-march/"
            className="event-card"
            data-reveal=""
          >
            <div className="event-card__date-badge">
              <span className="event-card__day">07</span>
              <span className="event-card__month">MAR</span>
            </div>
            <div className="event-card__image-wrapper">
              <div className="event-card__image event-card__image--1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/kompass-klub-event-tile.jpg"
                  alt="Kompass Klub"
                  className="event-card__img"
                />
                <div className="event-card__image-overlay" />
                <div className="event-card__image-noise" />
                <div className="event-card__scanline" />
              </div>
            </div>
            <div className="event-card__content">
              <div className="event-card__meta">
                <span className="event-card__tag">
                  // SALE OPENS THU 29TH JAN 6PM
                </span>
              </div>
              <h3 className="event-card__title">KOMPASS KLUB</h3>
              <p className="event-card__details">
                <span className="event-card__detail">
                  <span className="event-card__detail-label">LOC:</span> Kompass
                  Klub, Ghent
                </span>
                <span className="event-card__detail">
                  <span className="event-card__detail-label">TIME:</span> 11PM
                  &mdash; 7AM
                </span>
              </p>
              <div className="event-card__action">
                <span className="event-card__action-text">GET TICKETS</span>
                <span className="event-card__action-arrow">&rarr;</span>
              </div>
            </div>
            <div className="event-card__border-glow" />
          </Link>

          {/* Event 2: Liverpool */}
          <Link
            href="/event/liverpool-27-march/"
            className="event-card"
            data-reveal=""
          >
            <div className="event-card__date-badge">
              <span className="event-card__day">27</span>
              <span className="event-card__month">MAR</span>
            </div>
            <div className="event-card__image-wrapper">
              <div className="event-card__image event-card__image--2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/liverpool-tile.jpg"
                  alt="Liverpool"
                  className="event-card__img"
                />
                <div className="event-card__image-overlay" />
                <div className="event-card__image-noise" />
                <div className="event-card__scanline" />
              </div>
            </div>
            <div className="event-card__content">
              <div className="event-card__meta">
                <span className="event-card__tag">// ON SALE NOW</span>
              </div>
              <h3 className="event-card__title">LIVERPOOL</h3>
              <p className="event-card__details">
                <span className="event-card__detail">
                  <span className="event-card__detail-label">LOC:</span>{" "}
                  Invisible Wind Factory, Liverpool
                </span>
                <span className="event-card__detail">
                  <span className="event-card__detail-label">TIME:</span>{" "}
                  9:30PM &mdash; 4:00AM
                </span>
              </p>
              <div className="event-card__action">
                <span className="event-card__action-text">GET TICKETS</span>
                <span className="event-card__action-arrow">&rarr;</span>
              </div>
            </div>
            <div className="event-card__border-glow" />
          </Link>
        </div>

        <div className="events__scroll-hint" ref={hintRef}>
          <span>SWIPE</span>
          <span className="events__scroll-hint-arrow">&rarr;</span>
        </div>
      </div>
    </section>
  );
}
