/**
 * Client-side video processing — playback testing + FFmpeg WASM transcoding.
 *
 * iPhone/macOS videos often use QuickTime containers (ftypqt) that Chrome
 * and Firefox can't play. When a video fails the browser playback test,
 * we transcode it to H.264 MP4 (universal format) using FFmpeg WASM.
 *
 * FFmpeg WASM core (~32MB) is lazy-loaded from jsdelivr CDN on first use
 * and cached by the browser. Single-threaded mode — no SharedArrayBuffer.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

// ── Playback testing ──────────────────────────────────────────────────

/**
 * Test if the current browser can play a given video file.
 *
 * Creates a hidden `<video>` element, loads the file via Blob URL,
 * and waits for either `canplay` (success) or `error` (failure).
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
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };

    video.oncanplay = () => finish(true);
    video.onerror = () => finish(false);
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
 * Load the singleton FFmpeg instance.
 * Uses jsdelivr CDN (Cloudflare-backed, highly reliable).
 * The WASM binary is ~32MB — cached by the browser after first load.
 */
async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    const ffmpeg = new FFmpeg();

    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";
    const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript");
    const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm");

    await ffmpeg.load({ coreURL, wasmURL });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  // If loading fails, clear the promise so it can be retried
  ffmpegLoading.catch(() => {
    ffmpegLoading = null;
  });

  return ffmpegLoading;
}

/**
 * Transcode a video file to H.264 MP4 for universal browser playback.
 *
 * @param file        Input video file (any format FFmpeg supports)
 * @param onProgress  Callback with percent complete (0–100)
 * @returns           New File containing the transcoded H.264 MP4
 */
export async function transcodeToMP4(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<File> {
  const ffmpeg = await getFFmpeg();

  if (onProgress) {
    ffmpeg.on("progress", ({ progress }) => {
      onProgress(Math.min(99, Math.round(progress * 100)));
    });
  }

  // Write input to FFmpeg's virtual filesystem
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : ".mp4";
  const inputName = `input${ext}`;
  const outputName = "output.mp4";

  const arrayBuffer = await file.arrayBuffer();
  await ffmpeg.writeFile(inputName, new Uint8Array(arrayBuffer));

  // Transcode: H.264 video + AAC audio, faststart for streaming
  await ffmpeg.exec([
    "-i", inputName,
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "-y", outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);
  if (onProgress) onProgress(100);

  // Clean up virtual filesystem
  await ffmpeg.deleteFile(inputName).catch(() => {});
  await ffmpeg.deleteFile(outputName).catch(() => {});

  // Build output file
  const bytes = new Uint8Array(data as Uint8Array);
  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_");
  return new File([bytes], `${baseName}_web.mp4`, { type: "video/mp4" });
}
