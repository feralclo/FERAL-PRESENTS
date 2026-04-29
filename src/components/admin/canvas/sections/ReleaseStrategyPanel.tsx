"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Clock,
  Layers,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { AdminBadge, AdminButton } from "@/components/admin/ui";
import {
  estimateUnlock,
  formatDaysHedged,
  velocityByTicket,
  type SalesBucket,
  type TicketTypeRef,
} from "@/lib/sales-velocity";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/stripe/config";
import type { TicketTypeRow } from "@/types/events";
import type { EventSettings } from "@/types/settings";
import type { UpdateSettingFn } from "@/components/admin/event-editor/types";

/**
 * Release Strategy — single source of truth for how tickets unlock.
 *
 * Consolidates four previously-split surfaces:
 *   1. The per-card "Group" dropdown on TicketCard (kept; cross-group
 *      reassignment is an inline action that doesn't belong here)
 *   2. The `<GroupManager />` "Create Group" popover button
 *   3. The per-group `<GroupHeader />` inline release-mode toggle, rename,
 *      delete, and reorder controls
 *   4. The settings-level toggle on the Ungrouped section header
 *
 * After this lands, (2) (3) and the toggle in (4) move here. The TicketCard
 * keeps its Group dropdown so a host editing a ticket far below the panel
 * can still reassign without scrolling back up.
 *
 * Each group has its own row showing: name, ticket count, current release
 * mode badge. Click "Edit" to expand controls. When a group is in
 * sequential mode, every ticket in it gets a numbered position chip and —
 * if velocity is loaded — a hedged "unlocks in about N days" line.
 */

const UNGROUPED = "__ungrouped__";

interface Props {
  /** Site settings JSONB — source of `ticket_groups`, `ticket_group_map`,
   *  and `ticket_group_release_mode`. */
  settings: EventSettings;
  /** Single-field setting updater, same as the rest of the editor. */
  updateSetting: UpdateSettingFn;
  /** Live ticket types — read-only here. Used for capacity/sold/sort_order. */
  ticketTypes: TicketTypeRow[];
  /** When sequential mode is enabled on a group with hidden tickets,
   *  flip them to active so the visibility logic can show them. */
  setTicketTypes: React.Dispatch<React.SetStateAction<TicketTypeRow[]>>;
  /** Sales-buckets payload. When present, time-to-unlock estimates render
   *  next to gated tiers. Optional — the panel works without velocity data. */
  buckets?: SalesBucket[] | null;
  /** Event currency for revenue formatting in any future expansions. */
  currency: string;
}

