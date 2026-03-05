import Link from "next/link";
import type { ListingEvent } from "@/types/events";

interface EventCardProps {
  event: ListingEvent;
}

const STATUS_STYLES: Record<string, string> = {
  "Selling Fast": "bg-amber-500/15 text-amber-400 border-amber-500/25",
  Limited: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  "Sold Out": "bg-red-500/15 text-red-400 border-red-500/25",
};

export function EventCard({ event }: EventCardProps) {
  const d = new Date(event.date_start);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d
    .toLocaleDateString("en-GB", { month: "short" })
    .toUpperCase();

  const isExternal = event.payment_method === "external";
  const isSoldOut = event.status_label === "Sold Out";

  const href =
    isExternal && event.external_link
      ? event.external_link
      : `/event/${event.slug}/`;

  const imageUrl =
    event.hero_image ||
    event.cover_image ||
    `/api/media/event_${event.id}_cover`;

  const linkProps = isExternal
    ? { target: "_blank" as const, rel: "noopener noreferrer" }
    : {};

  const ctaLabel = isExternal
    ? "BUY TICKETS"
    : isSoldOut
      ? "VIEW EVENT"
      : "GET TICKETS";

  return (
    <Link
      href={href}
      {...linkProps}
      className="group block relative rounded-2xl border border-[var(--card-border,#2a2a2a)]/60 bg-[var(--card-bg,#1a1a1a)]/50 overflow-hidden transition-[transform,border-color,box-shadow] duration-500 hover:-translate-y-1.5 hover:border-[var(--accent,#ff0033)]/40 hover:shadow-[0_8px_40px_color-mix(in_srgb,var(--accent)_10%,transparent),0_0_0_1px_color-mix(in_srgb,var(--accent)_12%,transparent)] motion-reduce:hover:translate-y-0"
    >
      {/* Cover image */}
      <div className="relative aspect-video overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={event.name}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105 motion-reduce:group-hover:scale-100"
        />
        {/* Bottom gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--card-bg,#1a1a1a)] via-transparent to-transparent z-[1]" />
        {/* Top vignette */}
        <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black/30 to-transparent z-[1]" />

        {/* Date badge */}
        <div className="absolute top-4 left-4 z-10 flex flex-col items-center bg-black/70 backdrop-blur-sm border border-white/[0.08] px-3 py-2 rounded-lg transition-[border-color,box-shadow] duration-300 group-hover:border-[var(--accent,#ff0033)]/30 group-hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]">
          <span className="font-[family-name:var(--font-mono)] text-[20px] font-bold leading-none tracking-[0.02em] text-white">
            {day}
          </span>
          <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.2em] text-[var(--accent,#ff0033)] mt-0.5">
            {month}
          </span>
        </div>

        {/* Status badge */}
        {event.status_label && (
          <div
            className={`absolute top-4 right-4 z-10 px-2.5 py-1 rounded-md border backdrop-blur-sm font-[family-name:var(--font-mono)] text-[9px] font-bold tracking-[0.15em] uppercase ${STATUS_STYLES[event.status_label] || "bg-white/10 text-white/60 border-white/20"}`}
          >
            {event.status_label}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5 max-[480px]:p-4">
        {/* Tag line */}
        {event.tag_line && (
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.15em] text-[var(--accent,#ff0033)] uppercase block mb-2.5">
            // {event.tag_line}
          </span>
        )}

        {/* Event name */}
        <h2 className="font-[family-name:var(--font-mono)] text-[clamp(18px,2.5vw,24px)] font-bold tracking-[0.1em] uppercase mb-4 transition-colors duration-300 group-hover:text-[var(--accent,#ff0033)] text-[var(--text-primary,#fff)]">
          {event.name.toUpperCase()}
        </h2>

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-5">
          {(event.venue_name || event.city) && (
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.08em] text-[var(--text-primary,#fff)]/45">
              {[event.venue_name, event.city].filter(Boolean).join(", ")}
            </span>
          )}
          {event.doors_time && (
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.08em] text-[var(--text-primary,#fff)]/35">
              {event.doors_time}
            </span>
          )}
          {event.age_restriction && (
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.08em] text-[var(--text-primary,#fff)]/35">
              {event.age_restriction}
            </span>
          )}
        </div>

        {/* CTA button */}
        <div
          className={`flex items-center justify-center gap-2 py-3 rounded-lg font-[family-name:var(--font-mono)] text-[11px] font-bold tracking-[0.2em] uppercase transition-all duration-300 ${
            isSoldOut
              ? "bg-[var(--text-primary,#fff)]/[0.06] text-[var(--text-primary,#fff)]/30"
              : "bg-[var(--accent,#ff0033)] text-white group-hover:brightness-110 group-hover:shadow-[0_4px_20px_color-mix(in_srgb,var(--accent)_30%,transparent)]"
          }`}
        >
          {ctaLabel}
          <span className="text-xs transition-transform duration-300 group-hover:translate-x-1">
            {isExternal ? "\u2197" : "\u2192"}
          </span>
        </div>
      </div>

      {/* Inner border glow on hover */}
      <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 transition-opacity duration-500 group-hover:opacity-100 shadow-[inset_0_0_30px_color-mix(in_srgb,var(--accent)_6%,transparent)]" />
    </Link>
  );
}
