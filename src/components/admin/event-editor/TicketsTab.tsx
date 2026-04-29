"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, Layers, Plus, Sparkles, Ticket } from "lucide-react";
import { TicketCard } from "./TicketCard";
import { useOrgId } from "@/components/OrgProvider";
import { vatKey } from "@/lib/constants";
import { EVENT_TEMPLATE_LIST } from "@/lib/event-templates";
import {
  TIER_TEMPLATE_LIST,
  type TierTemplate,
} from "@/lib/tier-templates";
import { makeTmpTicketId } from "@/lib/ticket-tmp-id";
import type { TicketTypeRow } from "@/types/events";
import type { Product } from "@/types/products";
import type { VatSettings } from "@/types/settings";
import type { TicketsTabProps } from "./types";

/**
 * Phase 4 — release-strategy controls (group create/rename/delete/reorder
 * + release-mode toggle) live in the Release Strategy panel above. This
 * component now owns the *ticket* surface only: list, drag-to-reorder,
 * add, bulk-add from event/tier templates, and per-card editing. Group
 * dividers above tickets are read-only chips; group config is in the panel.
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

  const addTicketType = useCallback(() => {
    setTicketTypes((prev) => [
      ...prev,
      {
        // Temporary client-side id so per-card Group assignment works
        // before save. handleSave on the editor page strips `tmp-*` from
        // the API payload and translates tmp→real keys in
        // ticket_group_map after the response. See `lib/ticket-tmp-id.ts`.
        id: makeTmpTicketId(),
        org_id: orgId,
        event_id: event.id || "",
        name: "",
        description: "",
        price: 0,
        capacity: undefined,
        sold: 0,
        sort_order: prev.length,
        includes_merch: false,
        status: "active" as const,
        min_per_order: 1,
        max_per_order: 10,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as TicketTypeRow,
    ]);
  }, [event.id, setTicketTypes, orgId]);

  /**
   * Append an event-template's ticket seeds. Reuses the same EVENT_TEMPLATES
   * that drive the Start moment so a host who picked "Concert" at
   * /admin/events/new can later add the "Festival" set without leaving the
   * editor. Templates append (don't replace) so existing tickets are safe.
   */
  const addFromEventTemplate = useCallback(
    (templateKey: string) => {
      const template = EVENT_TEMPLATE_LIST.find((t) => t.key === templateKey);
      if (!template) return;
      setTicketTypes((prev) => {
        const baseOrder = prev.length;
        const seeded = template.ticket_types.map((seed, i) => ({
          id: "",
          org_id: orgId,
          event_id: event.id || "",
          name: seed.name,
          description: seed.description || "",
          price: seed.price,
          capacity: seed.capacity,
          sold: 0,
          sort_order: baseOrder + (seed.sort_order ?? i),
          includes_merch: false,
          status: "active" as const,
          min_per_order: seed.min_per_order ?? 1,
          max_per_order: seed.max_per_order ?? 10,
          tier: (seed.tier === "vip" ? "platinum" : "standard") as
            | "standard"
            | "platinum",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })) as TicketTypeRow[];
        return [...prev, ...seeded];
      });
    },
    [event.id, setTicketTypes, orgId]
  );

  /**
   * Apply a *tier* template (Phase 4.5). Unlike event templates, tier
   * templates can also seed a ticket group + flip release mode, so the
   * waterfall ships ready to go. Existing tickets are left alone — the
   * template appends a brand-new group beside them.
   *
   * Each new ticket gets a `tmp-*` client id (via `makeTmpTicketId`) so
   * `ticket_group_map[tmpId] = groupName` works *immediately*, without
   * waiting for save. handleSave on the editor page strips `tmp-*` ids
   * before sending to the API, then translates tmp→real keys in the
   * settings JSONB after the response. See `lib/ticket-tmp-id.ts`.
   */
  const addFromTierTemplate = useCallback(
    (template: TierTemplate) => {
      // Mint client ids upfront so the same ids can be referenced by the
      // ticket-types update *and* the group_map write below.
      const newRows = template.tiers.map((tier, i) => ({
        id: makeTmpTicketId(),
        sort_offset: i,
        seed: tier,
      }));

      setTicketTypes((prev) => {
        const baseOrder = prev.length;
        const seeded = newRows.map(({ id, sort_offset, seed }) => ({
          id,
          org_id: orgId,
          event_id: event.id || "",
          name: seed.name,
          description: seed.description || "",
          price: seed.price,
          capacity: seed.capacity,
          sold: 0,
          sort_order: baseOrder + sort_offset,
          includes_merch: false,
          status: "active" as const,
          min_per_order: seed.min_per_order ?? 1,
          max_per_order: seed.max_per_order ?? 10,
          tier: "standard" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })) as TicketTypeRow[];
        return [...prev, ...seeded];
      });

      // If the template wants its own group, create it (idempotent),
      // assign every freshly-seeded ticket to it via tmp-id, and flip
      // sequential mode if requested. All synchronous now — no microtask.
      if (template.group_name) {
        const groupName = template.group_name;
        if (!groups.includes(groupName)) {
          updateSetting("ticket_groups", [...groups, groupName]);
        }

        const existingMap =
          (settings.ticket_group_map as Record<string, string | null>) || {};
        const updatedMap = { ...existingMap };
        for (const { id } of newRows) {
          updatedMap[id] = groupName;
        }
        updateSetting("ticket_group_map", updatedMap);

        if (template.release_mode === "sequential") {
          const releaseMode =
            (settings.ticket_group_release_mode as Record<
              string,
              "all" | "sequential"
            >) || {};
          updateSetting("ticket_group_release_mode", {
            ...releaseMode,
            [groupName]: "sequential",
          });
        }
      }
    },
    [event.id, setTicketTypes, orgId, groups, settings, updateSetting]
  );

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
        <Button size="sm" onClick={addTicketType}>
          <Plus size={14} />
          Add ticket
        </Button>
        <BulkAddMenu
          onPickEventTemplate={addFromEventTemplate}
          onPickTierTemplate={addFromTierTemplate}
        />
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
 * Bulk-add menu — surfaces both event templates (Concert / Club / Festival
 * / Conference / Private) and tier templates (Phase 4.5: Early-bird
 * waterfall, Tiered pricing, etc.). Templates are organised in two
 * sections so the host can quickly distinguish "give me a typical event
 * shape" from "give me a release pattern".
 */
