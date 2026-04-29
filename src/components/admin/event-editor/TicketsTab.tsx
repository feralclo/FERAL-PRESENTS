"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, Layers, Plus, Ticket, X } from "lucide-react";
import { TicketCard } from "./TicketCard";
import { useOrgId } from "@/components/OrgProvider";
import { vatKey } from "@/lib/constants";
import { makeTmpTicketId } from "@/lib/ticket-tmp-id";
import type { TicketTypeRow } from "@/types/events";
import type { Product } from "@/types/products";
import type { VatSettings } from "@/types/settings";
import type { TicketsTabProps } from "./types";

/**
 * Phase 4.9 simplification — removed the in-editor "From template" menu
 * entirely. Templates belong at the Start Moment (`/admin/events/new`),
 * not at edit time, because:
 *   - Pre-filled names + prices ("Early bird, £10") are presumptuous —
 *     hosts have their own naming conventions and pricing
 *   - The release-pattern job is already covered by the Release Strategy
 *     panel above this component
 * For the rare bulk-add case, the "Add ticket" button has a dropdown
 * count ("Add 4") that inserts blank rows.
 *
 * Release-strategy controls (group create/rename/delete/reorder + release-
 * mode toggle) live in the Release Strategy panel above. This component
 * owns the *ticket* surface only: list, drag-to-reorder, add (with
 * optional count), and per-card editing. Group dividers are read-only
 * chips; group config is in the panel.
 */
