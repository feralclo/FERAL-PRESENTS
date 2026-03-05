import Link from "next/link";
import type { ListingEvent } from "@/types/events";

interface EventCardProps {
  event: ListingEvent;
}

const STATUS_STYLES: Record<string, string> = {
  "Selling Fast": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Limited: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Sold Out": "bg-red-500/20 text-red-400 border-red-500/30",
};

function formatCurrency(amount: number, currency: string): string {
  const sym =
    currency === "GBP" ? "\u00A3" : currency === "EUR" ? "\u20AC" : "$";
  // Prices stored in smallest unit (pence/cents)
  const value = amount / 100;
  return `${sym}${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

export function EventCard({ event }: EventCardProps) {
  const d = new Date(event.date_start);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d
    .toLocaleDateString("en-GB", { month: "short" })
    .toUpperCase();

  const isExternal = event.payment_method === "external";
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

  // Truncate about text for preview
  const aboutPreview = event.about_text
    ? event.about_text.length > 100
      ? event.about_text.slice(0, 100).trimEnd() + "\u2026"
      : event.about_text
    : null;

  const isSoldOut = event.status_label === "Sold Out";

  return (
    <Link
      href={href}
      {...linkProps}
      className="group block relative rounded-2xl border border-[var(--card-border,#2a2a2a)]/60 bg-[var(--card-bg,#1a1a1a)]/50 overflow-hidden transition-[transform,border-color,box-shadow] duration-500 hover:-translate-y-1.5 hover:border-[var(--accent,#ff0033)]/40 hover:shadow-[0_8px_40px_color-mix(in_srgb,var(--accent)_10%,transparent),0_0_0_1px_color-mix(in_srgb,var(--accent)_12%,transparent)] motion-reduce:hover:translate-y-0"
      data-reveal=""
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
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-dark,#0e0e0e)] via-transparent to-transparent z-[1]" />
        {/* Top vignette */}
        <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black/30 to-transparent z-[1]" />

        {/* Date badge */}
        <div className="absolute top-4 left-4 z-10 flex flex-col items-center bg-[var(--bg-dark,#0e0e0e)]/95 border border-[var(--text-primary,#fff)]/[0.10] px-3.5 py-2.5 rounded-lg transition-[border-color,box-shadow] duration-300 group-hover:border-[var(--accent,#ff0033)]/30 group-hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]">
          <span className="font-[family-name:var(--font-mono)] text-[22px] font-bold leading-none tracking-[0.02em] text-[var(--text-primary,#fff)]">
            {day}
          </span>
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.15em] text-[var(--accent,#ff0033)] mt-0.5">
            {month}
          </span>
        </div>

        {/* Status badge */}
        {event.status_label && (
          <div
            className={`absolute top-4 right-4 z-10 px-3 py-1.5 rounded-md border font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.15em] uppercase ${STATUS_STYLES[event.status_label] || "bg-white/10 text-white/60 border-white/20"}`}
          >
            {event.status_label}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-6 max-[480px]:p-4">
        {/* Tag line */}
        {event.tag_line && (
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.15em] text-[var(--accent,#ff0033)] uppercase block mb-3">
            // {event.tag_line}
          </span>
        )}

        {/* Event name */}
        <h2 className="font-[family-name:var(--font-mono)] text-[clamp(20px,3vw,28px)] font-bold tracking-[0.12em] uppercase mb-3 transition-colors duration-300 group-hover:text-[var(--accent,#ff0033)] text-[var(--text-primary,#fff)]">
          {event.name.toUpperCase()}
        </h2>

        {/* Accent line */}
        <div className="w-8 h-0.5 bg-[var(--accent,#ff0033)]/40 mb-4" />

        {/* Meta info */}
        <div className="flex flex-col gap-1.5 mb-4">
          {(event.venue_name || event.city) && (
            <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.08em] text-[var(--text-primary,#fff)]/50">
              <span className="text-[var(--text-primary,#fff)]/25 mr-1">LOC:</span>
              {[event.venue_name, event.city].filter(Boolean).join(", ")}
            </span>
          )}
          {event.doors_time && (
            <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.08em] text-[var(--text-primary,#fff)]/50">
              <span className="text-[var(--text-primary,#fff)]/25 mr-1">DOORS:</span>
              {event.doors_time}
            </span>
          )}
          {event.age_restriction && (
            <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.08em] text-[var(--text-primary,#fff)]/50">
              <span className="text-[var(--text-primary,#fff)]/25 mr-1">AGE:</span>
              {event.age_restriction}
            </span>
          )}
        </div>

        {/* About preview */}
        {aboutPreview && (
          <p className="font-[family-name:var(--font-sans)] text-[13px] leading-relaxed text-[var(--text-primary,#fff)]/35 mb-5 line-clamp-2">
            {aboutPreview}
          </p>
        )}

        {/* Action row — glass treatment */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 -mx-1 rounded-xl bg-[var(--text-primary,#fff)]/[0.03] border border-[var(--text-primary,#fff)]/[0.06] min-h-[48px]">
          {event.min_price != null && !isSoldOut ? (
            <span className="font-[family-name:var(--font-mono)] text-[12px] tracking-[0.08em] text-[var(--text-primary,#fff)]/50">
              From {formatCurrency(event.min_price, event.currency)}
            </span>
          ) : isSoldOut ? (
            <span className="font-[family-name:var(--font-mono)] text-[12px] tracking-[0.08em] text-[var(--text-primary,#fff)]/30">
              Sold Out
            </span>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-2 font-[family-name:var(--font-mono)] text-[11px] font-bold tracking-[0.15em] uppercase transition-colors duration-300 group-hover:text-[var(--accent,#ff0033)] text-[var(--text-primary,#fff)]/80">
            {isExternal ? "BUY TICKETS" : isSoldOut ? "VIEW EVENT" : "GET TICKETS"}
            <span className="text-sm transition-transform duration-300 group-hover:translate-x-1.5">
              {isExternal ? "\u2197" : "\u2192"}
            </span>
          </span>
        </div>
      </div>

      {/* Inner border glow on hover */}
      <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 transition-opacity duration-500 group-hover:opacity-100 shadow-[inset_0_0_30px_color-mix(in_srgb,var(--accent)_6%,transparent)]" />
    </Link>
  );
}
