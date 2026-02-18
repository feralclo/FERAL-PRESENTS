/**
 * Client-side video compression using FFmpeg WASM.
 *
 * - Lazy-loads the FFmpeg core (~25MB) from CDN on first use
 * - Uses single-threaded build (no SharedArrayBuffer / special CORS headers)
 * - Compresses to 720p H.264 MP4 — more than enough for the artist modal
 * - Falls back to original file if compression fails
 * - Skips compression for files already under 8MB
 */

const CORE_VERSION = "0.12.6";
const CDN_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

/** Only compress files above this size (8MB) */
const COMPRESS_THRESHOLD = 8 * 1024 * 1024;

/** Max output width — 720p is plenty for the modal display */
const MAX_WIDTH = 720;

/** H.264 quality factor (lower = better quality, 18–28 range) */
const CRF = 23;

export type CompressStage = "loading" | "compressing" | "done";
export type ProgressCallback = (
  percent: number,
  stage: CompressStage
) => void;

// Singleton FFmpeg instance + progress delegate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ffmpegInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadPromise: Promise<any> | null = null;
let progressDelegate: ((ratio: number) => void) | null = null;

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");

    const ffmpeg = new FFmpeg();

    // Single progress handler that delegates to the current callback
    ffmpeg.on("progress", ({ progress }: { progress: number }) => {
      progressDelegate?.(Math.min(progress, 1));
    });

    // Load single-threaded WASM build from CDN (no SharedArrayBuffer needed)
    await ffmpeg.load({
      coreURL: await toBlobURL(
        `${CDN_BASE}/ffmpeg-core.js`,
        "text/javascript"
      ),
      wasmURL: await toBlobURL(
        `${CDN_BASE}/ffmpeg-core.wasm`,
        "application/wasm"
      ),
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}

/**
 * Compress a video file for web delivery.
 *
 * - Files under 8MB are returned as-is
 * - Compresses to 720p H.264 MP4 with good quality (CRF 23)
 * - If the compressed output is larger than the original, returns the original
 * - Falls back to the original file on any error
 */
export async function compressVideo(
  file: File,
  onProgress?: ProgressCallback
): Promise<File> {
  // Skip compression for small files
  if (file.size <= COMPRESS_THRESHOLD) {
    return file;
  }

  try {
    // Stage 1: Load FFmpeg (cached after first load)
    onProgress?.(0, "loading");
    const ffmpeg = await getFFmpeg();

    // Stage 2: Compress
    progressDelegate = (ratio) => {
      onProgress?.(Math.round(ratio * 100), "compressing");
    };

    const { fetchFile } = await import("@ffmpeg/util");

    const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
    const inputName = `input.${ext}`;
    const outputName = "output.mp4";

    await ffmpeg!.writeFile(inputName, await fetchFile(file));

    await ffmpeg!.exec([
      "-i",
      inputName,
      "-vf",
      `scale='min(${MAX_WIDTH},iw)':-2`, // Max 720px wide, keep aspect ratio
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      String(CRF),
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-movflags",
      "+faststart", // Enable progressive download
      "-y",
      outputName,
    ]);

    const data = await ffmpeg!.readFile(outputName);
    progressDelegate = null;

    // Clean up virtual filesystem
    try {
      await ffmpeg!.deleteFile(inputName);
    } catch {}
    try {
      await ffmpeg!.deleteFile(outputName);
    } catch {}

    // Copy into a fresh ArrayBuffer for Blob compatibility (avoids SharedArrayBuffer TS issue)
    const raw = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
    const copy = new Uint8Array(raw.length);
    copy.set(raw);
    const blob = new Blob([copy], { type: "video/mp4" });

    // Only use compressed version if it's actually smaller
    if (blob.size >= file.size) {
      onProgress?.(100, "done");
      return file;
    }

    const compressedName = file.name.replace(/\.[^.]+$/, ".mp4");
    onProgress?.(100, "done");
    return new File([blob], compressedName, { type: "video/mp4" });
  } catch (err) {
    console.warn("[video-compress] Compression failed, using original:", err);
    progressDelegate = null;
    onProgress?.(100, "done");
    return file;
  }
}