export function TicketsTab({
  event,
  settings,
  updateSetting,
  ticketTypes,
  setTicketTypes,
  deletedTypeIds,
  setDeletedTypeIds,
}: TicketsTabProps) {
  const orgId = useOrgId();
  const [products, setProducts] = useState<Product[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [orgVat, setOrgVat] = useState<VatSettings | null>(null);

  // Load products for linking
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/merch");
        const json = await res.json();
        if (json.data) setProducts(json.data);
      } catch {
        // ignore
      }
    })();
  }, []);

  // Load org-level VAT defaults so we can show the gross/VAT preview on each
  // ticket card. The event itself can override (event.vat_registered === true |
  // false | null), with null = "use org default".
  useEffect(() => {
    fetch(`/api/settings?key=${vatKey(orgId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setOrgVat(json.data as VatSettings);
      })
      .catch(() => {});
  }, [orgId]);

  const effectiveVat = useMemo(() => {
    if (event.vat_registered === false) return { enabled: false, rate: 0, includesPrice: true };
    if (event.vat_registered === true) {
      return {
        enabled: true,
        rate: event.vat_rate ?? 20,
        includesPrice: event.vat_prices_include ?? true,
      };
    }
    if (orgVat?.vat_registered) {
      return {
        enabled: true,
        rate: orgVat.vat_rate ?? 20,
        includesPrice: orgVat.prices_include_vat ?? true,
      };
    }
    return { enabled: false, rate: 0, includesPrice: true };
  }, [event.vat_registered, event.vat_rate, event.vat_prices_include, orgVat]);

  const groups = useMemo<string[]>(
    () => (settings.ticket_groups as string[]) || [],
    [settings.ticket_groups]
  );
  const groupMap = useMemo<Record<string, string | null>>(
    () =>
      (settings.ticket_group_map as Record<string, string | null>) || {},
    [settings.ticket_group_map]
  );

  const updateTicketType = useCallback(
    (index: number, field: string, value: unknown) => {
      setTicketTypes((prev) =>
        prev.map((tt, i) => (i === index ? { ...tt, [field]: value } : tt))
      );
    },
    [setTicketTypes]
  );

  /** Ticket ids that should pulse with an "I'm new!" highlight — clears
   *  after 1.4s so the pulse reads as a brief cue, not decoration. */
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());

  /** Set the highlight set to the given ids, then clear after 1.4s. */
  const flashHighlight = useCallback((ids: string[]) => {
    setHighlightIds(new Set(ids));
    const t = setTimeout(() => setHighlightIds(new Set()), 1400);
    return () => clearTimeout(t);
  }, []);

  /**
   * Add `count` blank tickets at once. Used by both the single "Add ticket"
   * button (count=1) and the "Add multiple" mini-popover. New tickets get
   * tmp-* client ids so the per-card Group dropdown works pre-save.
   */
  const addTicketTypes = useCallback(
    (count: number) => {
      const safeCount = Math.max(1, Math.min(20, Math.floor(count)));
      const newIds = Array.from({ length: safeCount }, () => makeTmpTicketId());
      setTicketTypes((prev) => {
        const baseOrder = prev.length;
        const newRows = newIds.map(
          (id, i) =>
            ({
              id,
              org_id: orgId,
              event_id: event.id || "",
              name: "",
              description: "",
              price: 0,
              capacity: undefined,
              sold: 0,
              sort_order: baseOrder + i,
              includes_merch: false,
              status: "active" as const,
              min_per_order: 1,
              max_per_order: 10,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }) as TicketTypeRow
        );
        return [...prev, ...newRows];
      });
      flashHighlight(newIds);
    },
    [event.id, setTicketTypes, orgId, flashHighlight]
  );

  const addTicketType = useCallback(() => addTicketTypes(1), [addTicketTypes]);

  const removeTicketType = useCallback(
    (index: number) => {
      setTicketTypes((prev) => {
        const tt = prev[index];
        if (tt.id) setDeletedTypeIds((d) => [...d, tt.id]);
        return prev
          .filter((_, i) => i !== index)
          .map((tt2, i2) => ({ ...tt2, sort_order: i2 }));
      });
    },
    [setTicketTypes, setDeletedTypeIds]
  );

  const assignToGroup = useCallback(
    (ticketId: string, val: string) => {
      updateSetting("ticket_group_map", {
        ...groupMap,
        [ticketId]: val || null,
      });
    },
    [groupMap, updateSetting]
  );

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, overIndex: number) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === overIndex) return;
      setTicketTypes((prev) => {
        const updated = [...prev];
        const [moved] = updated.splice(dragIndex, 1);
        updated.splice(overIndex, 0, moved);
        return updated.map((tt, i) => ({ ...tt, sort_order: i }));
      });
      setDragIndex(overIndex);
    },
    [dragIndex, setTicketTypes]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
  }, []);

  // Release mode is now config-only — read it to decorate the cards (sequence
  // position pill, "waiting for X" badge), but write happens in the strategy
  // panel.
  const releaseMode = useMemo(
    () =>
      (settings.ticket_group_release_mode as Record<
        string,
        "all" | "sequential"
      >) || {},
    [settings.ticket_group_release_mode]
  );

  // Compute "waitingFor" for tickets in sequential groups.
  const waitingForMap = useMemo(() => {
    const result: Record<string, string> = {};
    const sequentialGroupNames = new Set<string>();
    for (const [key, mode] of Object.entries(releaseMode)) {
      if (mode === "sequential") sequentialGroupNames.add(key);
    }
    if (sequentialGroupNames.size === 0) return result;

    for (const groupName of sequentialGroupNames) {
      const gTickets = ticketTypes
        .filter((tt) => {
          const ttGroup = groupMap[tt.id] || "__ungrouped__";
          return ttGroup === groupName && tt.status !== "hidden";
        })
        .sort((a, b) => a.sort_order - b.sort_order);

      for (let i = 1; i < gTickets.length; i++) {
        const prev = gTickets[i - 1];
        const isSoldOut =
          prev.status === "sold_out" ||
          (prev.capacity != null &&
            prev.capacity > 0 &&
            prev.sold >= prev.capacity);
        if (!isSoldOut) {
          result[gTickets[i].id] = prev.name || "previous ticket";
        }
      }
    }
    return result;
  }, [ticketTypes, groupMap, releaseMode]);

  const sequentialGroups = useMemo(() => {
    const set = new Set<string>();
    for (const [key, mode] of Object.entries(releaseMode)) {
      if (mode === "sequential") set.add(key);
    }
    return set;
  }, [releaseMode]);

  const sequencePositionMap = useMemo(() => {
    const result: Record<string, number> = {};
    if (sequentialGroups.size === 0) return result;
    for (const groupName of sequentialGroups) {
      const gTickets = ticketTypes
        .filter((tt) => {
          const ttGroup = groupMap[tt.id] || "__ungrouped__";
          return ttGroup === groupName && tt.status !== "hidden";
        })
        .sort((a, b) => a.sort_order - b.sort_order);
      gTickets.forEach((tt, idx) => {
        result[tt.id] = idx + 1;
      });
    }
    return result;
  }, [ticketTypes, groupMap, sequentialGroups]);

  // System ticket types (hidden, £0, no capacity) are auto-created by the
  // merch/reward system. Filter them from the admin display.
  const isSystemTicket = (tt: TicketTypeRow) =>
    tt.status === "hidden" && Number(tt.price) === 0 && !tt.capacity;

  const ungrouped = ticketTypes.filter(
    (tt) => !groupMap[tt.id] && !isSystemTicket(tt)
  );

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <AddTicketControl onAdd={addTicketTypes} />
      </div>

      {ticketTypes.length === 0 ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
              <Ticket size={20} className="text-primary/60" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              No ticket types yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add your first ticket type to start selling
            </p>
            <Button size="sm" className="mt-4" onClick={addTicketType}>
              <Plus size={14} />
              Add Ticket
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Ungrouped tickets */}
          {ungrouped.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Layers size={13} className="text-muted-foreground/50" />
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                  General Tickets
                </span>
                <Badge
                  variant="secondary"
                  className="text-[10px] font-mono tabular-nums"
                >
                  {ungrouped.length}
                </Badge>
                {sequentialGroups.has("__ungrouped__") && (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono uppercase border-primary/25 text-primary/85"
                  >
                    Sequential
                  </Badge>
                )}
              </div>
              <div className="space-y-1.5">
                {ungrouped.map((tt) => {
                  const i = ticketTypes.indexOf(tt);
                  return (
                    <TicketCard
                      key={tt.id || `new-${i}`}
                      ticket={tt}
                      index={i}
                      currency={event.currency}
                      groups={groups}
                      groupMap={groupMap}
                      products={products}
                      onUpdate={updateTicketType}
                      onRemove={removeTicketType}
                      onAssignGroup={assignToGroup}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDragEnd={handleDragEnd}
                      waitingFor={waitingForMap[tt.id]}
                      isSequentialGroup={sequentialGroups.has("__ungrouped__")}
                      sequencePosition={sequencePositionMap[tt.id]}
                      multiCurrencyEnabled={!!settings.multi_currency_enabled}
                      vatEnabled={effectiveVat.enabled}
                      vatRate={effectiveVat.rate}
                      vatIncludesPrice={effectiveVat.includesPrice}
                      isFreshlyAdded={highlightIds.has(tt.id)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Grouped tickets */}
          {groups.map((gName) => {
            const gTickets = ticketTypes.filter(
              (tt) => groupMap[tt.id] === gName && !isSystemTicket(tt)
            );
            return (
              <Card key={gName} className="py-0 gap-0 overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                  <Layers
                    size={13}
                    className="text-muted-foreground/50 shrink-0"
                  />
                  <span className="flex-1 font-mono text-xs font-semibold uppercase tracking-wider text-foreground truncate">
                    {gName}
                  </span>
                  <span className="font-mono tabular-nums text-[10px] text-muted-foreground/60">
                    {gTickets.length} ticket{gTickets.length === 1 ? "" : "s"}
                  </span>
                  {sequentialGroups.has(gName) && (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono uppercase border-primary/25 text-primary/85"
                    >
                      Sequential
                    </Badge>
                  )}
                </div>
                <div className="p-3 space-y-1.5">
                  {gTickets.length > 0 ? (
                    gTickets.map((tt) => {
                      const i = ticketTypes.indexOf(tt);
                      return (
                        <TicketCard
                          key={tt.id || `new-${i}`}
                          ticket={tt}
                          index={i}
                          currency={event.currency}
                          groups={groups}
                          groupMap={groupMap}
                          products={products}
                          onUpdate={updateTicketType}
                          onRemove={removeTicketType}
                          onAssignGroup={assignToGroup}
                          onDragStart={handleDragStart}
                          onDragOver={handleDragOver}
                          onDragEnd={handleDragEnd}
                          waitingFor={waitingForMap[tt.id]}
                          isSequentialGroup={sequentialGroups.has(gName)}
                          sequencePosition={sequencePositionMap[tt.id]}
                          multiCurrencyEnabled={!!settings.multi_currency_enabled}
                          vatEnabled={effectiveVat.enabled}
                          vatRate={effectiveVat.rate}
                          vatIncludesPrice={effectiveVat.includesPrice}
                          isFreshlyAdded={highlightIds.has(tt.id)}
                        />
                      );
                    })
                  ) : (
                    <p className="text-center text-xs text-muted-foreground/60 py-4">
                      No tickets in this group. Use a ticket card&rsquo;s
                      Group dropdown to add one.
                    </p>
                  )}
                </div>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

/**
 * Add-ticket control — single button that adds one blank ticket, with a
 * tiny chevron beside it that opens a count input for batch-add. No
 * templates, no opinionated names, no release-mode magic. The release
 * strategy job lives in the Release Strategy panel above; this control's
 * only job is "make me N empty rows."
 */
function AddTicketControl({
  onAdd,
}: {
  onAdd: (count: number) => void;
}) {
  const [batchOpen, setBatchOpen] = useState(false);
  const [count, setCount] = useState(3);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!batchOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setBatchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [batchOpen]);

  const submit = () => {
    onAdd(count);
    setBatchOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <div className="inline-flex items-stretch overflow-hidden rounded-md">
        <Button
          size="sm"
          onClick={() => onAdd(1)}
          className="rounded-r-none border-r border-primary-foreground/15"
        >
          <Plus size={14} />
          Add ticket
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-haspopup="dialog"
          aria-expanded={batchOpen}
          aria-label="Add multiple tickets"
          onClick={() => setBatchOpen((v) => !v)}
          className="rounded-l-none px-2"
        >
          <ChevronDown
            size={14}
            className={cn(
              "transition-transform duration-200",
              batchOpen && "rotate-180"
            )}
          />
        </Button>
      </div>

      {batchOpen && (
        <div
          role="dialog"
          aria-label="Add multiple tickets"
          className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-border bg-card p-3 shadow-lg space-y-2"
        >
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Add multiple
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Adds N blank tickets. Name and price each one in the cards
            below.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="20"
              value={count}
              onChange={(e) =>
                setCount(
                  Math.max(
                    1,
                    Math.min(20, parseInt(e.target.value, 10) || 1)
                  )
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
                if (e.key === "Escape") setBatchOpen(false);
              }}
              autoFocus
              className="w-16 rounded-md border border-border/60 bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-1"
            />
            <Button size="sm" onClick={submit}>
              Add {count} ticket{count === 1 ? "" : "s"}
            </Button>
            <button
              type="button"
              onClick={() => setBatchOpen(false)}
              aria-label="Cancel"
              className="ml-auto text-muted-foreground/70 hover:text-foreground transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
