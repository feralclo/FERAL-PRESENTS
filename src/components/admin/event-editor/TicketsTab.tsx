"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Ticket } from "lucide-react";
import { TicketCard } from "./TicketCard";
import { GroupManager, GroupHeader } from "./GroupManager";
import { ORG_ID } from "@/lib/constants";
import type { TicketTypeRow } from "@/types/events";
import type { Product } from "@/types/products";
import type { TicketsTabProps } from "./types";

export function TicketsTab({
  event,
  settings,
  updateSetting,
  ticketTypes,
  setTicketTypes,
  deletedTypeIds,
  setDeletedTypeIds,
}: TicketsTabProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

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

  const groups = (settings.ticket_groups as string[]) || [];
  const groupMap =
    (settings.ticket_group_map as Record<string, string | null>) || {};

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
        id: "",
        org_id: ORG_ID,
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
  }, [event.id, setTicketTypes]);

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

  const moveGroup = useCallback(
    (groupName: string, direction: "up" | "down") => {
      const g = [...groups];
      const idx = g.indexOf(groupName);
      if (idx === -1) return;
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= g.length) return;
      [g[idx], g[target]] = [g[target], g[idx]];
      updateSetting("ticket_groups", g);
    },
    [groups, updateSetting]
  );

  // Group tickets
  const ungrouped = ticketTypes.filter((tt) => !groupMap[tt.id]);

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={addTicketType}>
          <Plus size={14} />
          Add Ticket
        </Button>
        <GroupManager settings={settings} updateSetting={updateSetting} />
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
            <div className="space-y-1.5">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground/50 px-1">
                Ungrouped
              </span>
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
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Grouped tickets */}
          {groups.map((gName, gi) => {
            const gTickets = ticketTypes.filter(
              (tt) => groupMap[tt.id] === gName
            );
            return (
              <Card key={gName} className="py-0 gap-0 overflow-hidden">
                <GroupHeader
                  name={gName}
                  ticketCount={gTickets.length}
                  index={gi}
                  total={groups.length}
                  settings={settings}
                  updateSetting={updateSetting}
                  onMoveUp={() => moveGroup(gName, "up")}
                  onMoveDown={() => moveGroup(gName, "down")}
                />
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
                        />
                      );
                    })
                  ) : (
                    <p className="text-center text-xs text-muted-foreground/60 py-4">
                      No tickets in this group. Assign tickets from their
                      settings.
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
