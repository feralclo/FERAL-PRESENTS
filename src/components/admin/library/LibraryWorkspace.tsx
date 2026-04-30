"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Loader2,
  Plus,
  Search,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { AdminEmptyState, AdminPageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TENANT_MEDIA_KINDS,
  type TenantMediaKind,
} from "@/lib/uploads/tenant-media-config";
import { prepareUploadFile } from "@/lib/uploads/prepare-upload";
import { cn } from "@/lib/utils";

interface MediaRow {
  id: string;
  url: string;
  kind: TenantMediaKind;
  source: "upload" | "template" | "instagram";
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
  usage_count: number;
  group: string | null;
}

interface GroupSummary {
  name: string;
  count: number;
}

type KindFilter = "all" | "quest_cover" | "event_cover";
type SortMode = "recent" | "popular";

const KIND_LABEL: Record<KindFilter, string> = {
  all: "All",
  quest_cover: "Quest covers",
  event_cover: "Event covers",
};

const KIND_ASPECT: Record<TenantMediaKind, string> = {
  quest_cover: "3:4",
  event_cover: "1:1",
  reward_cover: "3:4",
  generic: "—",
};

/**
 * The cover library workspace.
 *
 * Multi-kind grid (quest + event covers, future kinds slot in via the
 * filter chip), with optional "group" labels for campaign-style organisation
 * (e.g. "Summer Series", "Bob Marley Tribute"). Group is a single string
 * stored as the first entry in tenant_media.tags[] — keeping the column
 * shape leaves room to add multi-tag later without migration.
 *
 * Used by /admin/library (top-level page) AND /admin/reps Library tab
 * (alias surface, kept for discoverability inside the rep flow).
 */
