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

          <div className="event-hero__meta">
            <div className="event-hero__meta-row">
              <span className="event-hero__meta-item">
                <span className="event-hero__meta-label">Date</span>
                <span className="event-hero__meta-value">{date}</span>
              </span>
              <span className="event-hero__meta-divider" />
              <span className="event-hero__meta-item">
                <span className="event-hero__meta-label">Venue</span>
                <span className="event-hero__meta-value">{location}</span>
              </span>
            </div>
            {(doors || age) && (
              <div className="event-hero__meta-secondary">
                {doors && <span>Doors {doors}</span>}
                {doors && age && <span className="event-hero__meta-sep" />}
                {age && <span>{age}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
