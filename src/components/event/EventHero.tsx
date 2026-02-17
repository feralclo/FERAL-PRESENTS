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
            alt=""
            className={`event-hero__img${imgLoaded ? " loaded" : ""}`}
            onError={() => setImgFailed(true)}
            onLoad={() => setImgLoaded(true)}
          />
        )}
        <div className="event-hero__overlay" />
      </div>

      <div className="event-hero__content">
        {tag && (
          <div className="event-hero__tag">
            <span className="event-hero__tag-dot" />
            {tag}
          </div>
        )}

        <h1 className="event-hero__title">{title}</h1>

        <div className="event-hero__meta">
          <span>{date}</span>
          <span className="event-hero__meta-dot" />
          <span>{location}</span>
        </div>

        {(doors || age) && (
          <div className="event-hero__sub">
            {doors && <span>Doors {doors}</span>}
            {doors && age && <span className="event-hero__sub-dot">&middot;</span>}
            {age && <span>{age}</span>}
          </div>
        )}
      </div>

      <div className="event-hero__scroll">
        <div className="event-hero__scroll-line" />
      </div>
    </section>
  );
}
