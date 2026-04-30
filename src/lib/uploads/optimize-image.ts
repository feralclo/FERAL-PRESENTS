import sharp from "sharp";

/**
 * Server-side image optimisation for tenant-media uploads.
 *
 * What it does:
 *   1. Honour EXIF orientation (then strip the tag — clients render
 *      consistently and we save bytes).
 *   2. Resize to fit 1200×1600 (3:4 ceiling, never upscale).
 *   3. Convert to WebP @ quality 82 (~30–50% smaller than JPEG, supported
 *      everywhere we ship — iOS 14+, modern Android, all current browsers).
 *   4. Drop everything but the pixels — no GPS, no camera model, nothing.
 *
 * Why this matters: a fresh phone photo is often 4000×3000 @ 4MB. iOS
 * downloads that for a 600×800 quest card on cellular. Optimising on
 * upload turns 4MB → ~60KB and a 6s download → ~150ms.
 *
 * Returns null on failure — the caller should keep the original upload
 * rather than fail the whole request. Sharp can choke on weird files
 * (corrupt EXIF, unsupported codec) and we'd rather serve the original
 * than 500 the admin.
 */

const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1600;
const WEBP_QUALITY = 82;

export interface OptimizedImage {
  buffer: Buffer;
  width: number;
  height: number;
  size_bytes: number;
  mime_type: "image/webp";
}

export async function optimizeTenantMediaImage(
  input: Buffer
): Promise<OptimizedImage | null> {
  try {
    const pipeline = sharp(input, { failOn: "error" })
      .rotate() // apply EXIF orientation + strip it
      .resize({
        width: MAX_WIDTH,
        height: MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY, effort: 4 });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return {
      buffer: data,
      width: info.width,
      height: info.height,
      size_bytes: info.size,
      mime_type: "image/webp",
    };
  } catch {
    return null;
  }
}
