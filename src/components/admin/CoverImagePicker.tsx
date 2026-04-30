"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Image as ImageIcon,
  Library,
  Upload,
  Sparkles,
  Trash2,
  Check,
  Loader2,
  X,
} from "lucide-react";
import {
  QUEST_COVER_TEMPLATES,
  QUEST_COVER_TEMPLATE_CATEGORIES,
  findQuestCoverTemplateByUrl,
  type QuestCoverTemplateCategory,
} from "@/lib/quest-cover-templates";
import {
  TENANT_MEDIA_KINDS,
  type TenantMediaKind,
} from "@/lib/uploads/tenant-media-config";
import { cn } from "@/lib/utils";

interface TenantMediaRow {
  id: string;
  url: string;
  source: "upload" | "template" | "instagram";
  width: number | null;
  height: number | null;
  created_at: string;
  usage_count: number;
}

type Tab = "templates" | "library" | "upload";

export interface CoverImagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current cover_image_url. Used to highlight initial selection. */
  value: string;
  onChange: (url: string) => void;
  /** Quest title to mock in the live preview (helps the user judge legibility). */
  previewTitle?: string;
  /** Promoter accent (defaults to primary violet). Drives the live preview chips. */
  previewAccent?: string;
  kind?: TenantMediaKind;
}

