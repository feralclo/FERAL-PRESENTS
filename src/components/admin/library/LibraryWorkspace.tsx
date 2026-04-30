"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Image as ImageIcon,
  Layers,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  TENANT_MEDIA_KINDS,
  TENANT_MEDIA_RAW_INPUT_MAX,
  type TenantMediaKind,
} from "@/lib/uploads/tenant-media-config";
import { prepareUploadFile } from "@/lib/uploads/prepare-upload";
import { cn } from "@/lib/utils";

interface MediaRow {
  id: string;
  url: string;
  kind: TenantMediaKind;
  /** Categories this image is available under. Defaults to [kind] but
   *  admins can multi-select (e.g. a cover that also works as a shareable
   *  appears under both chips with one source row). */
  kinds: TenantMediaKind[];
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

type KindFilter =
  | "all"
  | "quest_cover"
  | "event_cover"
  | "quest_content"
  | "quest_asset";
type SortMode = "recent" | "popular";

const KIND_LABEL: Record<KindFilter, string> = {
  all: "All",
  quest_cover: "Quest covers",
  event_cover: "Event covers",
  quest_content: "Shareables",
  quest_asset: "Campaign assets",
};


/**
 * The library workspace.
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

  // Toggle a category on a row. Lets the same image live under multiple
  // chips (e.g. cover that's also a great shareable). PATCH-as-you-go
  // with optimistic UI so the popover feels snappy.
  const toggleKind = useCallback(
    async (id: string, kind: TenantMediaKind, checked: boolean) => {
      const current = rows?.find((r) => r.id === id);
      if (!current) return;
      const next = checked
        ? Array.from(new Set([...current.kinds, kind]))
        : current.kinds.filter((k) => k !== kind);
      // Refuse to leave the row with zero categories — every image must
      // belong to at least one for the filter chips to find it.
      if (next.length === 0) return;
      // Optimistic: update local state, roll back on failure.
      setRows(
        (prev) =>
          prev?.map((r) => (r.id === id ? { ...r, kinds: next } : r)) ?? null
      );
      try {
        const res = await fetch(`/api/admin/media/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kinds: next }),
        });
        if (!res.ok) throw new Error("PATCH failed");
        // Refresh page in case the row should now / shouldn't appear under
        // the active chip.
        void load();
      } catch {
        // Roll back optimistic change.
        setRows(
          (prev) =>
            prev?.map((r) =>
              r.id === id ? { ...r, kinds: current.kinds } : r
            ) ?? null
        );
      }
    },
    [rows, load]
  );

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
        title="Library"
        subtitle={
          rows === null
            ? "Loading…"
            : rows.length === 0
            ? "Empty — your first upload lands here"
            : `${rows.length} asset${rows.length === 1 ? "" : "s"} · ${formatBytes(totalBytes)} stored`
        }
        actions={<BulkUploadButton onUploaded={() => void load()} groups={groups} />}
      />

      {/* Kind filter chips — always visible so admins know what they're seeing */}
      <div className="flex flex-wrap gap-1.5">
        {(["all", "quest_cover", "event_cover", "quest_content", "quest_asset"] as const).map((k) => (
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
              onToggleKind={toggleKind}
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
  onToggleKind,
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
  onToggleKind: (id: string, kind: TenantMediaKind, checked: boolean) => void;
}) {
  // The image is multi-categorised when its kinds[] has more than one
  // Multi-kind images get a small "+N" chip top-left so admins see at a
  // glance that this image is tagged for more than one category. Single-
  // kind images get nothing — the image alone is the right amount of
  // chrome (aspect ratios were noisy and inaccurate, since covers crop
  // differently across surfaces and shareables can be 1:1 too).
  const kindsList: TenantMediaKind[] =
    row.kinds && row.kinds.length > 0 ? row.kinds : [row.kind];
  const isMultiKind = kindsList.length > 1;

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
        {isMultiKind && (
          <span
            className="absolute top-2 left-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/85 text-primary-foreground inline-flex items-center gap-1"
            title={`Tagged for: ${kindsList
              .map((k) => (KIND_LABEL as Record<string, string>)[k] ?? k)
              .join(" · ")}`}
          >
            <Layers size={10} />
            {kindsList.length}
          </span>
        )}
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
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="p-1.5 rounded-md bg-black/55 text-white/80 hover:text-primary hover:bg-black/75 transition-colors"
                aria-label="Categories"
                title="Use this image for…"
              >
                <Layers size={12} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[260px] p-3"
              data-admin
            >
              <CategoriesEditor row={row} onToggle={onToggleKind} />
            </PopoverContent>
          </Popover>
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

/**
 * The category multi-select that pops out from a tile's Layers button.
 * Lets one image live under multiple chips — admin uploads a 3:4 cover
 * and ticks "Shareable" to also have it appear under the 9:16 chip.
 *
 * Auto-saves via PATCH on each toggle (handled by the parent — this
 * component is purely presentational).
 */
function CategoriesEditor({
  row,
  onToggle,
}: {
  row: MediaRow;
  onToggle: (id: string, kind: TenantMediaKind, checked: boolean) => void;
}) {
  const options: { kind: TenantMediaKind; label: string }[] = [
    { kind: "quest_cover", label: "Quest cover" },
    { kind: "event_cover", label: "Event cover" },
    { kind: "quest_content", label: "Shareable" },
    { kind: "quest_asset", label: "Campaign asset" },
  ];
  const kindsList = row.kinds && row.kinds.length ? row.kinds : [row.kind];
  const isLastChecked = kindsList.length === 1;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        Use this image for…
      </p>
      <ul className="space-y-0.5">
        {options.map((opt) => {
          const checked = kindsList.includes(opt.kind);
          const wouldBeLast = checked && isLastChecked;
          return (
            <li key={opt.kind}>
              <label
                className={cn(
                  "flex items-center gap-2.5 px-2 py-2 rounded-md transition-colors cursor-pointer",
                  checked
                    ? "bg-primary/[0.06] hover:bg-primary/[0.10]"
                    : "hover:bg-foreground/[0.04]",
                  wouldBeLast && "cursor-not-allowed opacity-80"
                )}
                title={
                  wouldBeLast
                    ? "Every image must belong to at least one category"
                    : undefined
                }
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={wouldBeLast}
                  onChange={(e) =>
                    !wouldBeLast && onToggle(row.id, opt.kind, e.target.checked)
                  }
                  className="h-3.5 w-3.5 accent-primary"
                />
                <span className="text-[12px] font-medium text-foreground">
                  {opt.label}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] text-muted-foreground/70 leading-relaxed pt-1">
        Tag every category this image works for — it'll show up under each chip in the library and the picker.
      </p>
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

type QueueStatus =
  | "queued"
  | "preparing"
  | "uploading"
  | "saving"
  | "done"
  | "failed";

interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  error?: string;
}

let queueIdCounter = 0;
const nextQueueId = () => `q-${Date.now()}-${++queueIdCounter}`;
const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

function BulkUploadButton({
  onUploaded,
  groups,
}: {
  onUploaded: () => void;
  groups: GroupSummary[];
}) {
  const [open, setOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [kind, setKind] = useState<TenantMediaKind>("quest_cover");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [showCompletionToast, setShowCompletionToast] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Refs read by the imperative processor — using state in the runner
  // would re-create the closure on every patch and trigger React 18
  // effect-cleanup, which previously cancelled in-flight async work and
  // orphaned items in 'preparing' status.
  const itemsRef = useRef<QueueItem[]>([]);
  const settingsRef = useRef({ kind, groupName });
  const isProcessingRef = useRef(false);
  const lastInFlightRef = useRef(false);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    settingsRef.current = { kind, groupName };
  }, [kind, groupName]);

  const inFlight = items.some(
    (i) => i.status !== "done" && i.status !== "failed"
  );
  const doneCount = items.filter((i) => i.status === "done").length;
  const failedCount = items.filter((i) => i.status === "failed").length;

  const triggerOpen = useCallback(() => {
    if (!inFlight) setItems([]);
    setShowCompletionToast(false);
    setOpen(true);
  }, [inFlight]);

  const patchItem = useCallback((id: string, p: Partial<QueueItem>) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }, []);

  // Single async loop that drains the queue. Idempotent re-entry guarded
  // by isProcessingRef. Reads the next 'queued' item via itemsRef so a
  // patch (status update) doesn't invalidate the closure.
  const runProcessor = useCallback(async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    try {
      while (true) {
        const target = itemsRef.current.find((i) => i.status === "queued");
        if (!target) break;
        const id = target.id;
        const file = target.file;

        try {
          patchItem(id, { status: "preparing" });
          // Auto-downscale BEFORE the cap check so a 32MB phone photo
          // (which compresses to ~3MB) gets accepted, not rejected.
          const prepped = await prepareUploadFile(file);
          const cap = TENANT_MEDIA_KINDS[settingsRef.current.kind].maxBytes;
          if (prepped.size > cap) {
            patchItem(id, {
              status: "failed",
              error: `Still over ${mb(cap)}MB after compression — try resizing first`,
            });
            continue;
          }
          const dims = await readDims(prepped);

          patchItem(id, { status: "uploading" });
          const signedRes = await fetch("/api/admin/media/signed-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: settingsRef.current.kind,
              content_type: prepped.type,
              size_bytes: prepped.size,
            }),
          });
          const signedJson = await signedRes.json();
          if (!signedRes.ok || !signedJson.data) {
            patchItem(id, {
              status: "failed",
              error: signedJson.error || "Server rejected upload",
            });
            continue;
          }

          const putRes = await fetch(signedJson.data.upload_url, {
            method: "PUT",
            headers: { "Content-Type": prepped.type },
            body: prepped,
          });
          if (!putRes.ok) {
            patchItem(id, {
              status: "failed",
              error: "Upload to storage failed",
            });
            continue;
          }

          patchItem(id, { status: "saving" });
          const tags = settingsRef.current.groupName.trim()
            ? [settingsRef.current.groupName.trim().slice(0, 60)]
            : undefined;
          const completeRes = await fetch("/api/admin/media/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: signedJson.data.key,
              kind: settingsRef.current.kind,
              width: dims?.width ?? null,
              height: dims?.height ?? null,
              tags,
            }),
          });
          if (!completeRes.ok) {
            const completeJson = await completeRes.json().catch(() => ({}));
            patchItem(id, {
              status: "failed",
              error: completeJson.error || "Save failed",
            });
            continue;
          }
          patchItem(id, { status: "done" });
        } catch (err) {
          patchItem(id, {
            status: "failed",
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
    } finally {
      isProcessingRef.current = false;
      onUploaded();
    }
  }, [patchItem, onUploaded]);

  // Add files to the queue. Pre-flight only catches the things prep can't
  // recover from (non-images, files so big canvas would crash). The real
  // size validation runs inside the processor AFTER downscale, which is
  // why a 32MB phone photo can succeed.
  const addFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      const next: QueueItem[] = files.map((f) => {
        if (!f.type.startsWith("image/")) {
          return {
            id: nextQueueId(),
            file: f,
            status: "failed",
            error: "Not an image",
          };
        }
        if (f.size > TENANT_MEDIA_RAW_INPUT_MAX) {
          return {
            id: nextQueueId(),
            file: f,
            status: "failed",
            error: `Too big to load in browser (${mb(f.size)}MB) — resize first`,
          };
        }
        return { id: nextQueueId(), file: f, status: "queued" };
      });
      setItems((prev) => [...prev, ...next]);
      void runProcessor();
    },
    [runProcessor]
  );

  const handleClose = useCallback(() => {
    setOpen(false);
    if (!inFlight) {
      setItems([]);
      setGroupName("");
    }
    // If items are still in-flight, leave state intact — uploads continue
    // in the background and the floating toast tracks them.
  }, [inFlight]);

  // Warn before navigating away with uploads in flight (only fires for full
  // page reload / tab close — Next.js client-side nav unmounts the
  // component, which is a separate concern).
  useEffect(() => {
    if (!inFlight) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [inFlight]);

  // When a batch settles while the dialog is closed, briefly show a
  // success/failure toast so the admin notices it even if they walked away.
  useEffect(() => {
    const justFinished =
      lastInFlightRef.current && !inFlight && items.length > 0;
    lastInFlightRef.current = inFlight;
    if (justFinished && !open) {
      setShowCompletionToast(true);
      const t = setTimeout(() => setShowCompletionToast(false), 6000);
      return () => clearTimeout(t);
    }
  }, [inFlight, items.length, open]);

  return (
    <>
      <Button size="sm" onClick={triggerOpen}>
        <Upload size={14} className="mr-1.5" />
        Upload covers
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  New uploads
                </p>
                <h3 className="text-base font-semibold text-foreground mt-0.5">
                  {items.length === 0
                    ? "Where do these covers go?"
                    : inFlight
                    ? `Uploading ${doneCount + 1} of ${items.length}…`
                    : failedCount > 0
                    ? `${doneCount} uploaded · ${failedCount} skipped`
                    : `${doneCount} uploaded`}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors"
                aria-label="Close"
                title={inFlight ? "Hide — uploads continue in background" : "Close"}
              >
                <X size={16} />
              </button>
            </div>

            {/* Settings — kind + group. Editable even while uploads are in
                flight; the processor reads via settingsRef so any change
                applies to NOT-YET-STARTED items only. */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Asset type
                </label>
                <KindSegmented value={kind} onChange={setKind} />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Group <span className="font-normal">(optional)</span>
                </label>
                <Input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Bob Marley Tribute"
                  list="bulk-group-suggestions"
                  maxLength={60}
                  className="h-9"
                />
                <datalist id="bulk-group-suggestions">
                  {groups.map((g) => (
                    <option key={g.name} value={g.name} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Drop-zone — accepts drag-and-drop AND click-to-browse. Always
                visible (vs the old "Choose files" button) so the affordance
                is obvious without a hunt. */}
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(Array.from(e.dataTransfer.files));
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }}
              className={cn(
                "rounded-lg border-2 border-dashed cursor-pointer transition-colors px-4 py-6 text-center",
                "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2",
                dragging
                  ? "border-primary/60 bg-primary/[0.05]"
                  : "border-border/60 hover:border-primary/30"
              )}
            >
              <Upload
                size={20}
                className={cn(
                  "mx-auto mb-2",
                  dragging ? "text-primary" : "text-muted-foreground/70"
                )}
              />
              <p className="text-[13px] font-medium text-foreground">
                {dragging ? "Drop to add to the queue" : "Drop images, or click to browse"}
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                JPG, PNG, WebP, HEIC · auto-resized + WebP-optimised
              </p>
            </div>

            {/* Live queue — appears the instant files are added. Each row
                shows status with an icon so it's never ambiguous what's
                happening. */}
            {items.length > 0 && (
              <ul className="space-y-1 text-[12px] max-h-[200px] overflow-y-auto pr-1">
                {items.map((item) => (
                  <QueueRow key={item.id} item={item} />
                ))}
              </ul>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {inFlight && (
                <span className="text-[11px] text-muted-foreground mr-auto">
                  Uploads continue if you close this
                </span>
              )}
              <Button size="sm" variant="ghost" onClick={handleClose}>
                {inFlight ? "Hide" : items.length > 0 ? "Done" : "Cancel"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Floating toast — appears when uploads are running but the dialog
          is hidden, plus briefly after a batch settles. Click anywhere on
          the toast (except the dismiss X) to re-open the dialog. */}
      {!open && (inFlight || showCompletionToast) && (
        <BackgroundUploadToast
          items={items}
          inFlight={inFlight}
          onClick={() => {
            setShowCompletionToast(false);
            setOpen(true);
          }}
          onDismiss={() => setShowCompletionToast(false)}
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </>
  );
}

function QueueRow({ item }: { item: QueueItem }) {
  const phase =
    item.status === "queued"
      ? "Queued"
      : item.status === "preparing"
      ? "Preparing…"
      : item.status === "uploading"
      ? "Uploading…"
      : item.status === "saving"
      ? "Saving…"
      : item.status === "done"
      ? "Uploaded"
      : item.error ?? "Failed";

  const isActive =
    item.status === "preparing" ||
    item.status === "uploading" ||
    item.status === "saving";

  return (
    <li className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-2.5 py-1.5">
      <div className="shrink-0 w-4 h-4 flex items-center justify-center">
        {item.status === "done" ? (
          <Check size={13} className="text-success" />
        ) : item.status === "failed" ? (
          <AlertCircle size={13} className="text-destructive" />
        ) : isActive ? (
          <Loader2 size={13} className="animate-spin text-primary" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        )}
      </div>
      <span className="truncate flex-1 font-mono text-[11px] text-foreground">
        {item.file.name}
      </span>
      <span
        className={cn(
          "shrink-0 text-[11px]",
          item.status === "failed"
            ? "text-destructive"
            : item.status === "done"
            ? "text-success"
            : "text-muted-foreground"
        )}
      >
        {phase}
      </span>
    </li>
  );
}

function KindSegmented({
  value,
  onChange,
}: {
  value: TenantMediaKind;
  onChange: (k: TenantMediaKind) => void;
}) {
  const options: { kind: TenantMediaKind; label: string; aspect: string }[] = [
    { kind: "quest_cover", label: "Quest cover", aspect: "3:4" },
    { kind: "event_cover", label: "Event cover", aspect: "1:1" },
    { kind: "quest_content", label: "Shareables", aspect: "9:16" },
  ];
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/30 p-1">
      {options.map((o) => (
        <button
          key={o.kind}
          type="button"
          onClick={() => onChange(o.kind)}
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 rounded-md px-2 py-2 text-center transition-colors",
            value === o.kind
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="text-[12px] font-medium">{o.label}</span>
          <span className="text-[10px] font-mono text-muted-foreground/70">
            {o.aspect}
          </span>
        </button>
      ))}
    </div>
  );
}

function BackgroundUploadToast({
  items,
  onClick,
  onDismiss,
  inFlight,
}: {
  items: QueueItem[];
  onClick: () => void;
  onDismiss: () => void;
  inFlight: boolean;
}) {
  const done = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const total = items.length;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-border bg-card shadow-xl px-3.5 py-3 flex items-center gap-3"
    >
      <div className="shrink-0 h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
        {inFlight ? (
          <Loader2 size={16} className="animate-spin text-primary" />
        ) : failed > 0 ? (
          <AlertCircle size={16} className="text-warning" />
        ) : (
          <Check size={16} className="text-success" />
        )}
      </div>
      <button type="button" onClick={onClick} className="flex-1 text-left">
        <p className="text-[13px] font-medium text-foreground">
          {inFlight
            ? `Uploading ${Math.min(done + 1, total)} of ${total}…`
            : failed > 0
            ? `${done} uploaded · ${failed} skipped`
            : `${done} uploaded`}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {inFlight ? "Click to view progress" : "Click to view"}
        </p>
      </button>
      {!inFlight && (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      )}
    </div>
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