export function ReleaseStrategyPanel({
  settings,
  updateSetting,
  ticketTypes,
  setTicketTypes,
  buckets,
  currency,
}: Props) {
  const groups = useMemo<string[]>(
    () => (settings.ticket_groups as string[]) || [],
    [settings.ticket_groups]
  );
  const groupMap = useMemo<Record<string, string | null>>(
    () =>
      (settings.ticket_group_map as Record<string, string | null>) || {},
    [settings.ticket_group_map]
  );
  const releaseMode = useMemo<Record<string, "all" | "sequential">>(
    () =>
      (settings.ticket_group_release_mode as Record<
        string,
        "all" | "sequential"
      >) || {},
    [settings.ticket_group_release_mode]
  );

  /* ── Velocity (Phase 4.4) ────────────────────────────────────────── */
  const velocity = useMemo(() => {
    if (!buckets || buckets.length === 0) return null;
    return velocityByTicket(buckets, 7, new Date());
  }, [buckets]);

  /* ── Build the per-group view models ─────────────────────────────── */
  const isSystemTicket = (tt: TicketTypeRow) =>
    tt.status === "hidden" && Number(tt.price) === 0 && !tt.capacity;

  const grouped = useMemo(() => {
    const map = new Map<string, TicketTypeRow[]>();
    map.set(UNGROUPED, []);
    for (const g of groups) map.set(g, []);
    for (const tt of ticketTypes) {
      if (isSystemTicket(tt)) continue;
      const key = groupMap[tt.id] || UNGROUPED;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(tt);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [groups, groupMap, ticketTypes]);

  const ungrouped = grouped.get(UNGROUPED) ?? [];
  const hasUngrouped = ungrouped.length > 0;

  /* ── Group mutations ─────────────────────────────────────────────── */
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const handleCreateGroup = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed || groups.includes(trimmed)) return;
    updateSetting("ticket_groups", [...groups, trimmed]);
    setNewGroupName("");
    setNewGroupOpen(false);
  };

  const handleRenameGroup = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    if (groups.includes(trimmed)) return;
    updateSetting(
      "ticket_groups",
      groups.map((g) => (g === oldName ? trimmed : g))
    );
    const updatedMap = { ...groupMap };
    for (const k of Object.keys(updatedMap)) {
      if (updatedMap[k] === oldName) updatedMap[k] = trimmed;
    }
    updateSetting("ticket_group_map", updatedMap);
    if (releaseMode[oldName]) {
      const next = { ...releaseMode };
      delete next[oldName];
      next[trimmed] = releaseMode[oldName];
      updateSetting("ticket_group_release_mode", next);
    }
  };

  const handleDeleteGroup = (name: string) => {
    updateSetting(
      "ticket_groups",
      groups.filter((g) => g !== name)
    );
    const updatedMap = { ...groupMap };
    for (const k of Object.keys(updatedMap)) {
      if (updatedMap[k] === name) updatedMap[k] = null;
    }
    updateSetting("ticket_group_map", updatedMap);
    const next = { ...releaseMode };
    delete next[name];
    updateSetting("ticket_group_release_mode", next);
  };

  const handleMoveGroup = (name: string, dir: "up" | "down") => {
    const idx = groups.indexOf(name);
    if (idx === -1) return;
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= groups.length) return;
    const next = [...groups];
    [next[idx], next[target]] = [next[target], next[idx]];
    updateSetting("ticket_groups", next);
  };

  const handleSetMode = (
    groupKey: string,
    mode: "all" | "sequential"
  ) => {
    const next = { ...releaseMode };
    if (mode === "all") {
      delete next[groupKey];
    } else {
      next[groupKey] = "sequential";
    }
    updateSetting("ticket_group_release_mode", next);

    // Sequential release relies on hidden tickets becoming active so the
    // visibility logic can sequence them. Skip system tickets (£0 + no
    // capacity → auto-created merch ticket holders).
    if (mode === "sequential") {
      setTicketTypes((prev) =>
        prev.map((tt) => {
          const inGroup =
            (groupMap[tt.id] || UNGROUPED) === groupKey;
          const isSystem =
            tt.status === "hidden" && Number(tt.price) === 0 && !tt.capacity;
          if (inGroup && tt.status === "hidden" && !isSystem) {
            return { ...tt, status: "active" };
          }
          return tt;
        })
      );
    }
  };

  const showPanel =
    hasUngrouped || groups.length > 0 || newGroupOpen;

  // We still want to show the "+ New group" CTA when nothing exists yet.
  if (!showPanel) {
    return null;
  }

  return (
    <section
      aria-labelledby="release-strategy-heading"
      className="space-y-3 rounded-lg border border-border/50 bg-card/40 p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Release strategy
          </p>
          <h3
            id="release-strategy-heading"
            className="mt-1 text-[15px] font-semibold leading-tight text-foreground"
          >
            How tickets unlock for buyers
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            All at once, or one tier at a time. Sequential reveals the next
            tier when the previous sells out.
          </p>
        </div>
      </header>

      <div className="space-y-2">
        {hasUngrouped && (
          <GroupRow
            key={UNGROUPED}
            displayName="General tickets"
            groupKey={UNGROUPED}
            tickets={ungrouped}
            mode={releaseMode[UNGROUPED] || "all"}
            onSetMode={(m) => handleSetMode(UNGROUPED, m)}
            velocity={velocity}
            allTickets={ticketTypes}
            currency={currency}
            // Ungrouped is a synthetic group — no rename/delete/reorder.
            disableEdit
          />
        )}

        {groups.map((g, i) => {
          const list = grouped.get(g) ?? [];
          return (
            <GroupRow
              key={g}
              displayName={g}
              groupKey={g}
              tickets={list}
              mode={releaseMode[g] || "all"}
              onSetMode={(m) => handleSetMode(g, m)}
              onRename={(name) => handleRenameGroup(g, name)}
              onDelete={() => handleDeleteGroup(g)}
              onMoveUp={i > 0 ? () => handleMoveGroup(g, "up") : undefined}
              onMoveDown={
                i < groups.length - 1
                  ? () => handleMoveGroup(g, "down")
                  : undefined
              }
              velocity={velocity}
              allTickets={ticketTypes}
              currency={currency}
              forbiddenNames={groups.filter((x) => x !== g)}
            />
          );
        })}
      </div>

      {/* + New group */}
      {newGroupOpen ? (
        <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/[0.03] px-3 py-2">
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="e.g. VIP experiences"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreateGroup();
              }
              if (e.key === "Escape") {
                setNewGroupName("");
                setNewGroupOpen(false);
              }
            }}
            className="flex-1 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-1"
          />
          <AdminButton
            size="sm"
            variant="primary"
            onClick={handleCreateGroup}
            disabled={
              !newGroupName.trim() || groups.includes(newGroupName.trim())
            }
          >
            Add
          </AdminButton>
          <AdminButton
            size="sm"
            variant="ghost"
            onClick={() => {
              setNewGroupName("");
              setNewGroupOpen(false);
            }}
            aria-label="Cancel"
          >
            <X size={14} />
          </AdminButton>
        </div>
      ) : (
        <AdminButton
          size="sm"
          variant="outline"
          leftIcon={<Plus />}
          onClick={() => setNewGroupOpen(true)}
        >
          New group
        </AdminButton>
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Per-group row                                                          */
/* ────────────────────────────────────────────────────────────────────── */

interface GroupRowProps {
  displayName: string;
  groupKey: string;
  tickets: TicketTypeRow[];
  mode: "all" | "sequential";
  onSetMode: (m: "all" | "sequential") => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** Other group names — used to validate rename collisions. */
  forbiddenNames?: string[];
  /** When true, hide rename/delete/reorder. Used for the synthetic
   *  "General tickets" row. */
  disableEdit?: boolean;
  /** Velocity samples by ticket id (Phase 4.4 unlock estimates). */
  velocity: Map<string, import("@/lib/sales-velocity").VelocitySample> | null;
  /** All event tickets — used to look up the predecessor of a sequential
   *  tier (a sequential tier unlocks when the prior one sells out). */
  allTickets: TicketTypeRow[];
  /** Currency for price formatting in tier rows. */
  currency: string;
}

function GroupRow({
  displayName,
  groupKey: _groupKey,
  tickets,
  mode,
  onSetMode,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
  forbiddenNames = [],
  disableEdit,
  velocity,
  allTickets: _allTickets,
  currency,
}: GroupRowProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(displayName);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const renameInvalid =
    !editName.trim() ||
    (editName !== displayName && forbiddenNames.includes(editName.trim()));

  const handleRenameSubmit = () => {
    if (renameInvalid) return;
    if (editName.trim() !== displayName) onRename?.(editName.trim());
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "rounded-md border border-border/40 bg-background/40 transition-colors",
        mode === "sequential" && "border-primary/15 bg-primary/[0.02]"
      )}
    >
      {/* Header — stacks at < sm so 375px never crowds.
          Row 1: reorder + title + count + mode badge.
          Row 2 (mobile only): action buttons (rename, delete, expand). */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-3">
          {!disableEdit && (
            <div className="flex flex-col items-center text-muted-foreground/60 shrink-0">
              <button
                type="button"
                onClick={onMoveUp}
                disabled={!onMoveUp}
                className="hover:text-foreground transition-colors disabled:opacity-30"
                aria-label="Move group up"
              >
                <ArrowUp size={11} />
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={!onMoveDown}
                className="hover:text-foreground transition-colors disabled:opacity-30"
                aria-label="Move group down"
              >
                <ArrowDown size={11} />
              </button>
            </div>
          )}
          {disableEdit && (
            <Layers size={13} className="text-muted-foreground/50 shrink-0" />
          )}

          {editing ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameSubmit();
                  if (e.key === "Escape") {
                    setEditing(false);
                    setEditName(displayName);
                  }
                }}
                autoFocus
                className="flex-1 min-w-0 rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-1"
              />
              <AdminButton
                size="sm"
                variant="primary"
                onClick={handleRenameSubmit}
                disabled={renameInvalid}
              >
                <Check size={12} /> Save
              </AdminButton>
              <AdminButton
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setEditName(displayName);
                }}
                aria-label="Cancel"
              >
                <X size={12} />
              </AdminButton>
            </div>
          ) : (
            <>
              <span className="flex-1 min-w-0 font-mono text-xs font-semibold uppercase tracking-wider text-foreground truncate">
                {displayName}
              </span>
              <span className="font-mono tabular-nums text-[11px] text-muted-foreground/70 shrink-0">
                {tickets.length}
              </span>
              <ModeBadge mode={mode} />

              {/* Desktop: actions inline on the same row. */}
              {!disableEdit && !confirmDelete && (
                <div className="hidden sm:flex items-center gap-1">
                  <AdminButton
                    size="sm"
                    variant="ghost"
                    aria-label="Rename group"
                    onClick={() => {
                      setEditName(displayName);
                      setEditing(true);
                    }}
                  >
                    <Pencil size={12} />
                  </AdminButton>
                  <AdminButton
                    size="sm"
                    variant="ghost"
                    aria-label="Delete group"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={12} />
                  </AdminButton>
                </div>
              )}
              {!disableEdit && confirmDelete && (
                <div className="hidden sm:flex items-center gap-1">
                  <AdminButton
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      onDelete?.();
                      setConfirmDelete(false);
                    }}
                  >
                    Delete
                  </AdminButton>
                  <AdminButton
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Keep
                  </AdminButton>
                </div>
              )}

              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? "Collapse group" : "Expand group"}
                aria-expanded={expanded}
                className="text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
              >
                <ChevronDown
                  size={14}
                  className={cn(
                    "transition-transform duration-200",
                    expanded ? "rotate-0" : "-rotate-90"
                  )}
                />
              </button>
            </>
          )}
        </div>

        {/* Mobile-only action row — keeps the 375px header from overflowing. */}
        {!editing && !disableEdit && (
          <div className="mt-2 flex justify-end gap-1 sm:hidden">
            {confirmDelete ? (
              <>
                <AdminButton
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    onDelete?.();
                    setConfirmDelete(false);
                  }}
                >
                  Delete
                </AdminButton>
                <AdminButton
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep
                </AdminButton>
              </>
            ) : (
              <>
                <AdminButton
                  size="sm"
                  variant="ghost"
                  leftIcon={<Pencil />}
                  onClick={() => {
                    setEditName(displayName);
                    setEditing(true);
                  }}
                >
                  Rename
                </AdminButton>
                <AdminButton
                  size="sm"
                  variant="ghost"
                  leftIcon={<Trash2 />}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  Remove
                </AdminButton>
              </>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {expanded && !editing && (
        <div className="border-t border-border/40 px-3 py-3 space-y-3">
          {/* Mode segmented control — only meaningful for groups with 2+ tickets. */}
          {tickets.length >= 2 ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] text-muted-foreground/70 font-medium">
                Release:
              </span>
              <ModeSegmented mode={mode} onChange={onSetMode} />
              {mode === "sequential" && (
                <span className="text-[11px] text-muted-foreground/70">
                  Reveals tiers one at a time as each sells out.
                </span>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/60">
              Add a second ticket to enable sequential release.
            </p>
          )}

          {/* Tier list — numbered when sequential, plain list otherwise.
              Time-to-unlock estimates render only on sequential tiers
              after the first one. */}
          {tickets.length > 0 && (
            <ul className="space-y-1.5">
              {tickets.map((tt, i) => (
                <TierRow
                  key={tt.id || `idx-${i}`}
                  ticket={tt}
                  position={mode === "sequential" ? i + 1 : null}
                  isFirst={i === 0}
                  predecessor={i > 0 ? tickets[i - 1] : null}
                  velocity={velocity}
                  currency={currency}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Mode badge + segmented control                                         */
/* ────────────────────────────────────────────────────────────────────── */

function ModeBadge({ mode }: { mode: "all" | "sequential" }) {
  if (mode === "sequential") {
    return (
      <AdminBadge variant="info" className="gap-1">
        <ArrowRight size={10} />
        Sequential
      </AdminBadge>
    );
  }
  return <AdminBadge variant="default">All at once</AdminBadge>;
}

function ModeSegmented({
  mode,
  onChange,
}: {
  mode: "all" | "sequential";
  onChange: (m: "all" | "sequential") => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Release mode"
      className="inline-flex items-center rounded-md border border-border bg-secondary/40 p-0.5"
    >
      <button
        type="button"
        role="radio"
        aria-checked={mode === "all"}
        onClick={() => onChange("all")}
        className={cn(
          "rounded px-2.5 py-1 text-[11px] font-medium transition-all",
          mode === "all"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        All at once
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === "sequential"}
        onClick={() => onChange("sequential")}
        className={cn(
          "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-all",
          mode === "sequential"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <ArrowRight size={11} />
        Sequential
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Per-tier row — name, price, sold, time-to-unlock                       */
/* ────────────────────────────────────────────────────────────────────── */

function TierRow({
  ticket,
  position,
  isFirst,
  predecessor,
  velocity,
  currency,
}: {
  ticket: TicketTypeRow;
  position: number | null;
  isFirst: boolean;
  predecessor: TicketTypeRow | null;
  velocity: Map<string, import("@/lib/sales-velocity").VelocitySample> | null;
  currency: string;
}) {
  const isSoldOut =
    ticket.status === "sold_out" ||
    (ticket.capacity != null &&
      ticket.capacity > 0 &&
      ticket.sold >= ticket.capacity);

  const remaining =
    ticket.capacity != null
      ? Math.max(0, ticket.capacity - ticket.sold)
      : null;

  // Time-to-unlock estimate — only when this tier sits *behind* a
  // predecessor in a sequential group, AND we have velocity data, AND the
  // predecessor isn't already sold out. We rely on the lib's reason codes
  // to keep the surface honest.
  const unlock = useMemo(() => {
    if (!velocity || isFirst || !predecessor) return null;
    const ref: TicketTypeRef = {
      id: predecessor.id,
      name: predecessor.name,
      sold: predecessor.sold,
      capacity: predecessor.capacity ?? null,
      sort_order: predecessor.sort_order,
    };
    return estimateUnlock(ref, velocity);
  }, [velocity, isFirst, predecessor]);

  const hasUnlock =
    !!(unlock?.unlockAt && unlock.daysFromNow != null && remaining != null);
  const showNoVelocity = unlock?.reason === "no_velocity";

  return (
    <li className="rounded-md px-2 py-1.5 hover:bg-foreground/[0.02] transition-colors">
      {/* Top: position + name + price + stock — always one row. The
          unlock pill stacks below at narrow widths so we never truncate
          the ticket name. */}
      <div className="flex items-baseline gap-3">
        {position != null && (
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold tabular-nums shrink-0",
              isSoldOut
                ? "bg-foreground/[0.06] text-muted-foreground"
                : "bg-primary/10 text-primary"
            )}
          >
            {position}
          </span>
        )}
        <span className="flex-1 truncate text-xs text-foreground min-w-0">
          {ticket.name || "Untitled"}
        </span>
        <span className="font-mono tabular-nums text-[11px] text-muted-foreground/80 shrink-0">
          {formatPrice(Number(ticket.price), currency)}
        </span>
        {ticket.capacity != null && (
          <span
            className={cn(
              "font-mono tabular-nums text-[10px] shrink-0",
              isSoldOut ? "text-success" : "text-muted-foreground/70"
            )}
          >
            {isSoldOut ? "sold out" : `${ticket.sold}/${ticket.capacity}`}
          </span>
        )}
      </div>

      {(hasUnlock || showNoVelocity) && (
        <div className={cn("mt-1 flex", position != null ? "pl-8" : "")}>
          {hasUnlock && (
            <span
              className="inline-flex items-center gap-1 rounded-md border border-primary/15 bg-primary/[0.04] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-primary/85"
              title={`Predecessor ${predecessor?.name} has ${remaining ?? 0} left at ${unlock!.perDay.toFixed(2)}/day over the last ${unlock!.windowDays} day${unlock!.windowDays === 1 ? "" : "s"}.`}
            >
              <Clock size={10} />
              unlocks {formatDaysHedged(unlock!.daysFromNow!)}
            </span>
          )}
          {showNoVelocity && (
            <span className="font-mono text-[10px] text-muted-foreground/60">
              unlock pace unknown
            </span>
          )}
        </div>
      )}
    </li>
  );
}