export function CoverImagePicker({
  open,
  onOpenChange,
  value,
  onChange,
  previewTitle = "Your quest title",
  previewAccent = "#8B5CF6",
  kind = "quest_cover",
}: CoverImagePickerProps) {
  // Initial tab — if the existing value is a template URL, open Templates;
  // if it's a stored library URL, open Library; otherwise Upload (most likely
  // first-time empty state).
  const initialTab: Tab = useMemo(() => {
    if (!value) return "templates";
    if (findQuestCoverTemplateByUrl(value)) return "templates";
    return "library";
  }, [value]);

  const [tab, setTab] = useState<Tab>(initialTab);
  const [selected, setSelected] = useState(value);

  // Reset selection when the picker re-opens — the parent's "value" is the
  // source of truth, not the picker's local state from a previous session.
  useEffect(() => {
    if (open) {
      setSelected(value);
      setTab(initialTab);
    }
  }, [open, value, initialTab]);

  const handleConfirm = useCallback(() => {
    onChange(selected);
    onOpenChange(false);
  }, [onChange, selected, onOpenChange]);

  const handleClear = useCallback(() => {
    onChange("");
    onOpenChange(false);
  }, [onChange, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Choose a cover image</DialogTitle>

        <div className="flex h-[min(82vh,720px)] flex-col">
          {/* Header */}
          <div className="border-b border-border/60 px-5 py-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Cover image
              </p>
              <h2 className="text-base font-semibold text-foreground mt-0.5">
                Pick a cover
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-border/60 px-5">
            <div className="flex gap-1">
              <TabBtn active={tab === "templates"} onClick={() => setTab("templates")} icon={<Sparkles size={14} />}>
                Templates
              </TabBtn>
              <TabBtn active={tab === "library"} onClick={() => setTab("library")} icon={<Library size={14} />}>
                Your library
              </TabBtn>
              <TabBtn active={tab === "upload"} onClick={() => setTab("upload")} icon={<Upload size={14} />}>
                Upload new
              </TabBtn>
            </div>
          </div>

          {/* Body — split: grid (left) + preview rail (right) */}
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5">
              {tab === "templates" && (
                <TemplateGrid selected={selected} onSelect={setSelected} />
              )}
              {tab === "library" && (
                <LibraryGrid
                  kind={kind}
                  selected={selected}
                  onSelect={setSelected}
                  onSwitchToUpload={() => setTab("upload")}
                  onSwitchToTemplates={() => setTab("templates")}
                />
              )}
              {tab === "upload" && (
                <UploadPane
                  kind={kind}
                  onUploaded={(url) => {
                    setSelected(url);
                    setTab("library");
                  }}
                />
              )}
            </div>

            {/* Preview rail — desktop only */}
            <div className="hidden lg:block w-[260px] shrink-0 border-l border-border/60 bg-muted/10 p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
                Preview
              </p>
              <PhonePreview cover={selected} title={previewTitle} accent={previewAccent} />
              <p className="text-[11px] leading-relaxed text-muted-foreground mt-4">
                iOS overlays the title and chips on top — pick something where they&rsquo;ll stay readable.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border/60 px-5 py-3 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 size={14} className="mr-1.5" />
              Clear cover
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirm}
                disabled={!selected || selected === value}
              >
                <Check size={14} className="mr-1.5" />
                Use this image
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function TemplateGrid({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (url: string) => void;
}) {
  const [category, setCategory] = useState<QuestCoverTemplateCategory | "All">("All");
  const filtered =
    category === "All"
      ? QUEST_COVER_TEMPLATES
      : QUEST_COVER_TEMPLATES.filter((t) => t.category === category);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <CategoryChip active={category === "All"} onClick={() => setCategory("All")}>
          All
        </CategoryChip>
        {QUEST_COVER_TEMPLATE_CATEGORIES.map((c) => (
          <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)}>
            {c}
          </CategoryChip>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {filtered.map((t) => (
          <Tile
            key={t.id}
            url={t.url}
            label={t.name}
            selected={selected === t.url}
            onSelect={() => onSelect(t.url)}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 rounded-full px-3 text-xs font-medium transition-colors border",
        active
          ? "bg-primary/10 border-primary/30 text-primary"
          : "bg-transparent border-border text-muted-foreground hover:text-foreground hover:border-border/80"
      )}
    >
      {children}
    </button>
  );
}

function LibraryGrid({
  kind,
  selected,
  onSelect,
  onSwitchToUpload,
  onSwitchToTemplates,
}: {
  kind: TenantMediaKind;
  selected: string;
  onSelect: (url: string) => void;
  onSwitchToUpload: () => void;
  onSwitchToTemplates: () => void;
}) {
  const [rows, setRows] = useState<TenantMediaRow[] | null>(null);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/admin/media?kind=${kind}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load library");
        setRows([]);
        return;
      }
      setRows(json.data ?? []);
    } catch {
      setError("Network error");
      setRows([]);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = useCallback(
    async (id: string, inUseCount: number) => {
      const force = inUseCount > 0;
      const confirmMsg = force
        ? `This image is used by ${inUseCount} quest${inUseCount === 1 ? "" : "s"}. Remove from library anyway? (Quests already using it keep working.)`
        : "Remove this image from your library?";
      if (!window.confirm(confirmMsg)) return;
      setDeletingId(id);
      try {
        const res = await fetch(`/api/admin/media/${id}${force ? "?force=true" : ""}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setRows((prev) => prev?.filter((r) => r.id !== id) ?? null);
        }
      } finally {
        setDeletingId(null);
      }
    },
    []
  );

  if (rows === null) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] rounded-md bg-foreground/[0.04] animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12 px-6">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
          <ImageIcon size={20} className="text-primary" />
        </div>
        <h3 className="text-base font-semibold text-foreground">Your library is empty</h3>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">
          Every cover you upload is saved here for the next quest. Start with a template or upload your first image.
        </p>
        <div className="flex gap-2 mt-5">
          <Button size="sm" onClick={onSwitchToUpload}>
            <Upload size={14} className="mr-1.5" />
            Upload image
          </Button>
          <Button size="sm" variant="ghost" onClick={onSwitchToTemplates}>
            Browse templates
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {rows.map((r) => (
        <Tile
          key={r.id}
          url={r.url}
          selected={selected === r.url}
          onSelect={() => onSelect(r.url)}
          badge={
            r.usage_count > 0 ? (
              <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/55 text-white">
                Used {r.usage_count}×
              </span>
            ) : null
          }
          action={
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(r.id, r.usage_count);
              }}
              disabled={deletingId === r.id}
              className="p-1.5 rounded-md bg-black/55 text-white/80 hover:text-destructive hover:bg-black/70 transition-colors"
              aria-label="Delete from library"
            >
              {deletingId === r.id ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} />
              )}
            </button>
          }
        />
      ))}
    </div>
  );
}

function UploadPane({
  kind,
  onUploaded,
}: {
  kind: TenantMediaKind;
  onUploaded: (url: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ phase: string; pct: number } | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError("");
      const cap = TENANT_MEDIA_KINDS[kind].maxBytes;
      if (file.size > cap) {
        setError(`File too large. Max ${Math.round(cap / 1024 / 1024)}MB.`);
        return;
      }
      if (!file.type.startsWith("image/")) {
        setError("Only images are supported.");
        return;
      }

      try {
        // Measure dimensions locally so we can store them in tenant_media.
        const dims = await readImageDimensions(file);

        setProgress({ phase: "Preparing upload…", pct: 5 });
        const signedRes = await fetch("/api/admin/media/signed-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            content_type: file.type,
            size_bytes: file.size,
          }),
        });
        const signedJson = await signedRes.json();
        if (!signedRes.ok || !signedJson.data) {
          setError(signedJson.error || "Upload failed");
          setProgress(null);
          return;
        }

        setProgress({ phase: "Uploading…", pct: 25 });
        const putRes = await fetch(signedJson.data.upload_url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!putRes.ok) {
          setError("Upload to storage failed");
          setProgress(null);
          return;
        }

        setProgress({ phase: "Saving…", pct: 80 });
        const completeRes = await fetch("/api/admin/media/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: signedJson.data.key,
            kind,
            width: dims?.width ?? null,
            height: dims?.height ?? null,
          }),
        });
        const completeJson = await completeRes.json();
        if (!completeRes.ok || !completeJson.data) {
          setError(completeJson.error || "Failed to finalise upload");
          setProgress(null);
          return;
        }

        setProgress({ phase: "Done", pct: 100 });
        onUploaded(completeJson.data.url);
        setTimeout(() => setProgress(null), 400);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setProgress(null);
      }
    },
    [kind, onUploaded]
  );

  return (
    <div
      className={cn(
        "rounded-xl border-2 border-dashed transition-colors p-12 text-center",
        dragging
          ? "border-primary/60 bg-primary/5"
          : "border-border/60 hover:border-primary/30"
      )}
      onClick={() => !progress && fileRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) void handleFile(file);
      }}
      role="button"
      tabIndex={0}
    >
      <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Upload size={22} className="text-primary" />
      </div>
      <h3 className="text-base font-semibold text-foreground">
        {progress ? progress.phase : "Drop an image to upload"}
      </h3>
      <p className="text-sm text-muted-foreground mt-1.5">
        {progress
          ? "Don't close this dialog — almost there."
          : `JPG, PNG, or WebP · up to ${Math.round(TENANT_MEDIA_KINDS[kind].maxBytes / 1024 / 1024)}MB`}
      </p>

      {progress && (
        <div className="mt-5 mx-auto max-w-xs h-1.5 rounded-full bg-foreground/10 overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      )}

      {!progress && (
        <Button size="sm" className="mt-5" type="button">
          Choose file
        </Button>
      )}

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      <p className="mt-6 text-[11px] text-muted-foreground/70 max-w-sm mx-auto">
        Saved to your library — pick it again next time without re-uploading.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Tile({
  url,
  label,
  selected,
  onSelect,
  badge,
  action,
}: {
  url: string;
  label?: string;
  selected: boolean;
  onSelect: () => void;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative aspect-[3/4] rounded-md overflow-hidden border-2 transition-all text-left",
        selected
          ? "border-primary ring-2 ring-primary/40"
          : "border-transparent hover:border-border/80"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label ?? ""}
        className={cn(
          "w-full h-full object-cover transition-transform duration-200",
          !selected && "group-hover:scale-[1.03]"
        )}
      />
      {badge && (
        <div className="absolute top-2 left-2">{badge}</div>
      )}
      {action && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {action}
        </div>
      )}
      {selected && (
        <div className="absolute bottom-2 right-2 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
          <Check size={14} strokeWidth={3} />
        </div>
      )}
      {label && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
          <p className="text-[11px] font-medium text-white/90 truncate">{label}</p>
        </div>
      )}
    </button>
  );
}

function PhonePreview({
  cover,
  title,
  accent,
}: {
  cover: string;
  title: string;
  accent: string;
}) {
  return (
    <div className="mx-auto w-[200px] aspect-[3/4] rounded-2xl overflow-hidden border border-border/60 bg-card relative shadow-lg">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full"
          style={{
            background: `linear-gradient(140deg, ${accent}33 0%, ${accent}11 60%, transparent 100%), #18181b`,
          }}
        />
      )}
      {/* iOS-style overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3 flex flex-col gap-2">
        <div className="flex gap-1.5">
          <span
            className="text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: `${accent}40`, color: "#fff" }}
          >
            +250 XP
          </span>
          <span className="text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/15 text-white">
            +120 EP
          </span>
        </div>
        <p className="text-[13px] font-bold text-white leading-tight line-clamp-2">
          {title}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

async function readImageDimensions(
  file: File
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const out = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
