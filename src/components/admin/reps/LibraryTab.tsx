"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Loader2,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { AdminEmptyState, AdminPageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TENANT_MEDIA_KINDS,
  type TenantMediaKind,
} from "@/lib/uploads/tenant-media-config";
import { cn } from "@/lib/utils";

interface MediaRow {
  id: string;
  url: string;
  source: "upload" | "template" | "instagram";
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
  usage_count: number;
}

type SortMode = "recent" | "popular";

/**
 * Library tab for /admin/reps — central place to bulk-manage cover images.
 *
 * The inline picker (in the quest editor) is the primary surface; this is
 * for housekeeping: see what you've got, delete unused, bulk-upload before
 * a busy week.
 */
export function LibraryTab() {
  const kind: TenantMediaKind = "quest_cover";
  const [rows, setRows] = useState<MediaRow[] | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/admin/media?kind=${kind}&sort=${sort}`, {
        cache: "no-store",
      });
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
  }, [kind, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = useCallback(
    async (id: string, inUseCount: number) => {
      const force = inUseCount > 0;
      const msg = force
        ? `This image is used by ${inUseCount} quest${
            inUseCount === 1 ? "" : "s"
          }. Remove from library anyway? (Existing quests keep working.)`
        : "Remove this image from your library?";
      if (!window.confirm(msg)) return;
      setDeletingId(id);
      try {
        const res = await fetch(
          `/api/admin/media/${id}${force ? "?force=true" : ""}`,
          { method: "DELETE" }
        );
        if (res.ok) {
          setRows((prev) => prev?.filter((r) => r.id !== id) ?? null);
        }
      } finally {
        setDeletingId(null);
      }
    },
    []
  );

  const visible = useMemo(() => {
    if (!rows) return null;
    if (!search.trim()) return rows;
    // No tags or filenames to search yet — leave search wired up so it stays
    // useful when we add titles/tags. For now, search by id prefix.
    const q = search.trim().toLowerCase();
    return rows.filter((r) => r.id.toLowerCase().startsWith(q));
  }, [rows, search]);

  const totalBytes = (rows ?? [])
    .filter((r) => r.source === "upload" && r.file_size_bytes)
    .reduce((acc, r) => acc + (r.file_size_bytes ?? 0), 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Cover library"
        subtitle={
          rows === null
            ? "Loading…"
            : rows.length === 0
            ? "Empty — your first upload will land here"
            : `${rows.length} cover${rows.length === 1 ? "" : "s"} · ${formatBytes(totalBytes)} stored`
        }
        actions={
          <BulkUploadButton kind={kind} onUploaded={() => void load()} />
        }
      />

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-8 h-9"
          />
        </div>
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          <SortBtn active={sort === "recent"} onClick={() => setSort("recent")}>
            Recent
          </SortBtn>
          <SortBtn active={sort === "popular"} onClick={() => setSort("popular")}>
            Most used
          </SortBtn>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {visible === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] rounded-md bg-foreground/[0.04] animate-pulse"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        rows && rows.length === 0 ? (
          <AdminEmptyState
            icon={<ImageIcon size={20} />}
            title="No covers yet"
            description="Every cover you upload from the quest editor is saved here. Upload in bulk to seed your library before a busy week."
            primaryAction={
              <BulkUploadButton kind={kind} onUploaded={() => void load()} />
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No matches.
          </p>
        )
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {visible.map((r) => (
            <LibraryTile
              key={r.id}
              row={r}
              deleting={deletingId === r.id}
              onDelete={() => void handleDelete(r.id, r.usage_count)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SortBtn({
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
        "h-7 rounded-sm px-2.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function LibraryTile({
  row,
  deleting,
  onDelete,
}: {
  row: MediaRow;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="group relative aspect-[3/4] rounded-md overflow-hidden border border-border/60">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={row.url}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2.5">
        {row.usage_count > 0 ? (
          <p className="text-[10px] font-mono uppercase tracking-wider text-white/85">
            Used {row.usage_count}×
          </p>
        ) : (
          <p className="text-[10px] font-mono uppercase tracking-wider text-white/55">
            Unused
          </p>
        )}
        <p className="text-[10px] text-white/55 mt-0.5">
          {formatRelative(row.created_at)}
        </p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-black/55 text-white/80 hover:text-destructive hover:bg-black/75 transition-colors opacity-0 group-hover:opacity-100 focus-within:opacity-100"
        aria-label="Delete from library"
      >
        {deleting ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Trash2 size={12} />
        )}
      </button>
    </div>
  );
}

function BulkUploadButton({
  kind,
  onUploaded,
}: {
  kind: TenantMediaKind;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(
    null
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const cap = TENANT_MEDIA_KINDS[kind].maxBytes;

  const handleFiles = useCallback(
    async (files: FileList) => {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (!list.length) return;
      setUploading({ done: 0, total: list.length });
      let done = 0;
      for (const file of list) {
        if (file.size > cap) {
          done += 1;
          setUploading({ done, total: list.length });
          continue;
        }
        try {
          const dims = await readDims(file);
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
          if (!signedRes.ok || !signedJson.data) continue;

          const putRes = await fetch(signedJson.data.upload_url, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
          });
          if (!putRes.ok) continue;

          await fetch("/api/admin/media/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: signedJson.data.key,
              kind,
              width: dims?.width ?? null,
              height: dims?.height ?? null,
            }),
          });
        } catch {
          // Fail-quiet on individual file — keep going through the batch.
        }
        done += 1;
        setUploading({ done, total: list.length });
      }
      setUploading(null);
      onUploaded();
    },
    [kind, cap, onUploaded]
  );

  return (
    <>
      <Button
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={!!uploading}
      >
        {uploading ? (
          <>
            <Loader2 size={14} className="animate-spin mr-1.5" />
            Uploading {uploading.done}/{uploading.total}…
          </>
        ) : (
          <>
            <Upload size={14} className="mr-1.5" />
            Bulk upload
          </>
        )}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

async function readDims(
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

