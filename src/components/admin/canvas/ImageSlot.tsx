"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Upload, Trash2, AlertTriangle } from "lucide-react";
import { processImageFile } from "@/lib/image-utils";
import { cn } from "@/lib/utils";
import type { TenantMediaKind } from "@/lib/uploads/tenant-media-config";

/**
 * One image slot in the Look section. Replaces the bare ImageUpload with a
 * deliberate, opinionated tile that:
 *
 * - shows the target aspect ratio
 * - shows a tiny "where this appears" silhouette so the host knows why
 *   they're uploading it
 * - supports drag-drop AND paste-from-clipboard (cmd+V on the slot)
 * - renders the new file as a blob URL the moment it's selected so the
 *   preview pane updates instantly, then swaps to the uploaded URL
 *   (Phase 3.3 perf brief)
 * - if the uploaded image's aspect doesn't match the slot's expected
 *   shape, surface a friendly nudge — no silent acceptance.
 */

export type ImageSlotShape = "square" | "landscape" | "portrait";

interface ImageSlotProps {
  /** Display label, eg "Cover (clean)". */
  label: string;
  /** Sub-label hinting where the image lives on the live page. */
  hint: string;
  shape: ImageSlotShape;
  value: string;
  onChange: (v: string) => void;
  /** Optional upload key for legacy base64 /api/upload path. */
  uploadKey?: string;
  /** When set, drag-drop / paste / pick goes through /api/admin/media —
   *  saves a tenant_media row, runs server-side Sharp optimisation
   *  (resize → WebP → strip EXIF), and the upload becomes available in
   *  the library for reuse. Recommended for any kind that has a library. */
  mediaKind?: TenantMediaKind;
  /** Tells the host where this image surfaces — render as a SVG silhouette. */
  surface: "card-tile" | "page-hero" | "story-share";
}

const SHAPE_RATIO: Record<
  ImageSlotShape,
  { w: number; h: number; label: string; suggested: string }
> = {
  // `suggested` shown in the empty state so hosts know what size to pick
  // BEFORE they upload — saves the re-upload loop when they pick something
  // tiny or way off-ratio.
  square: { w: 1, h: 1, label: "1:1", suggested: "2400 × 2400px" },
  landscape: { w: 16, h: 9, label: "16:9", suggested: "2880 × 1620px" },
  portrait: { w: 4, h: 5, label: "4:5", suggested: "1600 × 2000px" },
};

/** Tolerance for "is this aspect ratio close enough" — 12%. */
const ASPECT_TOLERANCE = 0.12;

