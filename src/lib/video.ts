/**
 * Client-side video processing — playback testing + FFmpeg WASM transcoding.
 *
 * The platform accepts any video format tenants upload. If the browser can
 * play it natively, we upload as-is. If not, we transcode to H.264 MP4
 * (the universal format) before uploading.
 *
 * FFmpeg WASM core (~25MB) is lazy-loaded from CDN on first use and cached
 * by the browser. Single-threaded mode — no SharedArrayBuffer required.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// ── Playback testing ──────────────────────────────────────────────────

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

// ── FFmpeg WASM transcoding ───────────────────────────────────────────

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;

/**
 * Get or create the singleton FFmpeg instance.
 * The WASM binary is loaded from CDN on first use — no bundle impact.
 */
async function getFFmpeg(
  onLog?: (message: string) => void
): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    const ffmpeg = new FFmpeg();

    if (onLog) {
      ffmpeg.on("log", ({ message }) => onLog(message));
    }

    // Load single-threaded UMD build from CDN (no SharedArrayBuffer needed)
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.js`,
        "text/javascript"
      ),
      wasmURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm"
      ),
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return ffmpegLoading;
}

/**
 * Transcode any video file to H.264 MP4 for universal browser playback.
 *
 * Uses FFmpeg WASM (single-threaded) with:
 * - libx264 for video (ultrafast preset for speed, CRF 23 for quality)
 * - AAC for audio (128kbps)
 * - faststart flag (moov atom at start for progressive playback)
 *
 * @param file     Input video file (any format FFmpeg supports)
 * @param onProgress  Callback with percent complete (0–100)
 * @returns        New File containing the transcoded H.264 MP4
 */
export async function transcodeToMP4(
  file: File,
  onProgress?: (percent: number) => void
): Promise<File> {
  const ffmpeg = await getFFmpeg();

  // Track transcoding progress
  if (onProgress) {
    ffmpeg.on("progress", ({ progress }) => {
      // Clamp to 0–99 (we'll set 100 after readFile succeeds)
      onProgress(Math.min(99, Math.round(progress * 100)));
    });
  }

  // Write the input file to FFmpeg's virtual filesystem
  const ext = getExtension(file.name) || ".mp4";
  const inputName = `input${ext}`;
  const outputName = "output.mp4";

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  // Transcode to H.264 MP4
  await ffmpeg.exec([
    "-i",
    inputName,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-y",
    outputName,
  ]);

  // Read the transcoded output
  const data = await ffmpeg.readFile(outputName);

  if (onProgress) onProgress(100);

  // Clean up virtual filesystem
  await ffmpeg.deleteFile(inputName).catch(() => {});
  await ffmpeg.deleteFile(outputName).catch(() => {});

  // Convert FileData to a standard Uint8Array that Blob accepts
  const bytes = new Uint8Array(data as Uint8Array);
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blob = new Blob([bytes], { type: "video/mp4" });
  return new File([blob], `${safeName}_web.mp4`, { type: "video/mp4" });
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot) : "";
}
