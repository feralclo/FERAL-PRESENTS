"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CheckCircle2,
  FileText,
  Plus,
  Sparkles,
  Upload as UploadIcon,
  X,
} from "lucide-react";
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
  /** Pre-selects this campaign slug. */
  defaultCampaign?: string;
  /** Force campaign mode — hides the "Save to library" option. */
  campaignRequired?: boolean;
  onUploaded: () => void;
}

type Destination =
  | { kind: "library" }
  | { kind: "campaign"; tag: string };

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
  kind: "image" | "video";
  status: ItemStatus;
  progress: number;
  error?: string;
}

const MAX_CONCURRENCY = 3;
const VIDEO_MAX_BYTES = 200 * 1024 * 1024;

/**
 * Unified upload sheet. Supports two destinations:
 *
 *   1. **Save to library** — kind defaults to `generic`; the row lives
 *      in /admin/library "All assets" view, ready to be assigned to a
 *      cover slot or moved to a campaign later.
 *   2. **Save to a campaign** — kind = `quest_asset`, `tags[0]` = the
 *      campaign slug. The campaign chooser supports inline +New.
 *
 * Same drop zone, same queue, same pipelines (Sharp for images, Mux
 * capped-1080p for videos). The destination toggle is the only thing
 * that changes routing.
 */
export function BulkUploadSheet({
  open,
  onOpenChange,
  defaultCampaign,
  campaignRequired,
  onUploaded,
}: BulkUploadSheetProps) {
  const [destination, setDestination] = useState<Destination>(() =>
    defaultCampaign
      ? { kind: "campaign", tag: defaultCampaign }
      : campaignRequired
        ? { kind: "campaign", tag: "" }
        : { kind: "library" }
  );
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<QueueItem[]>([]);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Load campaigns once when the sheet opens — used by the chooser.
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

  // Re-sync when the prop changes — important for clicking Upload on a
  // different campaign after the first sheet open.
  useEffect(() => {
    if (defaultCampaign) {
      setDestination({ kind: "campaign", tag: defaultCampaign });
    }
  }, [defaultCampaign]);

  const inFlight = items.some(
    (i) => i.status !== "done" && i.status !== "failed"
  );
  const doneCount = items.filter((i) => i.status === "done").length;
  const failedCount = items.filter((i) => i.status === "failed").length;
  const showSummary = items.length > 0 && !inFlight;

  const canDrop =
    destination.kind === "library" ||
    (destination.kind === "campaign" && !!destination.tag);

  const patchItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
    );
  }, []);

  const enqueueFiles = useCallback(
    (files: FileList | File[]) => {
      if (!canDrop) return;
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
    [canDrop]
  );

  // Concurrent processor — kicks off as soon as items are queued and a
  // destination is locked.
  useEffect(() => {
    if (!canDrop) return;
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
          void processItem(target).catch(() => {
            // processItem patches its own failure state.
          });
          await new Promise((r) => setTimeout(r, 30));
        }
      } finally {
        isProcessingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, canDrop, destination]);

  const processItem = useCallback(
    async (item: QueueItem) => {
      patchItem(item.id, { status: "preparing" });
      try {
        if (item.kind === "image") {
          await uploadImage(item, destination, patchItem);
        } else {
          await uploadVideo(item, destination, patchItem);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        patchItem(item.id, { status: "failed", error: msg });
      }
    },
    [destination, patchItem]
  );

  // Bubble completion up so the parent refreshes lists / counts.
  useEffect(() => {
    if (showSummary && doneCount > 0) {
      onUploaded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSummary, doneCount]);

  const reset = useCallback(() => {
    setItems([]);
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

        <DropZone
          onDragOver={(e) => {
            e.preventDefault();
            if (canDrop) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!canDrop) return;
            enqueueFiles(e.dataTransfer.files);
          }}
          onClick={() => {
            if (!canDrop) return;
            fileRef.current?.click();
          }}
          disabled={!canDrop}
          dragging={dragging}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && canDrop) {
              enqueueFiles(e.target.files);
              e.target.value = "";
            }
          }}
        />

        {/* Destination chooser */}
        <div className="mt-4">
          <DestinationPicker
            destination={destination}
            campaigns={campaigns}
            campaignRequired={!!campaignRequired}
            onChange={setDestination}
          />
        </div>

        {/* Item list */}
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
              Uploading{" "}
              {items.filter((i) => i.status !== "done" && i.status !== "failed").length}
              …
            </p>
          ) : (
            <span />
          )}
          <AdminButton variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </AdminButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// DropZone — the canonical recipe used everywhere we accept files.