export function ImageSlot({
  label,
  hint,
  shape,
  value,
  onChange,
  uploadKey,
  mediaKind,
  surface,
}: ImageSlotProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [aspectWarning, setAspectWarning] = useState(false);
  const [blobPreview, setBlobPreview] = useState<string | null>(null);

  // Resolve the displayed src — prefer the blob preview during upload, fall
  // back to the persisted value once we have it.
  const displaySrc = blobPreview || value || null;

  const ratio = SHAPE_RATIO[shape];

  const checkAspect = useCallback(
    (file: File): Promise<boolean> => {
      // Returns true if the natural aspect is close enough to the slot's.
      return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new window.Image();
        img.onload = () => {
          const expected = ratio.w / ratio.h;
          const actual = img.width / img.height;
          URL.revokeObjectURL(url);
          resolve(Math.abs(actual - expected) / expected < ASPECT_TOLERANCE);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(true); // Don't block on aspect-check failure.
        };
        img.src = url;
      });
    },
    [ratio.w, ratio.h]
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      setProcessing(true);
      setUploadError("");
      setAspectWarning(false);

      const aspectOk = await checkAspect(file);
      if (!aspectOk) setAspectWarning(true);

      // Immediate preview while we upload — keeps the canvas preview pane
      // responsive instead of flashing the old image.
      const blobUrl = URL.createObjectURL(file);
      setBlobPreview(blobUrl);

      try {
        if (mediaKind) {
          // ── Tenant-media path ─────────────────────────────────────────
          // Direct-to-Storage signed URL → /complete runs Sharp (resize +
          // WebP + strip EXIF) and writes a tenant_media row, so the file
          // appears in the library for reuse on the next event/quest.
          const signedRes = await fetch("/api/admin/media/signed-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: mediaKind,
              content_type: file.type,
              size_bytes: file.size,
            }),
          });
          const signedJson = await signedRes.json();
          if (!signedRes.ok || !signedJson.data) {
            setUploadError(signedJson.error || "Upload failed");
          } else {
            const putRes = await fetch(signedJson.data.upload_url, {
              method: "PUT",
              headers: { "Content-Type": file.type },
              body: file,
            });
            if (!putRes.ok) {
              setUploadError("Upload to storage failed");
            } else {
              const completeRes = await fetch("/api/admin/media/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  key: signedJson.data.key,
                  kind: mediaKind,
                }),
              });
              const completeJson = await completeRes.json();
              if (!completeRes.ok || !completeJson.data) {
                setUploadError(completeJson.error || "Failed to finalise upload");
              } else {
                onChange(completeJson.data.url);
              }
            }
          }
        } else {
          // ── Legacy base64 path ────────────────────────────────────────
          // Used by surfaces that don't have a tenant_media kind yet
          // (banner, story-share, branding, popup). Compresses in-browser
          // and POSTs base64 to /api/upload.
          const compressed = await processImageFile(file);
          if (compressed) {
            if (uploadKey) {
              const res = await fetch("/api/upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageData: compressed, key: uploadKey }),
              });
              const json = await res.json();
              if (res.ok && json.url) {
                onChange(json.url);
              } else {
                setUploadError(json.error || "Upload failed");
                onChange(compressed);
              }
            } else {
              onChange(compressed);
            }
          }
        }
      } catch {
        setUploadError("Network error during upload");
      }

      URL.revokeObjectURL(blobUrl);
      setBlobPreview(null);
      setProcessing(false);
    },
    [checkAspect, onChange, uploadKey, mediaKind]
  );

  // Paste-from-clipboard. Listening on the slot's div, not document, so
  // multiple slots don't fight for the paste event.
  useEffect(() => {
    const node = slotRef.current;
    if (!node) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFile(file);
            return;
          }
        }
      }
    };
    node.addEventListener("paste", onPaste);
    return () => node.removeEventListener("paste", onPaste);
  }, [handleFile]);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium text-foreground">{label}</div>
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{hint}</p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
          {ratio.label}
        </span>
      </div>

      <div
        ref={slotRef}
        tabIndex={0}
        aria-label={`${label} — paste, drag, or click to upload`}
        role="button"
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        className={cn(
          "relative cursor-pointer overflow-hidden rounded-lg border bg-foreground/[0.02] transition-colors",
          "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2",
          dragging
            ? "border-primary/60 bg-primary/[0.04]"
            : displaySrc
              ? "border-border/60 hover:border-primary/30"
              : "border-2 border-dashed border-border/60 hover:border-primary/30"
        )}
        style={{
          aspectRatio: `${ratio.w} / ${ratio.h}`,
        }}
      >
        {displaySrc ? (
          <Image
            src={displaySrc}
            alt={label}
            fill
            sizes="(max-width: 1024px) 100vw, 320px"
            unoptimized
            className={cn(
              "object-cover transition-opacity",
              processing && "opacity-60"
            )}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
            <SurfaceSilhouette surface={surface} />
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Upload size={13} />
              Drop, paste, or click
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">
              {ratio.label} · {ratio.suggested}
            </div>
          </div>
        )}

        {processing && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-[2px]">
            <Loader2 size={20} className="animate-spin text-primary" />
          </div>
        )}

        {displaySrc && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAspectWarning(false);
              onChange("");
            }}
            aria-label={`Remove ${label}`}
            className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-black/55 text-white/85 backdrop-blur-sm hover:text-destructive focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {aspectWarning && displaySrc && (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/[0.05] px-2.5 py-2 text-[11px] text-foreground">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" />
          <div>
            <span className="font-medium">Wrong shape.</span>{" "}
            This slot expects {ratio.label}. We&apos;ll display it cropped — try
            re-uploading at the right ratio for a sharper result.
          </div>
        </div>
      )}

      {uploadError && (
        <p className="text-[11px] text-destructive">{uploadError}</p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * A tiny SVG showing where this image lives on the live page. Demystifies
 * the slot — uploading "Banner" with no preview of where banners sit is
 * the legacy editor's worst paper cut.
 */
function SurfaceSilhouette({ surface }: { surface: ImageSlotProps["surface"] }) {
  // Sized big enough to read on a 375px phone — the 60×36 originals were
  // too easy to miss in the noise of the empty-state copy.
  if (surface === "card-tile") {
    return (
      <svg width="88" height="52" viewBox="0 0 88 52" className="text-muted-foreground/55">
        <rect x="3" y="3" width="82" height="32" rx="3" fill="currentColor" opacity="0.25" />
        <rect x="3" y="40" width="58" height="3" rx="1.5" fill="currentColor" opacity="0.45" />
        <rect x="3" y="47" width="40" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
      </svg>
    );
  }
  if (surface === "page-hero") {
    return (
      <svg width="88" height="52" viewBox="0 0 88 52" className="text-muted-foreground/55">
        <rect x="3" y="3" width="82" height="22" rx="3" fill="currentColor" opacity="0.25" />
        <rect x="3" y="29" width="52" height="3" rx="1.5" fill="currentColor" opacity="0.45" />
        <rect x="3" y="36" width="68" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
        <rect x="3" y="43" width="28" height="4" rx="1.5" fill="currentColor" opacity="0.55" />
      </svg>
    );
  }
  return (
    // story-share — full-bleed phone shape
    <svg width="52" height="80" viewBox="0 0 52 80" className="text-muted-foreground/55">
      <rect x="3" y="3" width="46" height="74" rx="6" fill="currentColor" opacity="0.25" />
      <rect x="20" y="6" width="12" height="2.5" rx="1.25" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
