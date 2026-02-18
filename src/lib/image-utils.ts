/**
 * Image compression and processing utilities.
 * Extracted from the event editor for reuse across admin pages.
 *
 * PNGs with transparency are preserved as PNG to avoid black backgrounds.
 * All other images are compressed to JPEG for smaller file sizes.
 */

/** Check if a canvas has any transparent pixels */
function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  // Sample every 50th pixel for speed — enough to detect transparency
  for (let i = 3; i < data.length; i += 200) {
    if (data[i] < 250) return true;
  }
  return false;
}

/** Compress an image file at a given max width and quality.
 *  Preserves PNG format when the source has transparency. */
export function compressImage(
  file: File,
  maxWidth: number,
  quality: number
): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d")!;
          let w = img.width;
          let h = img.height;
          if (w > maxWidth) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          }
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);

          // If the source is PNG and has transparency, keep it as PNG
          const isPng = file.type === "image/png";
          if (isPng && hasTransparency(ctx, w, h)) {
            resolve(canvas.toDataURL("image/png"));
          } else {
            resolve(canvas.toDataURL("image/jpeg", quality));
          }
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/** Process an image file with progressive compression to stay under ~600KB.
 *  PNG limit is higher (1.2MB) since they don't compress as aggressively. */
export async function processImageFile(file: File): Promise<string | null> {
  if (file.size > 10 * 1024 * 1024) {
    alert("Image too large. Maximum is 10MB.");
    return null;
  }
  const isPng = file.type === "image/png";
  const MAX_LEN = isPng ? 1600 * 1024 : 800 * 1024;

  let result = await compressImage(file, 1600, 0.8);
  if (result && result.length > MAX_LEN) {
    result = await compressImage(file, 1200, 0.65);
  }
  if (result && result.length > MAX_LEN) {
    result = await compressImage(file, 900, 0.5);
  }
  if (!result) {
    alert("Failed to process image. Try a smaller file.");
  }
  return result;
}
