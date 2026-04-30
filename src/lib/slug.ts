/**
 * Convert a human-readable org name to a URL-safe slug.
 * Lowercase, replace non-alphanumeric with hyphens, trim, 3-40 chars.
 *
 * Pure function — kept in its own module so client components can import
 * it without dragging in server-only Supabase code from signup.ts.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
