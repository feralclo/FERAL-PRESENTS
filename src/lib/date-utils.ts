/**
 * Date conversion helpers for datetime-local inputs.
 * Extracted from the event editor for reuse across admin pages.
 */

/** Convert an ISO string to a datetime-local input value (YYYY-MM-DDTHH:mm) */
export function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

/** Convert a datetime-local input value back to an ISO string */
export function fromDatetimeLocal(val: string): string | null {
  if (!val) return null;
  return new Date(val).toISOString();
}
