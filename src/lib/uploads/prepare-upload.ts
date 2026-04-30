/**
 * Client-side upload preparation.
 *
 * Why this exists: phone photos at full quality routinely hit 10–25MB.
 * The server-side Sharp pipeline crushes everything to 1200×1600 WebP
 * regardless of input size, so uploading the full original is wasted
 * bandwidth — especially on cellular and especially during a bulk
 * upload of 8 covers. This helper canvas-downscales anything over 5MB
 * to fit a 2400×3200 box at JPEG q92, capping upload size at ~2–4MB
 * with no visible quality loss to the final 1200×1600 cover.
 *
 * Files at or under the threshold are passed through unchanged so we
 * preserve the original bytes when there's no benefit to re-encoding.
 *
 * If anything goes wrong (canvas decode fails, browser doesn't support
 * the format, etc) we fall back to the raw file — slow upload is still
 * better than failed upload.
 */

const COMPRESS_THRESHOLD_BYTES = 5 * 1024 * 1024;
const MAX_LONG_EDGE = 3200;
const MAX_SHORT_EDGE = 2400;
const JPEG_QUALITY = 0.92;

export async function prepareUploadFile(file: File): Promise<File> {
  if (file.size <= COMPRESS_THRESHOLD_BYTES) return file;
  if (!file.type.startsWith("image/")) return file;

  try {
    const compressed = await canvasDownscale(file);
    // Defensive: if compression didn't actually shrink the file (some weird
    // input we couldn't downscale further), keep the original.
    if (compressed && compressed.size < file.size) return compressed;
    return file;
  } catch {
    return file;
  }
}

async function canvasDownscale(file: File): Promise<File | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const { width, height } = scaleToFit(
      img.naturalWidth,
      img.naturalHeight,
      MAX_LONG_EDGE,
      MAX_SHORT_EDGE
    );

    if (width === img.naturalWidth && height === img.naturalHeight) {
      // Already small enough — re-encoding only saves bytes via quality
      // loss; not worth it.
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
    if (!blob) return null;

    // Preserve original name but rebrand extension since we're emitting JPEG.
    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function scaleToFit(
  width: number,
  height: number,
  maxLong: number,
  maxShort: number
): { width: number; height: number } {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (long <= maxLong && short <= maxShort) return { width, height };
  const scale = Math.min(maxLong / long, maxShort / short);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}