export function LibraryWorkspace({
  defaultKind = "all",
  embedded = false,
}: {
  defaultKind?: KindFilter;
  embedded?: boolean;
}) {
  const [rows, setRows] = useState<MediaRow[] | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [error, setError] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>(defaultKind);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("recent");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const load = useCallback(async () => {
    setError("");
    const params = new URLSearchParams();
    params.set("kind", kindFilter);
    if (groupFilter) params.set("group", groupFilter);
    params.set("sort", sort);
    try {
      const res = await fetch(`/api/admin/media?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load library");
        setRows([]);
        return;
      }
      setRows(json.data ?? []);
      setGroups(json.groups ?? []);
    } catch {
      setError("Network error");
      setRows([]);
    }
  }, [kindFilter, groupFilter, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = useCallback(
    async (id: string, inUseCount: number) => {
      const force = inUseCount > 0;
      const msg = force
        ? `In use by ${inUseCount} ${inUseCount === 1 ? "place" : "places"}. Remove from library? (Existing surfaces keep working.)`
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

  const startEditGroup = useCallback((row: MediaRow) => {
    setEditingId(row.id);
    setEditingValue(row.group ?? "");
  }, []);

  const cancelEditGroup = useCallback(() => {
    setEditingId(null);
    setEditingValue("");
  }, []);

  const saveEditGroup = useCallback(async () => {
    if (!editingId) return;
    const next = editingValue.trim();
    const id = editingId;
    setEditingId(null);
    setEditingValue("");
    try {
      const res = await fetch(`/api/admin/media/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group: next || null }),
      });
      if (res.ok) {
        const json = await res.json();
        setRows((prev) =>
          prev?.map((r) =>
            r.id === id ? { ...r, group: json.data.group } : r
          ) ?? null
        );
        // Refresh group counts.
        void load();
      }
    } catch {
      // Silent — UI already optimistically cleared the editor.
    }
  }, [editingId, editingValue, load]);

  const visible = useMemo(() => {
    if (!rows) return null;
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (r.group?.toLowerCase().includes(q) ?? false) ||
        r.id.toLowerCase().startsWith(q)
    );
  }, [rows, search]);

  const totalBytes = (rows ?? [])
    .filter((r) => r.source === "upload" && r.file_size_bytes)
    .reduce((acc, r) => acc + (r.file_size_bytes ?? 0), 0);

  return (
    <div className={cn("space-y-6", !embedded && "p-6 lg:p-8")}>
      <AdminPageHeader
        title="Cover library"
        subtitle={
          rows === null
            ? "Loading…"
            : rows.length === 0
            ? "Empty — your first upload lands here"
            : `${rows.length} cover${rows.length === 1 ? "" : "s"} · ${formatBytes(totalBytes)} stored`
        }
        actions={<BulkUploadButton onUploaded={() => void load()} groups={groups} />}
      />

      {/* Kind filter chips — always visible so admins know what they're seeing */}
      <div className="flex flex-wrap gap-1.5">
        {(["all", "quest_cover", "event_cover"] as const).map((k) => (
          <FilterChip
            key={k}
            active={kindFilter === k}
            onClick={() => setKindFilter(k)}
          >
            {KIND_LABEL[k]}
          </FilterChip>
        ))}
      </div>

      {/* Search + sort */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by group…"
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

      {/* Group filter row — only shown if any groups exist */}
      {groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            active={groupFilter === null}
            onClick={() => setGroupFilter(null)}
          >
            All groups
          </FilterChip>
          {groups.map((g) => (
            <FilterChip
              key={g.name}
              active={groupFilter === g.name}
              onClick={() =>
                setGroupFilter(groupFilter === g.name ? null : g.name)
              }
              icon={<Tag size={11} />}
            >
              {g.name}
              <span className="ml-1.5 text-[10px] text-muted-foreground/70">
                {g.count}
              </span>
            </FilterChip>
          ))}
        </div>
      )}

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
            description="Every cover you upload from a quest or event is saved here. Upload in bulk to seed your library, or organise by campaign with the group label."
            primaryAction={<BulkUploadButton onUploaded={() => void load()} groups={groups} />}
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
              editing={editingId === r.id}
              editingValue={editingValue}
              groupSuggestions={groups.map((g) => g.name)}
              onDelete={() => void handleDelete(r.id, r.usage_count)}
              onStartEdit={() => startEditGroup(r)}
              onChangeEdit={setEditingValue}
              onSaveEdit={saveEditGroup}
              onCancelEdit={cancelEditGroup}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 inline-flex items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors border",
        active
          ? "bg-primary/10 border-primary/30 text-primary"
          : "bg-transparent border-border text-muted-foreground hover:text-foreground hover:border-border/80"
      )}
    >
      {icon}
      {children}
    </button>
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
  editing,
  editingValue,
  groupSuggestions,
  onDelete,
  onStartEdit,
  onChangeEdit,
  onSaveEdit,
  onCancelEdit,
}: {
  row: MediaRow;
  deleting: boolean;
  editing: boolean;
  editingValue: string;
  groupSuggestions: string[];
  onDelete: () => void;
  onStartEdit: () => void;
  onChangeEdit: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  return (
    <div className="group space-y-1.5">
      <div className="relative aspect-[3/4] rounded-md overflow-hidden border border-border/60 bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={row.url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        {/* Aspect pill — top-left */}
        <span className="absolute top-2 left-2 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/55 text-white/85">
          {KIND_ASPECT[row.kind]}
        </span>
        {/* Usage pill — bottom-left */}
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
        {/* Hover actions */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onStartEdit}
            className="p-1.5 rounded-md bg-black/55 text-white/80 hover:text-primary hover:bg-black/75 transition-colors"
            aria-label={row.group ? "Edit group" : "Add to group"}
            title={row.group ? "Edit group" : "Add to group"}
          >
            <Tag size={12} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="p-1.5 rounded-md bg-black/55 text-white/80 hover:text-destructive hover:bg-black/75 transition-colors"
            aria-label="Delete from library"
          >
            {deleting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Trash2 size={12} />
            )}
          </button>
        </div>
      </div>

      {/* Group label (or inline editor) */}
      {editing ? (
        <GroupEditor
          value={editingValue}
          suggestions={groupSuggestions}
          onChange={onChangeEdit}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
        />
      ) : row.group ? (
        <button
          type="button"
          onClick={onStartEdit}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors max-w-full"
        >
          <Tag size={10} className="shrink-0" />
          <span className="truncate">{row.group}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onStartEdit}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
        >
          <Plus size={9} />
          Add group
        </button>
      )}
    </div>
  );
}