//   ▸ Resting:  border-2 dashed primary/30 + bg primary/[0.02], 32px icon
//   ▸ Hover:    border primary/55 + bg primary/[0.05]
//   ▸ Dragover: border primary solid + bg primary/[0.07] + scale-105 icon
//   ▸ Disabled: border-foreground/15, faded text, no hover
// Reads as "drop here" from across the room — no muted dashed-grey.
// ─────────────────────────────────────────────────────────────────────

interface DropZoneProps {
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
  disabled?: boolean;
  dragging: boolean;
  /** Optional override copy for the heading. */
  heading?: string;
  /** Optional override for the sub-line. */
  subline?: ReactNode;
  /** Tall / short — defaults to medium (h-44). */
  size?: "sm" | "md" | "lg";
}

export function DropZone({
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  disabled,
  dragging,
  heading = "Drop files, or click to choose",
  subline = "Images and videos. We’ll resize and compress for you.",
  size = "md",
}: DropZoneProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => {
        if (!disabled) onClick();
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label="Drop files or click to choose"
      aria-disabled={disabled}
      className={cn(
        "rounded-xl border-2 border-dashed transition-all duration-200",
        "flex flex-col items-center justify-center gap-2 text-center px-4",
        size === "sm" && "h-32",
        size === "md" && "h-44",
        size === "lg" && "h-56",
        disabled
          ? "border-foreground/15 bg-foreground/[0.02] cursor-not-allowed"
          : dragging
            ? "border-primary bg-primary/[0.07] cursor-pointer"
            : "border-primary/30 bg-primary/[0.02] hover:border-primary/55 hover:bg-primary/[0.05] cursor-pointer",
        "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
      )}
    >
      <UploadIcon
        className={cn(
          "transition-transform duration-200",
          dragging ? "scale-110 text-primary" : "text-primary/80",
          size === "sm" ? "h-6 w-6" : "h-8 w-8"
        )}
      />
      <p
        className={cn(
          "font-medium",
          size === "sm" ? "text-sm" : "text-base",
          disabled ? "text-foreground/45" : "text-foreground"
        )}
      >
        {heading}
      </p>
      <p
        className={cn(
          "text-xs",
          disabled ? "text-foreground/35" : "text-foreground/55"
        )}
      >
        {subline}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// DestinationPicker — segmented control, library vs campaign
// ─────────────────────────────────────────────────────────────────────

function DestinationPicker({
  destination,
  campaigns,
  campaignRequired,
  onChange,
}: {
  destination: Destination;
  campaigns: CampaignSummary[] | null;
  campaignRequired: boolean;
  onChange: (d: Destination) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.16em] text-foreground/60">
        Where should these go?
      </p>

      {!campaignRequired && (
        <div className="grid grid-cols-2 gap-2">
          <DestinationTile
            active={destination.kind === "library"}
            onClick={() => onChange({ kind: "library" })}
            title="Library"
            hint="General — use anywhere later."
            icon={<Sparkles className="h-3.5 w-3.5" />}
          />
          <DestinationTile
            active={destination.kind === "campaign"}
            onClick={() => {
              const tag =
                destination.kind === "campaign"
                  ? destination.tag
                  : campaigns?.[0]?.tag ?? "";
              onChange({ kind: "campaign", tag });
            }}
            title="A campaign"
            hint="For pool-quest shareables."
            icon={<Plus className="h-3.5 w-3.5" />}
          />
        </div>
      )}

      {destination.kind === "campaign" && (
        <div className="pt-1">
          <CampaignSelect
            campaigns={campaigns}
            value={destination.tag}
            onChange={(tag) => onChange({ kind: "campaign", tag })}
          />
        </div>
      )}
    </div>
  );
}

function DestinationTile({
  active,
  onClick,
  title,
  hint,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-left transition-colors",
        "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2",
        active
          ? "border-primary/40 bg-primary/[0.05]"
          : "border-border/50 hover:border-border"
      )}
      aria-pressed={active}
    >
      <div className="flex items-center gap-1.5 text-foreground">
        <span className={cn(active ? "text-primary" : "text-foreground/65")}>
          {icon}
        </span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="ml-5 mt-0.5 text-xs text-foreground/55">{hint}</p>
    </button>
  );
}

