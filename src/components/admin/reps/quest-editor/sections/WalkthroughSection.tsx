"use client";

import { useRef, useState } from "react";
import { Loader2, Play, Upload, Video } from "lucide-react";
import { getMuxThumbnailUrl } from "@/lib/mux";
import type { SectionProps } from "../types";

const MAX_BYTES = 50 * 1024 * 1024;
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 60;

type UploadStatus =
  | { state: "idle" }
  | { state: "preparing" }
  | { state: "uploading"; progress: number }
  | { state: "processing" }
  | { state: "error"; message: string };

/**
 * Optional screen recording showing reps how to do the quest. Stores a
 * Mux playback id on `walkthrough_video_url` (column added in Phase 0.1,
 * iOS contract bumped in 0.2). iOS surfaces it as a "Watch how" button
 * inside `QuestDetailSheet`.
 *
 * Pipeline (mirrors the legacy quest video upload, simplified):
 *   1. POST `/api/upload-video` → signed PUT URL to Supabase Storage
 *   2. PUT the file → public storage URL
 *   3. POST `/api/mux/upload` with the public URL → asset id
 *   4. Poll `/api/mux/status?assetId=...` until `ready` → playback id
 *
 * 50MB file cap, ~3 minute processing budget. Walkthroughs are short
 * screen recordings — bigger files belong in a content quest.
 */
export function WalkthroughSection({ state, onChange }: SectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<UploadStatus>({ state: "idle" });
  const playbackId = state.walkthrough_video_url;

  const onFile = async (file: File) => {
    if (file.size > MAX_BYTES) {
      setStatus({
        state: "error",
        message: `Video is ${Math.round(file.size / 1024 / 1024)}MB — keep walkthroughs under 50MB.`,
      });
      return;
    }
    if (!file.type.startsWith("video/")) {
      setStatus({
        state: "error",
        message: "Pick a video file (MP4, MOV, WebM).",
      });
      return;
    }

    try {
      setStatus({ state: "preparing" });
      const signRes = await fetch("/api/upload-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      });
      const signJson = await signRes.json();
      if (!signRes.ok) {
        throw new Error(signJson.error ?? "Couldn't start upload");
      }

      setStatus({ state: "uploading", progress: 5 });
      await uploadWithProgress(signJson.signedUrl, file, (progress) =>
        setStatus({ state: "uploading", progress })
      );

      setStatus({ state: "processing" });
      const muxRes = await fetch("/api/mux/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: signJson.publicUrl }),
      });
      const muxJson = await muxRes.json();
      if (!muxRes.ok) {
        throw new Error(muxJson.error ?? "Couldn't start processing");
      }

      const assetId = muxJson.assetId as string;
      for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const pollRes = await fetch(`/api/mux/status?assetId=${assetId}`);
        const pollJson = await pollRes.json();
        if (pollJson.status === "ready" && pollJson.playbackId) {
          onChange({ walkthrough_video_url: pollJson.playbackId });
          setStatus({ state: "idle" });
          return;
        }
        if (pollJson.status === "errored") {
          throw new Error("Processing failed — try a different file");
        }
      }
      throw new Error("Processing timed out — the video might be too long");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      setStatus({ state: "error", message });
    }
  };

  if (playbackId) {
    return (
      <div className="space-y-3">
        <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border/60 bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getMuxThumbnailUrl(playbackId)}
            alt="Walkthrough thumbnail"
            className="absolute inset-0 h-full w-full object-cover opacity-90"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white">
              <Play size={20} strokeWidth={2} fill="currentColor" />
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="
              inline-flex items-center gap-1.5 rounded-md
              border border-border/60 bg-card px-3 py-1.5 text-xs font-medium
              shadow-sm transition-colors hover:border-border
            "
          >
            <Upload size={12} />
            Replace
          </button>
          <button
            type="button"
            onClick={() => onChange({ walkthrough_video_url: null })}
            className="text-xs text-muted-foreground transition-colors hover:text-destructive"
          >
            Remove
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Record your screen showing how to do this quest. Reps see a "Watch how" button on the quest page — only shown if you upload one.
      </p>
      <UploadDropZone
        status={status}
        onPick={() => fileInputRef.current?.click()}
        onFile={onFile}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

interface UploadDropZoneProps {
  status: UploadStatus;
  onPick: () => void;
  onFile: (file: File) => void;
}

function UploadDropZone({ status, onPick, onFile }: UploadDropZoneProps) {
  const busy =
    status.state === "preparing" ||
    status.state === "uploading" ||
    status.state === "processing";

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={onDrop}
        className="
          relative flex flex-col items-center justify-center gap-2
          rounded-md border border-dashed border-border/60 bg-primary/[0.03]
          px-4 py-8 text-center
        "
      >
        {busy ? (
          <UploadProgress status={status} />
        ) : (
          <>
            <Video size={20} className="text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Drop a video or click to upload
            </p>
            <p className="text-xs text-muted-foreground">
              MP4, MOV, or WebM · up to 50MB
            </p>
            <button
              type="button"
              onClick={onPick}
              className="
                mt-2 inline-flex items-center gap-1.5 rounded-md
                border border-border/60 bg-card px-3 py-1.5 text-xs font-medium
                shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03]
              "
            >
              <Upload size={12} />
              Choose file
            </button>
          </>
        )}
      </div>
      {status.state === "error" ? (
        <p className="text-xs text-destructive">{status.message}</p>
      ) : null}
    </div>
  );
}

function UploadProgress({ status }: { status: UploadStatus }) {
  if (status.state === "preparing") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" />
        Preparing…
      </div>
    );
  }
  if (status.state === "uploading") {
    return (
      <div className="w-full max-w-xs space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" />
            Uploading
          </span>
          <span className="font-mono tabular-nums">{status.progress}%</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-border/60">
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${status.progress}%` }}
          />
        </div>
      </div>
    );
  }
  if (status.state === "processing") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" />
        Processing video…
      </div>
    );
  }
  return null;
}

function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 95));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Upload failed (HTTP ${xhr.status})`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
    xhr.send(file);
  });
}
