"use client";

import { useState } from "react";
import Link from "next/link";

interface EventHeroProps {
  title: string;
  date: string;
  doors: string;
  location: string;
  age: string;
  bannerImage: string;
  coverImage?: string | null;
  tag?: string;
}

export function EventHero({
  title,
  date,
  doors,
  location,
  age,
  bannerImage,
  coverImage,
  tag = "SECOND RELEASE NOW ACTIVE",
}: EventHeroProps) {
  const imgSrc = coverImage || bannerImage;
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <section className="event-hero">
      <div className="event-hero__bg">
        {imgSrc && !imgFailed && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imgSrc}
            alt={title}
            className="event-hero__bg-img"
            onError={() => setImgFailed(true)}
          />
        )}
        <div className="event-hero__darken" />
        <div className="event-hero__noise" />
        <div className="event-hero__scanline" />
      </div>
      <div className="container">
        <div className="event-hero__content">
          <div className="event-hero__topbar">
            <div className="event-hero__meta">
              <span className="event-hero__tag">{tag}</span>
            </div>
            <Link href="/" className="event-hero__back">
              <span className="event-hero__back-arrow">&larr;</span>
              <span>Back to all events</span>
            </Link>
          </div>

          <h1 className="event-hero__title glitch" data-text={title}>
            {title}
          </h1>

          <div className="event-hero__details">
            <div className="event-hero__detail">
              <span className="event-hero__detail-label">DATE</span>
              <span className="event-hero__detail-value">{date}</span>
            </div>
            <div className="event-hero__detail">
              <span className="event-hero__detail-label">DOORS</span>
              <span className="event-hero__detail-value">{doors}</span>
            </div>
            <div className="event-hero__detail">
              <span className="event-hero__detail-label">LOCATION</span>
              <span className="event-hero__detail-value">{location}</span>
            </div>
            <div className="event-hero__detail">
              <span className="event-hero__detail-label">AGE</span>
              <span className="event-hero__detail-value">{age}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
