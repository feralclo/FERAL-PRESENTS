/**
 * Merch image normalizer — converts legacy {front, back} and new string[]
 * formats into a consistent ordered string array.
 *
 * First image = primary (shown in listings, checkout thumbnails, etc.)
 */

type LegacyImages = { front?: string; back?: string };
type MerchImages = string[] | LegacyImages | null | undefined;

/** Normalize any merch image format to an ordered string array. */
export function normalizeMerchImages(images: MerchImages): string[] {
  if (!images) return [];

  // Already an array
  if (Array.isArray(images)) {
    return images.filter((src) => typeof src === "string" && src.length > 0);
  }

  // Legacy {front, back} object
  const result: string[] = [];
  if (typeof images.front === "string" && images.front.length > 0) {
    result.push(images.front);
  }
  if (typeof images.back === "string" && images.back.length > 0) {
    result.push(images.back);
  }
  return result;
}

/** Check if merch images exist (either format). */
export function hasMerchImages(images: MerchImages): boolean {
  return normalizeMerchImages(images).length > 0;
}
