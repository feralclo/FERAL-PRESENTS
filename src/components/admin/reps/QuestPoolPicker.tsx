"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { AdminButton } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { prepareUploadFile } from "@/lib/uploads/prepare-upload";
import {
  isValidCampaignTag,
  slugifyCampaignLabel,
} from "@/lib/library/campaign-tag";
import type { CampaignSummary } from "@/types/library-campaigns";

interface QuestPoolPickerProps {
  mode: "single" | "pool";
  campaignTag: string;
  onModeChange: (mode: "single" | "pool") => void;
  onCampaignChange: (tag: string) => void;
  /** Used to auto-name a freshly-created inline campaign, so the host
   *  doesn't get prompted mid-upload. Falls back to a generic name if
   *  the title is empty. */
  questTitle?: string;
}

interface UploadItem {
  id: string;
  file: File;
  /** Browser object-URL — revoked when the item leaves the queue. */
  previewUrl: string;
  kind: "image" | "video";
  status:
    | "queued"
    | "preparing"
    | "uploading"
    | "processing-video"
    | "done"
    | "failed";
  error?: string;
  /** tenant_media.id once the upload lands — lets us DELETE on remove. */
  mediaId?: string;
}

const VIDEO_MAX_BYTES = 200 * 1024 * 1024;

/**
 * Pool/single shareable mode toggle for the quest editor's Content tab.
 *
 * - Single: parent renders the single-asset upload below.
 * - Pool: this component owns a generous primary-tinted drop zone or,
 *         once a campaign is picked, a rich preview card showing what
 *         reps will see. Dragging files onto the drop zone creates a
 *         campaign auto-named after the quest title and uploads them
 *         in one flow — no navigation, no modal hops.
 */
