"use client";

import { useState } from "react";

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
  tag,
}: EventHeroProps) {
  const imgSrc = coverImage || bannerImage;
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <section className="event-hero">
      <div className="event-hero__bg">
        {imgSrc && !imgFailed && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imgSrc}
            alt={title}
            className={`event-hero__bg-img${imgLoaded ? " event-hero__bg-img--loaded" : ""}`}
            onError={() => setImgFailed(true)}
            onLoad={() => setImgLoaded(true)}
          />
        )}
        <div className="event-hero__gradient" />
      </div>
      <div className="container">
        <div className="event-hero__content">
          {tag && (
            <div className="event-hero__badge">
              <span className="event-hero__badge-dot" />
              <span className="event-hero__badge-text">{tag}</span>
            </div>
          )}

          <h1 className="event-hero__title">{title}</h1>

          <div className="event-hero__details">
            <span className="event-hero__detail-value">{date}</span>
            {doors && (
              <>
                <span className="event-hero__detail-divider" />
                <span className="event-hero__detail-value">{doors}</span>
              </>
            )}
            <span className="event-hero__detail-divider" />
            <span className="event-hero__detail-value">{location}</span>
            <span className="event-hero__detail-divider" />
            <span className="event-hero__detail-value">{age}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
