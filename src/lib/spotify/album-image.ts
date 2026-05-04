/**
 * Album-image variant picker — extracted from client.ts so unit tests
 * can import it without pulling in client.ts's node:crypto dependency
 * (used by the embed-playlist synthetic-snapshot hash). Vite externalises
 * node:crypto in jsdom, which breaks any test file that imports
 * client.ts at runtime.
 */

/** Target width in px for picker cards + story art. iOS picker cells
 *  render at ~132pt × 3x retina ≈ 400px max, so 300px is the right
 *  visual fit — 640 was wasted bandwidth (5× the payload, ~50–80KB vs
 *  ~10–15KB). 300 is also Spotify's standard medium variant so it's
 *  almost always served when available. */
const ALBUM_IMAGE_TARGET_WIDTH = 300;

export function pickBestAlbumImage(
  images?: { url?: string; width?: number }[]
): string | null {
  if (!images || images.length === 0) return null;
  const usable = images.filter((i) => typeof i.url === "string" && i.url);
  if (usable.length === 0) return null;

  // Prefer the smallest variant whose width meets the target. Spotify
  // typically returns [640, 300, 64] but the set varies by album, so
  // we don't hard-code positions.
  const atOrAbove = usable
    .filter((i) => (i.width ?? 0) >= ALBUM_IMAGE_TARGET_WIDTH)
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  if (atOrAbove.length > 0) return atOrAbove[0].url ?? null;

  // No image meets the target (rare — some indie/promo albums only
  // have small or only-large variants). Fall back to the largest
  // available so we degrade up rather than down.
  const byLargest = [...usable].sort(
    (a, b) => (b.width ?? 0) - (a.width ?? 0)
  );
  return byLargest[0].url ?? null;
}
