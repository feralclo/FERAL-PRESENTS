/**
 * Image compression and processing utilities.
 * Extracted from the event editor for reuse across admin pages.
 */

/** Compress an image file to JPEG at a given max width and quality */
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
          resolve(canvas.toDataURL("image/jpeg", quality));
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

/** Process an image file with progressive compression to stay under ~600KB */
export async function processImageFile(file: File): Promise<string | null> {
  if (file.size > 10 * 1024 * 1024) {
    alert("Image too large. Maximum is 10MB.");
    return null;
  }
  const MAX_LEN = 800 * 1024; // ~600KB binary as base64
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
