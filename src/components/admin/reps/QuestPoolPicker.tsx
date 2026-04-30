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
  // Empty state → drop zone with auto-create.
  if (!campaignTag || !activeCampaign) {
    return (
      <PoolDropZone
        campaigns={campaigns}
        questTitle={questTitle}
        onPick={(tag) => {
          onPick(tag);
          onRefresh();
        }}
        onRefresh={onRefresh}
      />
    );
  }

  // Populated state → rich preview card with actions.
  return (
    <PoolPreviewCard
      campaign={activeCampaign}
      campaigns={campaigns ?? []}
      onChange={(tag) => {
        onPick(tag);
        onRefresh();
      }}
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
  onPick,
  onRefresh,
}: {
  campaigns: CampaignSummary[] | null;
  questTitle: string;
  onPick: (tag: string) => void;
  onRefresh: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [picking, setPicking] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<UploadItem[]>([]);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const inFlight = items.some(
    (i) => i.status !== "done" && i.status !== "failed"
  );

  const ensureCampaign = useCallback(
    async (label: string): Promise<string> => {
      const res = await fetch("/api/admin/media/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't create campaign");
      return json.data.tag as string;
    },
    []
  );

  const enqueue = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    const next: UploadItem[] = arr.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: f,
      previewUrl: URL.createObjectURL(f),
      kind: f.type.startsWith("video/") ? "video" : "image",
      status: "queued",
    }));
    setItems((prev) => [...prev, ...next]);
  }, []);

  const handleDrop = useCallback(
    async (files: FileList | File[]) => {
      if (files.length === 0) return;
      // Auto-name the campaign after the quest title (or fall back).
      const seed = questTitle.trim() || `Campaign ${new Date().toLocaleDateString()}`;
      try {
        const tag = await ensureCampaign(seed);
        onPick(tag);
        // The picker switches to populated state on the next render —
        // but we still want the upload progress visible. We hand off
        // the queue items to the populated state via the parent's
        // refresh, with the campaign tag now in scope. For v1 we just
        // upload here in the empty-state component before the unmount.
        enqueue(files);
        // Run the queue against the new tag.
        void runQueue(tag);
      } catch (err) {
        // Surface — for now log; UI shows generic error.
        console.error(err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ensureCampaign, onPick, questTitle]
  );

  const patchItem = useCallback(
    (id: string, patch: Partial<UploadItem>) => {
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
      );
    },
    []
  );

  const runQueue = useCallback(
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
      }
    },
    [onRefresh, patchItem]
  );

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
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleDrop(e.dataTransfer.files);
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

        {/* Existing-campaign picker (right half on desktop) — only
            rendered when the tenant actually has campaigns to pick. */}
        {hasCampaigns && (
          <ExistingCampaignPanel
            campaigns={campaigns ?? []}
            onPick={(tag) => {
              onPick(tag);
              setPicking(false);
            }}
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
            void handleDrop(e.target.files);
            e.target.value = "";
          }
        }}
      />

      {/* Tiny fallback — when the tenant has zero campaigns, leave a
          quiet "or" link in case they want to navigate to the library
          to start one without uploading. */}
      {!hasCampaigns && picking && (
        <div className="flex items-center justify-center gap-2 text-xs text-foreground/60">
          <span>or</span>
          <ExistingCampaignPicker
            campaigns={campaigns ?? []}
            onPick={(tag) => {
              onPick(tag);
              setPicking(false);
            }}
            onCancel={() => setPicking(false)}
          />
        </div>
      )}

      {items.length > 0 && (
        <UploadPreviewStrip
          items={items}
          onRemove={(id) => removeItem(id, items, setItems)}
        />
      )}
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