export function QuestPoolPicker({
  mode,
  campaignTag,
  onModeChange,
  onCampaignChange,
  questTitle,
}: QuestPoolPickerProps) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/media/campaigns", {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok) setCampaigns(json.data ?? []);
      else setError(json.error ?? "Failed to load campaigns");
    } catch {
      setError("Network error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeCampaign = campaigns?.find((c) => c.tag === campaignTag) ?? null;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.16em] text-foreground/60 mb-2">
          Shareables
        </p>
        <SegmentedToggle
          value={mode}
          onChange={(v) => onModeChange(v)}
        />
      </div>

      {mode === "pool" && (
        <PoolBody
          campaigns={campaigns}
          activeCampaign={activeCampaign}
          campaignTag={campaignTag}
          questTitle={questTitle ?? ""}
          onPick={onCampaignChange}
          onRefresh={() => void refresh()}
        />
      )}

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Segmented toggle — replaces the two stacked radio rows
// ─────────────────────────────────────────────────────────────────────

function SegmentedToggle({
  value,
  onChange,
}: {
  value: "single" | "pool";
  onChange: (v: "single" | "pool") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg border border-border/50 bg-card/50 max-w-md">
      <SegmentButton
        active={value === "single"}
        onClick={() => onChange("single")}
        title="Single asset"
        sub="One image or video"
      />
      <SegmentButton
        active={value === "pool"}
        onClick={() => onChange("pool")}
        title="From a campaign"
        sub="A rotating pool"
      />
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-2 text-left transition-colors",
        "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2",
        active
          ? "bg-primary/10 text-primary"
          : "text-foreground/65 hover:text-foreground hover:bg-foreground/[0.03]"
      )}
      aria-pressed={active}
    >
      <p className="text-sm font-medium">{title}</p>
      <p
        className={cn(
          "text-[11px] mt-0.5",
          active ? "text-primary/75" : "text-foreground/55"
        )}
      >
        {sub}
      </p>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PoolBody — drop zone OR populated card
// ─────────────────────────────────────────────────────────────────────

/**
 * PoolBody owns the upload queue so it survives the empty→populated
 * transition. Both sub-views just render it; nothing else manages
 * upload state.
 */
function PoolBody({
  campaigns,
  activeCampaign,
  campaignTag,
  questTitle,
  onPick,
  onRefresh,
}: {
  campaigns: CampaignSummary[] | null;
  activeCampaign: CampaignSummary | null;
  campaignTag: string;
  questTitle: string;
  onPick: (tag: string) => void;
  onRefresh: () => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const itemsRef = useRef<UploadItem[]>([]);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const patchItem = useCallback(
    (id: string, patch: Partial<UploadItem>) => {
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
      );
    },
    []
  );

  const runQueueFor = useCallback(
    async (tag: string) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      try {
        while (true) {
          const queued = itemsRef.current.find((i) => i.status === "queued");
          if (!queued) break;
          patchItem(queued.id, { status: "preparing" });
          try {
            if (queued.kind === "image") {
              await uploadImageToCampaign(queued, tag, patchItem);
            } else {
              await uploadVideoToCampaign(queued, tag, patchItem);
            }
          } catch (e) {
            patchItem(queued.id, {
              status: "failed",
              error: e instanceof Error ? e.message : "Failed",
            });
          }
        }
      } finally {
        isProcessingRef.current = false;
        onRefresh();
        // Brief success flash, then evict completed items so the
        // refreshed server thumbnails are the single source of truth.
        setTimeout(() => {
          setItems((prev) => {
            const survivors: UploadItem[] = [];
            for (const it of prev) {
              if (it.status === "done") {
                try {
                  URL.revokeObjectURL(it.previewUrl);
                } catch {
                  /* tolerated */
                }
              } else {
                survivors.push(it);
              }
            }
            return survivors;
          });
        }, 700);
      }
    },
    [onRefresh, patchItem]
  );

  const enqueueAndRun = useCallback(
    (files: FileList | File[], tag: string) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      const next: UploadItem[] = arr.map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
        kind: f.type.startsWith("video/") ? "video" : "image",
        status: "queued",
      }));
      setItems((prev) => [...prev, ...next]);
      setTimeout(() => void runQueueFor(tag), 0);
    },
    [runQueueFor]
  );

  /** Empty-state drop handler — creates a campaign on the fly with the
   *  quest title, then routes the dropped files through the same queue
   *  the populated state will mount around. */
  const handleEmptyDrop = useCallback(
    async (files: FileList | File[]) => {
      if (files.length === 0) return;
      const seed =
        questTitle.trim() ||
        `Campaign ${new Date().toLocaleDateString()}`;
      try {
        const res = await fetch("/api/admin/media/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: seed }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Couldn't create campaign");
        const tag = json.data.tag as string;
        onPick(tag);
        onRefresh();
        enqueueAndRun(files, tag);
      } catch (err) {
        console.error("[pool] handleEmptyDrop:", err);
      }
    },
    [questTitle, onPick, onRefresh, enqueueAndRun]
  );

  if (!campaignTag || !activeCampaign) {
    return (
      <PoolDropZone
        campaigns={campaigns}
        questTitle={questTitle}
        onDropFiles={handleEmptyDrop}
        onPickExisting={(tag) => {
          onPick(tag);
          onRefresh();
        }}
      />
    );
  }

  return (
    <PoolPreviewCard
      campaign={activeCampaign}
      campaigns={campaigns ?? []}
      items={items}
      onChange={(tag) => {
        onPick(tag);
        onRefresh();
      }}
      onAddFiles={(files) => enqueueAndRun(files, activeCampaign.tag)}
      onRemoveItem={(id) =>
        removeItem(id, itemsRef.current, setItems)
      }
      onRefresh={onRefresh}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// PoolDropZone — empty state with drag-drop + inline campaign creation
// ─────────────────────────────────────────────────────────────────────

function PoolDropZone({
  campaigns,
  questTitle,
  onDropFiles,
  onPickExisting,
}: {
  campaigns: CampaignSummary[] | null;
  questTitle: string;
  onDropFiles: (files: FileList | File[]) => void | Promise<void>;
  onPickExisting: (tag: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasCampaigns = (campaigns?.length ?? 0) > 0;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "grid gap-3",
          hasCampaigns ? "md:grid-cols-2" : "grid-cols-1"
        )}
      >
        {/* Drop zone (left half on desktop) */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragging) setDragging(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void onDropFiles(e.dataTransfer.files);
          }}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileRef.current?.click();
            }
          }}
          className={cn(
            "relative rounded-xl border-2 border-dashed transition-all duration-200",
            "min-h-56 flex flex-col items-center justify-center gap-2 text-center px-6 py-6",
            "cursor-pointer",
            "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2",
            dragging
              ? "border-primary bg-primary/[0.07]"
              : "border-primary/30 bg-primary/[0.02] hover:border-primary/55 hover:bg-primary/[0.05]"
          )}
        >
          <UploadGlyph active={dragging} />
          <p className="text-base font-medium text-foreground">
            Drop images and videos
          </p>
          <p className="text-xs text-foreground/60 max-w-xs leading-relaxed">
            We&apos;ll save them to a new campaign{" "}
            {questTitle.trim() ? (
              <>
                named{" "}
                <span className="text-foreground/85">
                  “{questTitle.trim()}”
                </span>
              </>
            ) : (
              "for this quest"
            )}
            .
          </p>
        </div>

        {hasCampaigns && (
          <ExistingCampaignPanel
            campaigns={campaigns ?? []}
            onPick={onPickExisting}
          />
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            void onDropFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}

/**
 * Right-half panel surfacing existing campaigns with a quick search.
 * Sits beside the drop zone in the empty-state grid so the choice is
 * visually balanced, not buried below.
 */
function ExistingCampaignPanel({
  campaigns,
  onPick,
}: {
  campaigns: CampaignSummary[];
  onPick: (tag: string) => void;
}) {
  const [query, setQuery] = useState("");
  const sorted = [...campaigns].sort(
    (a, b) =>
      new Date(b.first_seen_at).getTime() -
      new Date(a.first_seen_at).getTime()
  );
  const filtered = query.trim()
    ? sorted.filter((c) =>
        c.label.toLowerCase().includes(query.trim().toLowerCase())
      )
    : sorted;

  return (
    <div className="rounded-xl border border-border/50 bg-card flex flex-col min-h-56">
      <div className="px-4 pt-4 pb-2">
        <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.16em] text-foreground/60 mb-2">
          Pick existing
        </p>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}…`}
          className="w-full h-9 rounded-md border border-border/60 bg-background px-2.5 text-sm placeholder:text-foreground/45 focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
        />
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 ? (
          <p className="px-2 py-4 text-xs text-foreground/55 text-center">
            No matches.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((c) => (
              <li key={c.tag}>
                <button
                  type="button"
                  onClick={() => onPick(c.tag)}
                  className="w-full text-left px-2.5 py-2 rounded-md hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.04] focus-visible:outline-none transition-colors flex items-center justify-between gap-3"
                >
                  <span className="text-sm font-medium text-foreground truncate">
                    {c.label}
                  </span>
                  <span className="text-xs text-foreground/55 tabular-nums shrink-0">
                    {c.asset_count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Inline-renamable campaign label. Click the heading or the pencil
 * icon, type a new name, hit enter — PATCHes via the existing rename
 * route which atomically rewrites every linked quest's
 * asset_campaign_tag too.
 */
function CampaignNameInline({
  label,
  tag,
  onRenamed,
}: {
  label: string;
  tag: string;
  onRenamed: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(label);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing, label]);

  const save = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === label) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/media/campaigns/${encodeURIComponent(tag)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: trimmed }),
        }
      );
      if (res.ok) {
        onRenamed();
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }, [draft, label, tag, onRenamed]);

  if (editing) {
    return (
      <div className="mt-1 flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={80}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            } else if (e.key === "Escape") {
              setEditing(false);
            }
          }}
          className="flex-1 h-8 rounded-md border border-border/60 bg-background px-2 text-base font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
        />
        <AdminButton
          size="sm"
          variant="primary"
          loading={saving}
          onClick={() => void save()}
        >
          Save
        </AdminButton>
        <AdminButton
          size="sm"
          variant="ghost"
          onClick={() => setEditing(false)}
        >
          Cancel
        </AdminButton>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group/title mt-1 inline-flex items-center gap-1.5 max-w-full focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2 rounded-sm"
      title="Click to rename"
    >
      <span className="text-base font-semibold text-foreground truncate">
        {label}
      </span>
      <Pencil className="h-3 w-3 text-foreground/35 group-hover/title:text-foreground/70 transition-colors shrink-0" />
    </button>
  );
}

function UploadGlyph({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        "h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center transition-transform duration-200",
        active && "scale-110"
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6 text-primary"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    </div>
  );
}

function ExistingCampaignPicker({
  campaigns,
  onPick,
  onCancel,
}: {
  campaigns: CampaignSummary[];
  onPick: (tag: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <select
        autoFocus
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value);
        }}
        defaultValue=""
        className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
      >
        <option value="">Choose…</option>
        {campaigns.map((c) => (
          <option key={c.tag} value={c.tag}>
            {c.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onCancel}
        className="text-foreground/55 hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PoolPreviewCard — populated state with actions + drop-more support
// ─────────────────────────────────────────────────────────────────────

/**
 * One calm surface — the campaign card.
 *
 * Drop anywhere on it. Server thumbnails and in-flight uploads merge
 * into a single tile row, so there's never a "X added" duplicate
 * strip. The whole card is the drop affordance; the small "+" tile
 * at the end is the click-to-pick fallback.
 */

interface ServerThumb {
  id: string;
  url: string;
  mime_type: string | null;
}

function PoolPreviewCard({
  campaign,
  campaigns,
  items,
  onChange,
  onAddFiles,
  onRemoveItem,
  onRefresh,
}: {
  campaign: CampaignSummary;
  campaigns: CampaignSummary[];
  items: UploadItem[];
  onChange: (tag: string) => void;
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveItem: (id: string) => void;
  onRefresh: () => void;
}) {
  const [thumbs, setThumbs] = useState<ServerThumb[]>([]);
  const [dragging, setDragging] = useState(false);
  const [picking, setPicking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Server thumbs — refetched whenever the campaign or its asset count
  // changes (the latter being our signal that a new upload landed).
  useEffect(() => {
    if (campaign.asset_count === 0 && items.length === 0) {
      setThumbs([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/media?kind=quest_asset&group=${encodeURIComponent(campaign.tag)}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (cancelled || !res.ok) return;
        setThumbs(
          (json.data ?? []).slice(0, 8).map(
            (r: { id: string; url: string; mime_type: string | null }) => ({
              id: r.id,
              url: r.url,
              mime_type: r.mime_type ?? null,
            })
          )
        );
      } catch {
        // Tolerated — strip will simply show fewer tiles.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.tag, campaign.asset_count]);

  const inFlightCount = items.filter(
    (i) => i.status !== "done" && i.status !== "failed"
  ).length;
  const failedCount = items.filter((i) => i.status === "failed").length;

  // Dedupe: a server thumb whose id matches a local item's mediaId
  // means the upload has landed; skip it from the server side so it
  // doesn't appear twice while the success flash is on screen.
  const localMediaIds = new Set(
    items.map((i) => i.mediaId).filter(Boolean) as string[]
  );
  const dedupedThumbs = thumbs.filter((t) => !localMediaIds.has(t.id));
  const totalShown = items.length + dedupedThumbs.length;
  const overflowCount = Math.max(0, campaign.asset_count - dedupedThumbs.length);

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={(e) => {
          // Only reset when leaving the card, not its children.
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onAddFiles(e.dataTransfer.files);
        }}
        className={cn(
          "relative rounded-xl border bg-card transition-all duration-200 overflow-hidden",
          dragging
            ? "border-primary shadow-[0_0_0_3px_rgb(var(--color-primary)/0.15)]"
            : "border-border/40 hover:border-primary/25"
        )}
      >
        {/* Top-right utility actions — small, unobtrusive */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
          {campaigns.length > 1 && (
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              className={cn(
                "h-7 w-7 rounded-md flex items-center justify-center text-foreground/55 hover:text-foreground hover:bg-foreground/[0.05] transition-colors",
                "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2",
                picking && "bg-foreground/[0.06] text-foreground"
              )}
              aria-label="Switch campaign"
              title="Switch campaign"
            >
              <SwapIcon />
            </button>
          )}
          <Link
            href={`/admin/library?campaign=${encodeURIComponent(campaign.tag)}`}
            target="_blank"
            className="h-7 w-7 rounded-md flex items-center justify-center text-foreground/55 hover:text-foreground hover:bg-foreground/[0.05] transition-colors focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
            aria-label="Open in library"
            title="Open in library"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="px-4 sm:px-5 pt-4 pb-4">
          {/* Header */}
          <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.16em] text-foreground/55">
            Pool
          </p>
          <CampaignNameInline
            label={campaign.label}
            tag={campaign.tag}
            onRenamed={onRefresh}
          />
          <p className="mt-0.5 text-xs text-foreground/55 tabular-nums flex flex-wrap items-center gap-x-1.5">
            <span>
              {campaign.asset_count}{" "}
              {campaign.asset_count === 1 ? "asset" : "assets"}
            </span>
            {(campaign.image_count > 0 || campaign.video_count > 0) && (
              <span aria-hidden="true">·</span>
            )}
            {(campaign.image_count > 0 || campaign.video_count > 0) && (
              <span>
                {campaign.image_count} images · {campaign.video_count} videos
              </span>
            )}
            {inFlightCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Adding {inFlightCount}…
                </span>
              </>
            )}
            {failedCount > 0 && inFlightCount === 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-destructive">
                  {failedCount} failed
                </span>
              </>
            )}
          </p>

          {/* Switch panel — only when active */}
          {picking && campaigns.length > 1 && (
            <div className="mt-3">
              <SwitchCampaignList
                current={campaign.tag}
                campaigns={campaigns}
                onPick={(tag) => {
                  if (tag !== campaign.tag) onChange(tag);
                  setPicking(false);
                }}
                onCancel={() => setPicking(false)}
              />
            </div>
          )}

          {/* Tile strip — single source of truth for what's in the pool.
              Local items first (with status overlays), then deduped
              server thumbs, then a "+N more" tile if there are extras
              not loaded, and finally the click-to-pick "+" tile. */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {items.map((item) => (
              <UploadingTile
                key={item.id}
                item={item}
                onRemove={() => onRemoveItem(item.id)}
              />
            ))}
            {dedupedThumbs.map((thumb) => (
              <ServerTile key={thumb.id} thumb={thumb} />
            ))}
            {overflowCount > 0 && (
              <div className="aspect-square w-20 sm:w-24 rounded-lg bg-foreground/[0.04] flex items-center justify-center shrink-0 border border-border/30">
                <span className="text-xs font-medium text-foreground/60 tabular-nums">
                  +{overflowCount}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="aspect-square w-20 sm:w-24 rounded-lg shrink-0 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-primary/30 bg-primary/[0.02] hover:border-primary/55 hover:bg-primary/[0.05] text-primary transition-all focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
              aria-label="Add more assets"
            >
              <Plus className="h-4 w-4" />
              <span className="text-[10px] font-medium">Add</span>
            </button>
          </div>

          {/* Helper line — only when actually useful (low or empty pool). */}
          {campaign.asset_count === 0 && inFlightCount === 0 ? (
            <p className="mt-3 text-[11px] text-warning">
              Drop images or videos here to fill this pool.
            </p>
          ) : campaign.asset_count > 0 && campaign.asset_count < 10 && inFlightCount === 0 ? (
            <p className="mt-3 text-[11px] text-foreground/55">
              Reps see {campaign.asset_count} of up to 10. Add more for
              variety.
            </p>
          ) : null}

          {/* Suppress unused linter warning on totalShown — used as a
              stable reference for future analytics; keeping it computed
              avoids a re-add later. */}
          {void totalShown}
        </div>

        {/* Drag overlay — full card primary tint with centered copy. */}
        {dragging && (
          <div className="absolute inset-0 bg-primary/[0.08] backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
            <div className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg">
              Drop to add to “{campaign.label}”
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            onAddFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}

function SwapIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="M2 5h10l-2-2" />
      <path d="M14 11H4l2 2" />
    </svg>
  );
}

/**
 * Inline switcher — sits inside the card when the host clicks the
 * top-right swap icon. List of OTHER campaigns (current excluded) sorted
 * newest-first, with a search if there are many.
 */
function SwitchCampaignList({
  current,
  campaigns,
  onPick,
  onCancel,
}: {
  current: string;
  campaigns: CampaignSummary[];
  onPick: (tag: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const draftRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) draftRef.current?.focus();
  }, [creating]);

  const sorted = [...campaigns]
    .filter((c) => c.tag !== current)
    .sort(
      (a, b) =>
        new Date(b.first_seen_at).getTime() -
        new Date(a.first_seen_at).getTime()
    );
  const filtered = query.trim()
    ? sorted.filter((c) =>
        c.label.toLowerCase().includes(query.trim().toLowerCase())
      )
    : sorted;

  const submitNew = useCallback(async () => {
    const label = draft.trim();
    if (!label || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/media/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't create");
        return;
      }
      onPick(json.data.tag);
      setCreating(false);
      setDraft("");
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }, [draft, busy, onPick]);

  if (creating) {
    return (
      <div className="rounded-md border border-border/50 bg-background/80 overflow-hidden">
        <div className="px-3 py-2 border-b border-border/40">
          <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.16em] text-foreground/60">
            New campaign
          </p>
        </div>
        <div className="p-3 space-y-2">
          <input
            ref={draftRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Spring 26 push"
            maxLength={80}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitNew();
              } else if (e.key === "Escape") {
                setCreating(false);
                setDraft("");
              }
            }}
            className="w-full h-9 rounded-md border border-border/60 bg-background px-2.5 text-sm text-foreground placeholder:text-foreground/45 focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
          />
          {error && (
            <p className="text-[11px] text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <AdminButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setCreating(false);
                setDraft("");
                setError("");
              }}
            >
              Back
            </AdminButton>
            <AdminButton
              type="button"
              variant="primary"
              size="sm"
              loading={busy}
              disabled={!draft.trim() || busy}
              onClick={() => void submitNew()}
            >
              Create + use
            </AdminButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border/50 bg-background/80 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search campaigns…"
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          className="flex-1 h-8 rounded-md bg-transparent px-1 text-sm placeholder:text-foreground/45 focus-visible:outline-none"
        />
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-foreground/55 hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      {filtered.length === 0 ? (
        <p className="px-3 py-3 text-xs text-foreground/55">
          {sorted.length === 0 ? "No other campaigns." : "No matches."}
        </p>
      ) : (
        <ul className="max-h-44 overflow-y-auto py-1">
          {filtered.map((c) => (
            <li key={c.tag}>
              <button
                type="button"
                onClick={() => onPick(c.tag)}
                className="w-full text-left px-3 py-2 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.04] focus-visible:outline-none flex items-center justify-between gap-3"
              >
                <span className="text-sm font-medium text-foreground truncate">
                  {c.label}
                </span>
                <span className="text-xs text-foreground/55 tabular-nums shrink-0">
                  {c.asset_count}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-border/40">
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setError("");
            setDraft(query.trim());
          }}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/[0.04] transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New campaign
        </button>
      </div>
    </div>
  );
}

/**
 * A tile in the strip representing a server-resolved asset.
 */
function ServerTile({ thumb }: { thumb: ServerThumb }) {
  const isVideo = (thumb.mime_type ?? "").startsWith("video/");
  return (
    <div className="relative aspect-square w-20 sm:w-24 rounded-lg overflow-hidden bg-foreground/[0.06] shrink-0 border border-border/30">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumb.url}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
      />
      {isVideo && (
        <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-background/70 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <span className="block h-0 w-0 border-y-[3px] border-y-transparent border-l-[5px] border-l-foreground translate-x-[1px]" />
        </div>
      )}
    </div>
  );
}

/**
 * A tile in the strip representing a local upload — shows the file
 * preview from a blob URL, with a status overlay and remove affordance.
 * Replaces the previous separate "X added" strip.
 */
function UploadingTile({
  item,
  onRemove,
}: {
  item: UploadItem;
  onRemove: () => void;
}) {
  const inFlight =
    item.status === "preparing" ||
    item.status === "uploading" ||
    item.status === "processing-video" ||
    item.status === "queued";
  const done = item.status === "done";
  const failed = item.status === "failed";

  return (
    <div className="group relative aspect-square w-20 sm:w-24 rounded-lg overflow-hidden bg-foreground/[0.06] shrink-0 border border-border/30">
      {item.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.previewUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <video
          src={item.previewUrl}
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {inFlight && (
        <div className="absolute inset-0 bg-background/65 backdrop-blur-[1px] flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      )}
      {done && (
        <div className="absolute bottom-1.5 right-1.5 h-5 w-5 rounded-full bg-success/95 flex items-center justify-center shadow-sm">
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        </div>
      )}
      {failed && (
        <div
          className="absolute inset-0 bg-destructive/15 flex items-center justify-center"
          title={item.error ?? "failed"}
        >
          <X className="h-4 w-4 text-destructive" />
        </div>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-background/85 text-foreground hover:bg-destructive hover:text-white flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
        aria-label="Remove"
      >
        <X className="h-3 w-3" strokeWidth={2.5} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Remove handler — pre-upload removes from queue, post-upload calls
// DELETE so the asset really leaves the campaign.
// ─────────────────────────────────────────────────────────────────────

async function removeItem(
  id: string,
  items: UploadItem[],
  setItems: React.Dispatch<React.SetStateAction<UploadItem[]>>
) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  // Always release the object-URL.
  try {
    URL.revokeObjectURL(item.previewUrl);
  } catch {
    /* tolerated */
  }
  // If the file is already on the server, delete it so the user's intent
  // ("X this off the campaign") matches reality.
  if (item.status === "done" && item.mediaId) {
    try {
      await fetch(`/api/admin/media/${item.mediaId}?force=true`, {
        method: "DELETE",
      });
    } catch {
      /* leave the row visible if the delete fails */
    }
  }
  setItems((prev) => prev.filter((i) => i.id !== id));
}

// ─────────────────────────────────────────────────────────────────────
// Upload pipelines (image / video) — campaign-scoped
// ─────────────────────────────────────────────────────────────────────

async function uploadImageToCampaign(
  item: UploadItem,
  campaignTag: string,
  patchItem: (id: string, patch: Partial<UploadItem>) => void
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
  if (!putRes.ok) throw new Error("Storage upload failed");

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
  const completeJson = await completeRes.json().catch(() => ({}));
  patchItem(item.id, {
    status: "done",
    mediaId: completeJson?.data?.id,
  });
}

async function uploadVideoToCampaign(
  item: UploadItem,
  campaignTag: string,
  patchItem: (id: string, patch: Partial<UploadItem>) => void
) {
  if (item.file.size > VIDEO_MAX_BYTES) {
    throw new Error(`That video's a bit big — try under 200 MB`);
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
      campaign_tag: isValidCampaignTag(campaignTag)
        ? campaignTag
        : slugifyCampaignLabel(campaignTag),
    }),
  });
  if (!completeRes.ok) {
    const j = await completeRes.json().catch(() => ({}));
    throw new Error(j.error ?? "Failed to record video");
  }
  const completeJson = await completeRes.json().catch(() => ({}));
  patchItem(item.id, {
    status: "done",
    mediaId: completeJson?.data?.id,
  });
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
      // retry
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