function BulkAddMenu({
  onPickEventTemplate,
  onPickTierTemplate,
}: {
  onPickEventTemplate: (templateKey: string) => void;
  onPickTierTemplate: (template: TierTemplate) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Sparkles size={13} className="text-primary/80" />
        From template
        <ChevronDown
          size={12}
          className={cn(
            "ml-0.5 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-border bg-card py-1 shadow-lg"
        >
          {/* Event templates — full event shapes */}
          <div className="px-3 pt-2 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Event shapes
          </div>
          {EVENT_TEMPLATE_LIST.map((template) => (
            <button
              key={`event-${template.key}`}
              type="button"
              role="menuitem"
              onClick={() => {
                onPickEventTemplate(template.key);
                setOpen(false);
              }}
              className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.04] focus-visible:outline-none"
            >
              <span className="text-[12px] font-medium text-foreground">
                {template.label}
              </span>
              <span className="text-[10px] text-muted-foreground/85 leading-tight">
                {template.ticket_types.map((t) => t.name).join(" · ")}
              </span>
            </button>
          ))}

          {/* Tier templates — release patterns */}
          <div className="mt-1 border-t border-border/40 px-3 pt-2 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Release patterns
          </div>
          {TIER_TEMPLATE_LIST.map((tpl) => (
            <button
              key={`tier-${tpl.key}`}
              type="button"
              role="menuitem"
              onClick={() => {
                onPickTierTemplate(tpl);
                setOpen(false);
              }}
              className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.04] focus-visible:outline-none"
            >
              <span className="text-[12px] font-medium text-foreground">
                {tpl.label}
              </span>
              <span className="text-[10px] text-muted-foreground/85 leading-tight">
                {tpl.tiers.map((t) => t.name).join(" → ")}
                {tpl.release_mode === "sequential" && " · sequential"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