function GroupEditor({
  value,
  suggestions,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  suggestions: string[];
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const datalistId = useMemo(
    () => `library-groups-${Math.random().toString(36).slice(2, 8)}`,
    []
  );
  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        list={datalistId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSave();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={onSave}
        placeholder="Group name (or leave blank)"
        className="w-full rounded-md border border-primary/40 bg-card px-2 py-1 text-[11px] focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-1"
        maxLength={60}
      />
      <datalist id={datalistId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

interface UploadFailure {
  filename: string;
  reason: string;
}

function BulkUploadButton({
  onUploaded,
  groups,
}: {
  onUploaded: () => void;
  groups: GroupSummary[];
}) {
  const [showOptions, setShowOptions] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [kind, setKind] = useState<TenantMediaKind>("quest_cover");
  const [uploading, setUploading] = useState<
    | {
        done: number;
        total: number;
        currentName: string;
        phase: string;
      }
    | null
  >(null);
  const [failures, setFailures] = useState<UploadFailure[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const cap = TENANT_MEDIA_KINDS[kind].maxBytes;

  const trigger = useCallback(() => {
    setFailures([]);
    setSuccessCount(0);
    setShowOptions(true);
  }, []);

  const handleFiles = useCallback(
    async (files: FileList) => {
      const list = Array.from(files);
      if (!list.length) return;
      const localFailures: UploadFailure[] = [];
      let localSuccess = 0;
      const tags = groupName.trim() ? [groupName.trim().slice(0, 60)] : undefined;

      for (let i = 0; i < list.length; i++) {
        const rawFile = list[i];

        // Pre-flight checks BEFORE any prep so the user gets crisp feedback.
        if (!rawFile.type.startsWith("image/")) {
          localFailures.push({
            filename: rawFile.name,
            reason: "Not an image file",
          });
          setUploading({
            done: i + 1,
            total: list.length,
            currentName: rawFile.name,
            phase: "Skipped",
          });
          continue;
        }
        if (rawFile.size > cap) {
          localFailures.push({
            filename: rawFile.name,
            reason: `Over ${Math.round(cap / 1024 / 1024)}MB cap (${Math.round(rawFile.size / 1024 / 1024)}MB)`,
          });
          setUploading({
            done: i + 1,
            total: list.length,
            currentName: rawFile.name,
            phase: "Skipped",
          });
          continue;
        }

        try {
          setUploading({
            done: i,
            total: list.length,
            currentName: rawFile.name,
            phase: "Preparing",
          });
          const file = await prepareUploadFile(rawFile);
          const dims = await readDims(file);

          setUploading({
            done: i,
            total: list.length,
            currentName: rawFile.name,
            phase: "Uploading",
          });
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
            localFailures.push({
              filename: rawFile.name,
              reason: signedJson.error || "Server rejected upload",
            });
            continue;
          }

          const putRes = await fetch(signedJson.data.upload_url, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
          });
          if (!putRes.ok) {
            localFailures.push({
              filename: rawFile.name,
              reason: "Upload to storage failed",
            });
            continue;
          }

          setUploading({
            done: i,
            total: list.length,
            currentName: rawFile.name,
            phase: "Saving",
          });
          const completeRes = await fetch("/api/admin/media/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: signedJson.data.key,
              kind,
              width: dims?.width ?? null,
              height: dims?.height ?? null,
              tags,
            }),
          });
          if (!completeRes.ok) {
            const completeJson = await completeRes.json().catch(() => ({}));
            localFailures.push({
              filename: rawFile.name,
              reason: completeJson.error || "Save failed",
            });
            continue;
          }
          localSuccess += 1;
        } catch (err) {
          localFailures.push({
            filename: rawFile.name,
            reason: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      setUploading(null);
      setFailures(localFailures);
      setSuccessCount(localSuccess);
      // Keep dialog open if there were any failures so admin can review;
      // close + reset if everything succeeded.
      if (localFailures.length === 0) {
        setShowOptions(false);
        setGroupName("");
      }
      onUploaded();
    },
    [kind, groupName, cap, onUploaded]
  );

  return (
    <>
      <Button size="sm" onClick={trigger} disabled={!!uploading}>
        {uploading ? (
          <>
            <Loader2 size={14} className="animate-spin mr-1.5" />
            {uploading.phase} {uploading.done + 1}/{uploading.total}…
          </>
        ) : (
          <>
            <Upload size={14} className="mr-1.5" />
            Upload covers
          </>
        )}
      </Button>

      {/* Options dialog — set kind + group, then pick files */}
      {showOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  New uploads
                </p>
                <h3 className="text-base font-semibold text-foreground mt-0.5">
                  Where do these covers go?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowOptions(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground">
                Use these covers for…
              </label>
              <div className="grid grid-cols-2 gap-2">
                <KindRadio
                  active={kind === "quest_cover"}
                  onClick={() => setKind("quest_cover")}
                  label="Quests"
                  hint="3:4 portrait, iOS feed"
                />
                <KindRadio
                  active={kind === "event_cover"}
                  onClick={() => setKind("event_cover")}
                  label="Events"
                  hint="1:1 square, web + iOS"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground">
                Group{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Bob Marley Tribute"
                list="bulk-group-suggestions"
                maxLength={60}
              />
              <datalist id="bulk-group-suggestions">
                {groups.map((g) => (
                  <option key={g.name} value={g.name} />
                ))}
              </datalist>
              <p className="text-[11px] text-muted-foreground">
                Groups make a campaign of related creative easy to find later. Skip if these are general stock.
              </p>
            </div>

            {/* Per-file results — only shown after a batch with at least one
                rejection. Lets the admin see what didn't make it without
                re-running the whole upload. */}
            {(failures.length > 0 || successCount > 0) && !uploading && (
              <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-medium text-foreground">
                    {successCount > 0 && (
                      <span className="text-success">
                        {successCount} uploaded
                      </span>
                    )}
                    {successCount > 0 && failures.length > 0 && " · "}
                    {failures.length > 0 && (
                      <span className="text-destructive">
                        {failures.length} skipped
                      </span>
                    )}
                  </span>
                </div>
                {failures.length > 0 && (
                  <ul className="space-y-1 text-[11px]">
                    {failures.map((f, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-muted-foreground"
                      >
                        <span className="truncate font-mono text-foreground">
                          {f.filename}
                        </span>
                        <span>—</span>
                        <span className="shrink-0 text-destructive/90">
                          {f.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowOptions(false);
                  setFailures([]);
                  setSuccessCount(0);
                }}
              >
                {failures.length > 0 ? "Done" : "Cancel"}
              </Button>
              <Button size="sm" onClick={() => fileRef.current?.click()}>
                {failures.length > 0 ? "Try more" : "Choose files"}
              </Button>
            </div>
          </div>
        </div>
      )}
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

function KindRadio({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-md border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "border-border hover:border-border/80"
      )}
    >
      <span
        className={cn(
          "text-sm font-medium",
          active ? "text-primary" : "text-foreground"
        )}
      >
        {label}
      </span>
      <span className="text-[10px] text-muted-foreground">{hint}</span>
    </button>
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
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
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