function PoolPreviewCard({
  campaign,
  campaigns,
  onChange,
  onRefresh,
}: {
  campaign: CampaignSummary;
  campaigns: CampaignSummary[];
  onChange: (tag: string) => void;
  onRefresh: () => void;
}) {
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [picking, setPicking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<UploadItem[]>([]);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Lazy thumbs.
  useEffect(() => {
    if (campaign.asset_count === 0) {
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
          (json.data ?? []).slice(0, 4).map((r: { url: string }) => r.url)
        );
      } catch {
        // Empty thumbs fall back gracefully.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign.tag, campaign.asset_count]);

  const patchItem = useCallback(
    (id: string, patch: Partial<UploadItem>) => {
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
      );
    },
    []
  );

  const runQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    try {
      while (true) {
        const queued = itemsRef.current.find((i) => i.status === "queued");
        if (!queued) break;
        patchItem(queued.id, { status: "preparing" });
        try {
          if (queued.kind === "image") {
            await uploadImageToCampaign(queued, campaign.tag, patchItem);
          } else {
            await uploadVideoToCampaign(queued, campaign.tag, patchItem);
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
    }
  }, [campaign.tag, onRefresh, patchItem]);

  const enqueueAndRun = useCallback(
    (files: FileList | File[]) => {
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
      // Kick off after state commits.
      setTimeout(() => void runQueue(), 0);
    },
    [runQueue]
  );

  const inFlight = items.some(
    (i) => i.status !== "done" && i.status !== "failed"
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          enqueueAndRun(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-xl border bg-card transition-colors duration-200",
          dragging
            ? "border-primary"
            : "border-border/40 hover:border-primary/30"
        )}
      >
        <div className="px-4 sm:px-5 pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.16em] text-foreground/55">
                Pool
              </p>
              <CampaignNameInline
                label={campaign.label}
                tag={campaign.tag}
                onRenamed={onRefresh}
              />
              <p className="mt-0.5 text-xs text-foreground/55 tabular-nums">
                {campaign.asset_count}{" "}
                {campaign.asset_count === 1 ? "asset" : "assets"}
                {campaign.image_count > 0 || campaign.video_count > 0 ? (
                  <>
                    {" · "}
                    {campaign.image_count} images · {campaign.video_count} videos
                  </>
                ) : null}
              </p>
            </div>
          </div>

          {/* Thumbnail strip */}
          <div className="mt-3 flex gap-2 overflow-hidden">
            {campaign.asset_count === 0 ? (
              <div className="rounded-md border border-dashed border-border/40 px-3 py-3 text-xs text-foreground/55 w-full text-center">
                Drop images or videos to fill this campaign.
              </div>
            ) : thumbs.length === 0 ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square w-16 sm:w-20 rounded-md bg-foreground/[0.04] animate-pulse shrink-0"
                />
              ))
            ) : (
              <>
                {thumbs.map((url, i) => (
                  <div
                    key={i}
                    className="relative aspect-square w-16 sm:w-20 rounded-md overflow-hidden bg-foreground/[0.06] shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
                {campaign.asset_count > thumbs.length && (
                  <div className="aspect-square w-16 sm:w-20 rounded-md bg-foreground/[0.04] flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-medium text-foreground/60 tabular-nums">
                      +{campaign.asset_count - thumbs.length}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Action row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <AdminButton
              type="button"
              size="sm"
              variant="outline"
              leftIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => fileRef.current?.click()}
            >
              Add more
            </AdminButton>
            <AdminButton
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setPicking((v) => !v)}
            >
              Change
            </AdminButton>
            <Link
              href={`/admin/library?campaign=${encodeURIComponent(campaign.tag)}`}
              target="_blank"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline ml-auto"
            >
              Open in library
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {picking && (
            <div className="mt-3">
              <select
                autoFocus
                value={campaign.tag}
                onChange={(e) => {
                  if (e.target.value && e.target.value !== campaign.tag) {
                    onChange(e.target.value);
                  }
                  setPicking(false);
                }}
                className="h-9 w-full rounded-md border border-border/60 bg-background px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
              >
                {campaigns.map((c) => (
                  <option key={c.tag} value={c.tag}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Helper hints */}
          {campaign.asset_count > 0 && campaign.asset_count < 10 && (
            <p className="mt-2 text-[11px] text-foreground/55">
              Reps will see all {campaign.asset_count} assets. Add more for
              variety.
            </p>
          )}
          {campaign.asset_count === 0 && (
            <p className="mt-2 text-[11px] text-warning">
              This campaign has no assets yet — reps won&apos;t see anything.
            </p>
          )}
        </div>

        {dragging && (
          <div className="border-t border-primary/40 bg-primary/[0.05] px-4 py-3 text-xs text-primary text-center">
            Drop to add to this campaign
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
            enqueueAndRun(e.target.files);
            e.target.value = "";
          }
        }}
      />

      {items.length > 0 && (
        <UploadPreviewStrip
          items={items}
          onRemove={(id) => removeItem(id, items, setItems)}
        />
      )}
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
// UploadPreviewStrip — thumbnail row replacing the old text-only list
// ─────────────────────────────────────────────────────────────────────

function UploadPreviewStrip({
  items,
  onRemove,
}: {
  items: UploadItem[];
  onRemove: (id: string) => void;
}) {
  const inFlight = items.some(
    (i) => i.status !== "done" && i.status !== "failed"
  );
  const done = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "failed").length;

  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/40 bg-card px-4 py-3">
      <div className="flex items-center gap-2 mb-2.5">
        {inFlight && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        )}
        <p className="text-xs font-medium text-foreground tabular-nums">
          {inFlight
            ? `Adding ${items.length - done - failed} of ${items.length}…`
            : `${done} added${failed > 0 ? `, ${failed} failed` : ""}`}
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {items.map((item) => (
          <PreviewTile key={item.id} item={item} onRemove={() => onRemove(item.id)} />
        ))}
      </div>
    </div>
  );
}

function PreviewTile({
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
    <div className="group relative aspect-square w-20 sm:w-24 rounded-md overflow-hidden bg-foreground/[0.06] shrink-0 border border-border/40">
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

      {/* Status overlay */}
      {inFlight && (
        <div className="absolute inset-0 bg-background/65 backdrop-blur-[1px] flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      )}
      {done && (
        <div className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-success/95 flex items-center justify-center shadow-sm">
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

      {/* Hover X — remove from queue (or delete from server if done) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className={cn(
          "absolute top-1 right-1 h-5 w-5 rounded-full bg-background/85 text-foreground hover:bg-destructive hover:text-white flex items-center justify-center transition-colors",
          inFlight ? "opacity-0 group-hover:opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        aria-label="Remove"
      >
        <X className="h-3 w-3" strokeWidth={2.5} />
      </button>
    </div>
  );
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
