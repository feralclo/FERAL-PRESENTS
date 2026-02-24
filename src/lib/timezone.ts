/**
 * Timezone utilities for admin date/time handling.
 * Provides a curated timezone list, browser detection, label formatting,
 * and conversion between UTC ISO strings and timezone-local datetime values.
 */

/** Curated list of IANA timezone identifiers with global coverage */
export const TIMEZONES = [
  // Europe
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Helsinki",
  "Europe/Warsaw",
  "Europe/Prague",
  "Europe/Budapest",
  "Europe/Bucharest",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  // Americas
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "America/Santiago",
  // Asia & Middle East
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  // Oceania
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Pacific/Auckland",
] as const;

export type TimezoneId = (typeof TIMEZONES)[number] | (string & {});

/** Detect the browser's timezone using Intl API */
export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "Europe/London";
  }
}

/**
 * Format a timezone for display — e.g. "Europe/London (GMT+0)"
 * Uses Intl.DateTimeFormat to get the current UTC offset.
 */
export function formatTimezoneLabel(tz: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(new Date());
    const offsetPart = parts.find((p) => p.type === "timeZoneName");
    const offset = offsetPart?.value || "";
    // Clean up: "Europe/London" → "Europe / London"
    const display = tz.replace(/_/g, " ").replace(/\//g, " / ");
    return `${display} (${offset})`;
  } catch {
    return tz;
  }
}

/**
 * Convert a UTC ISO string to a datetime-local value (YYYY-MM-DDTHH:mm)
 * displayed in the given timezone.
 */
export function utcToTzLocal(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";

  try {
    // Format components in the target timezone
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);

    const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
    // en-CA formats dates as YYYY-MM-DD
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  } catch {
    // Fallback to browser-local conversion
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  }
}

/**
 * Convert a datetime-local value (YYYY-MM-DDTHH:mm) interpreted in the given
 * timezone back to a UTC ISO string.
 */
export function tzLocalToUtc(val: string, tz: string): string | null {
  if (!val) return null;

  try {
    // Parse the components
    const [datePart, timePart] = val.split("T");
    if (!datePart || !timePart) return null;

    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);

    // Create a date in UTC, then figure out the offset for that timezone
    // by comparing what that instant looks like in the target timezone
    // Use iterative approach: start with UTC guess, then correct
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));

    // Get what this UTC instant looks like in the target timezone
    const inTz = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(utcGuess);

    const get = (type: string) =>
      Number(inTz.find((p) => p.type === type)?.value || "0");

    const tzYear = get("year");
    const tzMonth = get("month");
    const tzDay = get("day");
    const tzHour = get("hour") === 24 ? 0 : get("hour");
    const tzMinute = get("minute");

    // Calculate the offset in minutes between what we wanted and what we got
    const wanted = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const got = new Date(Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute));
    const offsetMs = got.getTime() - wanted.getTime();

    // Adjust: the actual UTC time is our guess minus the offset
    const corrected = new Date(utcGuess.getTime() - offsetMs);
    return corrected.toISOString();
  } catch {
    // Fallback to browser-local
    return new Date(val).toISOString();
  }
}

/**
 * Get the short timezone abbreviation for display — e.g. "GMT", "EST", "CET"
 */
export function getTimezoneAbbr(tz: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || tz;
  } catch {
    return tz;
  }
}
