"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, Upload as UploadIcon, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AdminButton } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { prepareUploadFile } from "@/lib/uploads/prepare-upload";
import {
  slugifyCampaignLabel,
  isValidCampaignTag,
} from "@/lib/library/campaign-tag";
import type { CampaignSummary } from "@/types/library-campaigns";

interface BulkUploadSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selects this campaign slug. If absent, the user must choose one. */
  defaultCampaign?: string;
  onUploaded: () => void;
}

type ItemStatus =
  | "queued"
  | "preparing"
  | "uploading"
  | "processing-video"
  | "done"
  | "failed";

interface QueueItem {
  id: string;
  file: File;
  /** "image" | "video" — derived from MIME type. Drives the routing. */
  kind: "image" | "video";
  status: ItemStatus;
  progress: number;
  error?: string;
}

const MAX_CONCURRENCY = 3;
const VIDEO_MAX_BYTES = 200 * 1024 * 1024;

/**
 * The campaign-aware bulk upload surface. Drag a folder of mixed images
 * and videos in; each file routes to the right pipeline (Sharp for
 * images, Mux for videos). All land in `tenant_media` with kind
 * `quest_asset` and the chosen campaign slug as `tags[0]`.
 *
 * Background-continue: closing the dialog mid-upload doesn't cancel
 * the queue (uploads continue) but the toast UI is left to the parent
 * page for v1 — most users wait the few seconds for completion.
 */
