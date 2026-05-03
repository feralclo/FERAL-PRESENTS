import type { NextRequest } from "next/server";

/**
 * Promoter avatars and covers uploaded via the web admin's base64-into-
 * `site_settings` path (handled by `/api/media/[key]`) are stored as
 * **relative** URLs (e.g. `/api/media/feral_promoter-avatar?v=...`). Same-
 * origin web clients construct a valid URL from these without thinking;
 * iOS gets nil because `URL(string:)` requires a scheme + host.
 *
 * This helper rewrites a possibly-relative URL into an absolute one,
 * preferring the request's origin (so a custom-domain tenant gets its
 * own host back) with `NEXT_PUBLIC_SITE_URL` as a fallback when the
 * request headers don't carry a usable host.
 *
 * Pass-through:
 *   - `null` / `undefined` / empty string → null (lets the caller spread
 *     the result into a response without conditionals).
 *   - URLs already starting with `http://`, `https://`, `data:` → returned
 *     as-is. We don't touch Supabase Storage URLs, Mux URLs, etc.
 */
export function absolutizeUrl(
  url: string | null | undefined,
  request: NextRequest
): string | null {
  if (!url) return null;
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:")
  ) {
    return url;
  }
  // Schemeless absolute (`//cdn.example.com/...`) — checked before the
  // root-relative branch since both start with `/`.
  if (url.startsWith("//")) return url;
  if (url.startsWith("/")) {
    return `${originFor(request)}${url}`;
  }
  return url;
}

/**
 * Origin to prepend on relative URLs. Order:
 *   1. `host` header from the request (catches custom domains).
 *   2. `NEXT_PUBLIC_SITE_URL` env (production fallback).
 *   3. `https://entry.events` (last-ditch — should never hit in prod).
 */
function originFor(request: NextRequest): string {
  const host = request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return "https://entry.events";
}

/**
 * Convenience for the common case: rewrite a promoter object's
 * `avatar_url` and `cover_image_url`. Handles both being absent.
 */
export function absolutizePromoterUrls<
  T extends { avatar_url?: string | null; cover_image_url?: string | null },
>(promoter: T, request: NextRequest): T {
  return {
    ...promoter,
    avatar_url: absolutizeUrl(promoter.avatar_url, request),
    cover_image_url: absolutizeUrl(promoter.cover_image_url, request),
  };
}
