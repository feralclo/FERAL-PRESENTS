import type { Event } from "@/types/events";

/**
 * SEO metadata generator for event pages.
 *
 * Auto-generates optimized meta titles, descriptions, and keywords from event data.
 * Tenants can override via `seo_title` and `seo_description` fields on the event.
 *
 * Title formula (max ~60 chars):
 *   "{Event Name} — {Date} | {Venue}, {City} | {Org Name}"
 *   Falls back gracefully when fields are missing.
 *
 * Description formula (max ~160 chars):
 *   "Get tickets for {Event Name} at {Venue}, {City} on {Date}.
 *    {Tag line or truncated about_text}. Book now — {Org Name}."
 */

/** Format a date for SEO display (e.g. "Sat 14 Jun 2025") */
function formatSeoDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/** Format a date for JSON-LD (ISO 8601) */
function formatJsonLdDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toISOString();
  } catch {
    return dateStr;
  }
}

/** Truncate text to max length at word boundary, add ellipsis */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const truncated = text.substring(0, max);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > max * 0.5 ? truncated.substring(0, lastSpace) : truncated) + "...";
}

/** Strip HTML tags and excessive whitespace from a string */
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface SeoInput {
  event: Event;
  orgName: string;
  /** Artist names (from event_artists join or lineup field) */
  artistNames?: string[];
}

interface SeoOutput {
  title: string;
  description: string;
  keywords: string[];
}

/**
 * Generate SEO-optimized metadata from event data.
 * Returns auto-generated values — caller should prefer `event.seo_title` / `event.seo_description` if set.
 */
export function generateEventSeo({ event, orgName, artistNames }: SeoInput): SeoOutput {
  const date = event.date_start ? formatSeoDate(event.date_start) : "";
  const venue = event.venue_name || "";
  const city = event.city || "";
  const location = [venue, city].filter(Boolean).join(", ");

  // ── TITLE (target: 50-60 chars) ──
  // Priority: event name + date + location + org
  const titleParts: string[] = [event.name];
  if (date) titleParts.push(date);
  if (location) titleParts.push(location);

  let title = titleParts.join(" | ");
  // Append org name if there's room
  if (title.length + orgName.length + 3 <= 65) {
    title = `${title} | ${orgName}`;
  }
  // If still too long, simplify
  if (title.length > 65) {
    title = date
      ? `${truncate(event.name, 35)} | ${date}`
      : truncate(event.name, 60);
  }

  // ── DESCRIPTION (target: 140-160 chars) ──
  const descParts: string[] = [];

  // Opening: "Get tickets for {name}"
  const opening = `Get tickets for ${event.name}`;
  descParts.push(opening);

  // Location + date context
  const context: string[] = [];
  if (location) context.push(`at ${location}`);
  if (date) context.push(`on ${date}`);
  if (context.length) descParts.push(context.join(" "));

  // Join opening + context into one sentence
  let desc = descParts.join(" ") + ".";

  // Add artist names if available (great for search)
  const artists = artistNames?.filter(Boolean) || [];
  if (artists.length > 0) {
    const artistStr =
      artists.length <= 3
        ? artists.join(", ")
        : `${artists.slice(0, 3).join(", ")} & more`;
    const featuring = ` Featuring ${artistStr}.`;
    if (desc.length + featuring.length <= 160) {
      desc += featuring;
    }
  }

  // Add tag_line or truncated about_text for extra context
  const supplementary = event.tag_line || (event.about_text ? stripHtml(event.about_text) : "");
  if (supplementary && desc.length < 120) {
    const remaining = 155 - desc.length - 2; // 2 for ". "
    if (remaining > 20) {
      desc += " " + truncate(supplementary, remaining);
    }
  }

  // Final CTA
  const cta = ` Book now`;
  if (desc.length + cta.length + orgName.length + 5 <= 160) {
    desc += `${cta} — ${orgName}.`;
  } else if (desc.length + cta.length + 1 <= 160) {
    desc += `${cta}.`;
  }

  // Safety truncate
  if (desc.length > 160) {
    desc = truncate(desc, 157);
  }

  // ── KEYWORDS ──
  const keywords: string[] = [];
  keywords.push(event.name);
  if (venue) keywords.push(venue);
  if (city) keywords.push(city);
  if (event.country) keywords.push(event.country);
  keywords.push("tickets", "events");
  if (artists.length > 0) {
    keywords.push(...artists.slice(0, 5));
  }
  keywords.push("buy tickets", "live events");
  if (orgName && orgName !== "Entry") keywords.push(orgName);

  return { title, description: desc, keywords };
}

/**
 * Resolve the final SEO title — uses manual override if set, otherwise auto-generated.
 */
export function resolveEventSeoTitle(event: Event, autoTitle: string): string {
  return event.seo_title?.trim() || autoTitle;
}

/**
 * Resolve the final SEO description — uses manual override if set, otherwise auto-generated.
 */
export function resolveEventSeoDescription(event: Event, autoDesc: string): string {
  return event.seo_description?.trim() || autoDesc;
}

/**
 * Build JSON-LD structured data for an event (schema.org/Event).
 * This helps Google show rich results (event cards, date, venue, ticket info).
 */
export function buildEventJsonLd({
  event,
  orgName,
  siteUrl,
  artistNames,
}: {
  event: Event;
  orgName: string;
  siteUrl: string;
  artistNames?: string[];
}): Record<string, unknown> {
  const eventUrl = `${siteUrl}/event/${event.slug}`;
  const startDate = formatJsonLdDate(event.date_start);
  const endDate = event.date_end ? formatJsonLdDate(event.date_end) : undefined;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    startDate,
    ...(endDate ? { endDate } : {}),
    url: eventUrl,
    eventStatus: event.status === "cancelled"
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  };

  // Description
  const desc = event.description || event.about_text;
  if (desc) {
    jsonLd.description = truncate(stripHtml(desc), 300);
  }

  // Image
  if (event.cover_image || event.hero_image) {
    jsonLd.image = event.hero_image || event.cover_image;
  }

  // Location
  if (event.venue_name) {
    jsonLd.location = {
      "@type": "Place",
      name: event.venue_name,
      ...(event.venue_address || event.city
        ? {
            address: {
              "@type": "PostalAddress",
              ...(event.venue_address ? { streetAddress: event.venue_address } : {}),
              ...(event.city ? { addressLocality: event.city } : {}),
              ...(event.country ? { addressCountry: event.country } : {}),
            },
          }
        : {}),
    };
  }

  // Organizer
  jsonLd.organizer = {
    "@type": "Organization",
    name: orgName,
    url: siteUrl,
  };

  // Performers
  const artists = artistNames?.filter(Boolean) || [];
  if (artists.length > 0) {
    jsonLd.performer = artists.map((name) => ({
      "@type": "MusicGroup",
      name,
    }));
  }

  // Ticket offers
  if (event.payment_method !== "external") {
    const currency = event.currency || "GBP";
    jsonLd.offers = {
      "@type": "Offer",
      url: eventUrl,
      priceCurrency: currency,
      availability:
        event.status === "live"
          ? "https://schema.org/InStock"
          : "https://schema.org/SoldOut",
    };
  }

  // Doors open
  if (event.doors_open) {
    jsonLd.doorTime = formatJsonLdDate(event.doors_open);
  }

  return jsonLd;
}
