/**
 * Client-side video utilities — playback testing only.
 *
 * Videos are uploaded as-is to Supabase Storage. Modern browsers handle
 * most formats natively (H.264, HEVC, VP9, AV1). The frontend gracefully
 * falls back to the artist poster image if a specific browser can't play
 * the uploaded format.
 *
 * Server-side transcoding (Mux, Cloudflare Stream, or Edge Functions)
 * should be added when the platform needs guaranteed universal playback
 * across all browsers and devices.
 */

/**
 * Test if the current browser can play a given video file.
 *
 * Creates a hidden `<video>` element, loads the file via Blob URL,
 * and waits for either `canplay` (success) or `error` (failure).
 * Returns false after timeout — covers edge cases where no event fires.
 */
export function canBrowserPlayVideo(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let resolved = false;

    const finish = (result: boolean) => {
      if (resolved) return;
      resolved = true;
      video.removeAttribute("src");
      video.load(); // Release resources
      URL.revokeObjectURL(url);
      resolve(result);
    };

    video.oncanplay = () => finish(true);
    video.onerror = () => finish(false);

    // Safety timeout — if neither event fires in 8s, assume incompatible
    setTimeout(() => finish(false), 8000);

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
  });
}