function CampaignSelect({
  campaigns,
  value,
  onChange,
}: {
  campaigns: CampaignSummary[] | null;
  value: string;
  onChange: (tag: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

  if (creating) {
    const proposed = slugifyCampaignLabel(draft);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Campaign name"
          maxLength={80}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && proposed) {
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
                  setDraft("");
                }
              } catch {
                /* leave input visible for retry */
              }
            }
          }}
          className="h-9 flex-1 min-w-[200px] rounded-md border border-border/60 bg-background px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
        />
        <AdminButton
          size="sm"
          variant="primary"
          disabled={!proposed}
          onClick={async () => {
            if (!proposed) return;
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
                setDraft("");
              }
            } catch {
              /* retry */
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
            setDraft("");
          }}
        >
          Cancel
        </AdminButton>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-border/60 bg-background px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
      >
        <option value="">Choose a campaign…</option>
        {(campaigns ?? []).map((c) => (
          <option key={c.tag} value={c.tag}>
            {c.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
      >
        <Plus className="h-3 w-3" />
        New campaign
      </button>
    </div>
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

// ─────────────────────────────────────────────────────────────────────
// Upload pipelines — image (Sharp) + video (Mux)
// ─────────────────────────────────────────────────────────────────────

async function uploadImage(
  item: QueueItem,
  destination: Destination,
  patchItem: (id: string, patch: Partial<QueueItem>) => void
) {
  const prepped = await prepareUploadFile(item.file);
  const dims = await readDims(prepped);

  const kind = destination.kind === "campaign" ? "quest_asset" : "generic";
  const tags =
    destination.kind === "campaign" && destination.tag
      ? [destination.tag]
      : [];

  patchItem(item.id, { status: "uploading" });

  const signedRes = await fetch("/api/admin/media/signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
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
      kind,
      width: dims?.width,
      height: dims?.height,
      tags,
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
  destination: Destination,
  patchItem: (id: string, patch: Partial<QueueItem>) => void
) {
  if (item.file.size > VIDEO_MAX_BYTES) {
    throw new Error(`That video's a bit big — try under 200 MB`);
  }

  if (destination.kind !== "campaign" || !destination.tag) {
    // Library-mode video uploads don't have a campaign to attach to.
    // We still want them in the library, but the existing image-only
    // tenant_media row can't hold a Mux playback id without a campaign
    // tag. For v1 we route library videos through the campaign-only
    // path with a synthetic "library" campaign, but the simpler answer
    // is to refuse: tell the user to pick a campaign or upload as an
    // image. Better than silently mis-tagging.
    throw new Error(
      "Pick a campaign for video uploads — they need somewhere to live."
    );
  }

  patchItem(item.id, { status: "uploading" });

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

  const putRes = await fetch(signed.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": item.file.type },
    body: item.file,
  });
  if (!putRes.ok) throw new Error("Storage upload failed");

  patchItem(item.id, { status: "processing-video" });
  const muxRes = await fetch("/api/mux/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoUrl: signed.publicUrl }),
  });
  const muxJson = await muxRes.json();
  if (!muxRes.ok) throw new Error(muxJson.error ?? "Video preparation failed");

  const assetId = muxJson.assetId as string;
  const ready = await pollMuxReady(assetId);
  if (!ready) throw new Error("Video took too long to prepare");

  const completeRes = await fetch("/api/admin/media/complete-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mux_asset_id: assetId,
      campaign_tag: isValidCampaignTag(destination.tag)
        ? destination.tag
        : slugifyCampaignLabel(destination.tag),
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
  const TIMEOUT = 5 * 60 * 1000;
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
      // Retry.
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