export function BulkUploadSheet({
  open,
  onOpenChange,
  defaultCampaign,
  onUploaded,
}: BulkUploadSheetProps) {
  const [campaignTag, setCampaignTag] = useState<string>(defaultCampaign ?? "");
  const [campaignDraft, setCampaignDraft] = useState<string>("");
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<QueueItem[]>([]);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Load campaigns when the sheet opens so the chooser has something to
  // pick from. Cheap query, no need to keep it loaded otherwise.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/media/campaigns", {
          cache: "no-store",
        });
        const json = await res.json();
        if (!cancelled && res.ok) setCampaigns(json.data ?? []);
      } catch {
        if (!cancelled) setCampaigns([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Re-sync the default campaign whenever the prop changes.
  useEffect(() => {
    if (defaultCampaign) setCampaignTag(defaultCampaign);
  }, [defaultCampaign]);

  const inFlight = items.some(
    (i) => i.status !== "done" && i.status !== "failed"
  );
  const doneCount = items.filter((i) => i.status === "done").length;
  const failedCount = items.filter((i) => i.status === "failed").length;
  const showSummary = items.length > 0 && !inFlight;

  const patchItem = useCallback(
    (id: string, patch: Partial<QueueItem>) => {
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
      );
    },
    []
  );

  const enqueueFiles = useCallback(
    (files: FileList | File[]) => {
      if (!campaignTag) return;
      const arr = Array.from(files);
      const next: QueueItem[] = arr.map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        kind: f.type.startsWith("video/") ? "video" : "image",
        status: "queued",
        progress: 0,
      }));
      setItems((prev) => [...prev, ...next]);
    },
    [campaignTag]
  );

  // Start the processor whenever there are queued items and we have a
  // campaign locked. The loop is single-runner; concurrency is faked by
  // patching items in flight.
  useEffect(() => {
    if (!campaignTag) return;
    if (isProcessingRef.current) return;
    if (!items.some((i) => i.status === "queued")) return;
    isProcessingRef.current = true;
    void (async () => {
      try {
        while (true) {
          const queued = itemsRef.current.filter((i) => i.status === "queued");
          if (queued.length === 0) break;

          const inflightCount = itemsRef.current.filter(
            (i) =>
              i.status === "preparing" ||
              i.status === "uploading" ||
              i.status === "processing-video"
          ).length;
          if (inflightCount >= MAX_CONCURRENCY) {
            await new Promise((r) => setTimeout(r, 150));
            continue;
          }

          const target = queued[0];
          // Kick off without await — concurrent.
          void processItem(target).catch(() => {
            // processItem patches its own failure state; nothing else
            // to do here.
          });
          // tiny gap to let React commit before we re-read itemsRef
          await new Promise((r) => setTimeout(r, 30));
        }
      } finally {
        isProcessingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, campaignTag]);

  const processItem = useCallback(
    async (item: QueueItem) => {
      patchItem(item.id, { status: "preparing" });
      try {
        if (item.kind === "image") {
          await uploadImage(item, campaignTag, patchItem);
        } else {
          await uploadVideo(item, campaignTag, patchItem);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        patchItem(item.id, { status: "failed", error: msg });
      }
    },
    [campaignTag, patchItem]
  );

  // Bubble completion up to the caller so the rail/canvas refresh.
  useEffect(() => {
    if (showSummary && doneCount > 0) {
      onUploaded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSummary, doneCount]);

  const reset = useCallback(() => {
    setItems([]);
    setCampaignDraft("");
    setDragging(false);
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o && !inFlight) reset();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogTitle>Upload</DialogTitle>

        {/* Step 1 — drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!campaignTag) return;
            enqueueFiles(e.dataTransfer.files);
          }}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Drop files or click to choose"
          className={cn(
            "mt-3 rounded-lg border-2 border-dashed transition-colors cursor-pointer",
            "h-44 flex flex-col items-center justify-center gap-1.5 text-center px-4",
            dragging
              ? "border-primary bg-primary/[0.04]"
              : "border-foreground/20 hover:border-foreground/35"
          )}
        >
          <UploadIcon className="h-5 w-5 text-foreground/60" />
          <p className="text-sm font-medium text-foreground">
            Drop files, or click to choose
          </p>
          <p className="text-xs text-foreground/55">
            Images and videos. We&apos;ll resize and compress for you.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && campaignTag) {
              enqueueFiles(e.target.files);
              e.target.value = "";
            }
          }}
        />

        {/* Step 2 — campaign chooser, sentence form */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span className="text-sm text-foreground/70">Add to campaign:</span>
          {campaigns === null ? (
            <span className="text-xs text-foreground/55">Loading…</span>
          ) : (
            <CampaignPicker
              campaigns={campaigns}
              value={campaignTag}
              draft={campaignDraft}
              onChange={(tag) => setCampaignTag(tag)}
              onDraftChange={setCampaignDraft}
            />
          )}
        </div>

        {/* Step 3 — item list */}
        {items.length > 0 && (
          <ul className="mt-4 space-y-2 max-h-64 overflow-y-auto">
            {items.map((it) => (
              <ItemRow
                key={it.id}
                item={it}
                onRemove={() =>
                  setItems((prev) => prev.filter((p) => p.id !== it.id))
                }
              />
            ))}
          </ul>
        )}

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between gap-3">
          {showSummary ? (
            <p className="text-xs text-foreground/70">
              {doneCount} added
              {failedCount > 0 ? `, ${failedCount} failed` : ""}.
            </p>
          ) : inFlight ? (
            <p className="text-xs text-foreground/55">
              Uploading {items.filter((i) => i.status !== "done" && i.status !== "failed").length}…
            </p>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <AdminButton variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </AdminButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CampaignPicker({
  campaigns,
  value,
  draft,
  onChange,
  onDraftChange,
}: {
  campaigns: CampaignSummary[];
  value: string;
  draft: string;
  onChange: (tag: string) => void;
  onDraftChange: (draft: string) => void;
}) {
  const [creating, setCreating] = useState(false);

  if (creating) {
    const proposed = slugifyCampaignLabel(draft);
    return (
      <span className="inline-flex items-center gap-1.5">
        <input
          type="text"
          autoFocus
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Campaign name"
          maxLength={80}
          className="h-8 w-48 rounded-md border border-border/60 bg-background px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
        />
        <AdminButton
          size="sm"
          variant="primary"
          disabled={!proposed}
          onClick={async () => {
            if (!proposed) return;
            // Reserve via the campaigns POST endpoint; idempotent.
            try {
              const res = await fetch("/api/admin/media/campaigns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: draft }),
              });
              const json = await res.json();
              if (res.ok) {
                onChange(json.data.tag);
                setCreating(false);
                onDraftChange("");
              }
            } catch {
              /* leave the input visible for retry */
            }
          }}
        >
          Add
        </AdminButton>
        <AdminButton
          size="sm"
          variant="ghost"
          onClick={() => {
            setCreating(false);
            onDraftChange("");
          }}
        >
          Cancel
        </AdminButton>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-border/60 bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
      >
        <option value="">Choose a campaign…</option>
        {campaigns.map((c) => (
          <option key={c.tag} value={c.tag}>
            {c.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="text-xs text-primary hover:underline"
      >
        + New campaign
      </button>
    </span>
  );
}

function ItemRow({
  item,
  onRemove,
}: {
  item: QueueItem;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2 rounded-md border border-border/30 bg-background/60">
      <FileText className="h-3.5 w-3.5 text-foreground/50 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground truncate">
          {item.file.name}
        </p>
        <p className="text-[11px] text-foreground/55 tabular-nums">
          {statusLabel(item)}
        </p>
      </div>
      {item.status === "done" ? (
        <CheckCircle2 className="h-4 w-4 text-success" />
      ) : item.status === "failed" ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Dismiss"
          className="h-6 w-6 rounded-md hover:bg-foreground/[0.06] flex items-center justify-center text-foreground/60"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
      )}
    </li>
  );
}

function statusLabel(item: QueueItem): string {
  switch (item.status) {
    case "queued":
      return "Queued";
    case "preparing":
      return "Preparing…";
    case "uploading":
      return "Uploading…";
    case "processing-video":
      return "Preparing video…";
    case "done":
      return "Added";
    case "failed":
      return item.error ?? "Failed";
  }
}

// ---------------------------------------------------------------------------
// Upload pipelines (image / video)
// ---------------------------------------------------------------------------

async function uploadImage(
  item: QueueItem,
  campaignTag: string,
  patchItem: (id: string, patch: Partial<QueueItem>) => void
) {
  const prepped = await prepareUploadFile(item.file);
  const dims = await readDims(prepped);

  patchItem(item.id, { status: "uploading" });

  const signedRes = await fetch("/api/admin/media/signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "quest_asset",
      content_type: prepped.type,
      size_bytes: prepped.size,
    }),
  });
  const signedJson = await signedRes.json();
  if (!signedRes.ok || !signedJson.data) {
    throw new Error(signedJson.error ?? "Server rejected upload");
  }

  const putRes = await fetch(signedJson.data.upload_url, {
    method: "PUT",
    headers: { "Content-Type": prepped.type },
    body: prepped,
  });
  if (!putRes.ok) {
    throw new Error("Storage upload failed");
  }

  const completeRes = await fetch("/api/admin/media/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: signedJson.data.key,
      kind: "quest_asset",
      width: dims?.width,
      height: dims?.height,
      tags: [campaignTag],
    }),
  });
  if (!completeRes.ok) {
    const j = await completeRes.json().catch(() => ({}));
    throw new Error(j.error ?? "Failed to record upload");
  }

  patchItem(item.id, { status: "done", progress: 100 });
}

async function uploadVideo(
  item: QueueItem,
  campaignTag: string,
  patchItem: (id: string, patch: Partial<QueueItem>) => void
) {
  if (item.file.size > VIDEO_MAX_BYTES) {
    throw new Error(`That video's a bit big — try under 200 MB`);
  }

  patchItem(item.id, { status: "uploading" });

  // 1. Get signed Supabase Storage URL.
  const signedRes = await fetch("/api/upload-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: item.file.name,
      contentType: item.file.type,
    }),
  });
  const signed = await signedRes.json();
  if (!signedRes.ok) throw new Error(signed.error ?? "Storage signup failed");

  // 2. PUT bytes.
  const putRes = await fetch(signed.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": item.file.type },
    body: item.file,
  });
  if (!putRes.ok) throw new Error("Storage upload failed");

  // 3. Tell Mux to ingest.
  patchItem(item.id, { status: "processing-video" });
  const muxRes = await fetch("/api/mux/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoUrl: signed.publicUrl }),
  });
  const muxJson = await muxRes.json();
  if (!muxRes.ok) throw new Error(muxJson.error ?? "Video preparation failed");

  // 4. Poll until ready (max ~5 mins). Mux is quick for short clips but
  // longer videos may take a while; we surface "Preparing video…" to the
  // user the whole time.
  const assetId = muxJson.assetId as string;
  const ready = await pollMuxReady(assetId);
  if (!ready) throw new Error("Video took too long to prepare");

  // 5. Insert tenant_media row.
  const completeRes = await fetch("/api/admin/media/complete-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mux_asset_id: assetId,
      campaign_tag: isValidCampaignTag(campaignTag)
        ? campaignTag
        : slugifyCampaignLabel(campaignTag),
    }),
  });
  if (!completeRes.ok) {
    const j = await completeRes.json().catch(() => ({}));
    throw new Error(j.error ?? "Failed to record video");
  }

  patchItem(item.id, { status: "done", progress: 100 });
}

async function pollMuxReady(assetId: string): Promise<boolean> {
  const start = Date.now();
  const TIMEOUT = 5 * 60 * 1000; // 5 mins
  while (Date.now() - start < TIMEOUT) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const res = await fetch(
        `/api/mux/status?assetId=${encodeURIComponent(assetId)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (res.ok && json?.status === "ready") return true;
      if (res.ok && json?.status === "errored") return false;
    } catch {
      // Network blip — keep polling.
    }
  }
  return false;
}

async function readDims(
  file: Blob
): Promise<{ width: number; height: number } | null> {
  try {
    const url = URL.createObjectURL(file);
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  } catch {
    return null;
  }
}
