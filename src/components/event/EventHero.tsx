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

  return (
    <section className="event-hero">
      <div className="event-hero__bg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt={title}
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
              <span className="event-hero__tag">{tag}</span>
            </div>
            <Link href="/" className="event-hero__back">
              <span>All Events</span>
              <span className="event-hero__back-arrow">&rarr;</span>
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
