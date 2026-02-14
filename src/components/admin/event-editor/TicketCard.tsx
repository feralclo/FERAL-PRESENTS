"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { TierSelector, type TierValue } from "@/components/admin/TierSelector";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/date-utils";
import { ChevronDown, GripVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TicketTypeRow } from "@/types/events";
import type { Product } from "@/types/products";
import type { EventSettings } from "@/types/settings";
import { CURRENCY_SYMBOLS } from "./types";

interface TicketCardProps {
  ticket: TicketTypeRow;
  index: number;
  currency: string;
  groups: string[];
  groupMap: Record<string, string | null>;
  products: Product[];
  onUpdate: (index: number, field: string, value: unknown) => void;
  onRemove: (index: number) => void;
  onAssignGroup: (ticketId: string, groupName: string) => void;
  onDragStart?: (index: number) => void;
  onDragOver?: (e: React.DragEvent, index: number) => void;
  onDragEnd?: () => void;
}

export function TicketCard({
  ticket,
  index,
  currency,
  groups,
  groupMap,
  products,
  onUpdate,
  onRemove,
  onAssignGroup,
  onDragStart,
  onDragOver,
  onDragEnd,
}: TicketCardProps) {
  const [open, setOpen] = useState(false);
  const currSym = CURRENCY_SYMBOLS[currency] || currency;
  const tierLabel = ticket.tier || "standard";
  const cardId = ticket.id || `new-${index}`;

  const linkedProduct = ticket.product_id
    ? products.find((p) => p.id === ticket.product_id)
    : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className="rounded-md border border-border bg-card overflow-hidden transition-colors hover:border-primary/15"
        draggable
        onDragStart={() => onDragStart?.(index)}
        onDragOver={(e) => onDragOver?.(e, index)}
        onDragEnd={() => onDragEnd?.()}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
          >
            <GripVertical
              size={14}
              className="text-muted-foreground/40 shrink-0 cursor-grab"
            />
            <span className="flex-1 font-mono text-sm text-foreground truncate">
              {ticket.name || "Untitled"}
            </span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {currSym}
              {Number(ticket.price).toFixed(2)}
            </span>
            <Badge variant="outline" className="text-[10px] font-mono uppercase">
              {tierLabel}
            </Badge>
            {ticket.sold > 0 && (
              <span className="text-[10px] font-mono text-success tabular-nums">
                {ticket.sold} sold
              </span>
            )}
            <ChevronDown
              size={14}
              className={cn(
                "text-muted-foreground/50 transition-transform duration-200",
                open && "rotate-180"
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border px-4 py-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={ticket.name}
                  onChange={(e) => onUpdate(index, "name", e.target.value)}
                  placeholder="e.g. General Admission"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={ticket.status} onValueChange={(v) => onUpdate(index, "status", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="hidden">Hidden</SelectItem>
                    <SelectItem value="sold_out">Sold Out</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={ticket.description || ""}
                onChange={(e) =>
                  onUpdate(index, "description", e.target.value)
                }
                placeholder="Brief description of this ticket tier"
              />
            </div>

            <div className="space-y-2">
              <Label>Ticket Design Tier</Label>
              <TierSelector
                value={(ticket.tier || "standard") as TierValue}
                onChange={(tier) => onUpdate(index, "tier", tier)}
              />
            </div>

            <div className="space-y-2">
              <Label>Group</Label>
              <Select
                value={groupMap[ticket.id] || "__none__"}
                onValueChange={(v) => onAssignGroup(ticket.id, v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">(No group)</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Price ({currSym})</Label>
                <Input
                  type="number"
                  value={ticket.price}
                  onChange={(e) =>
                    onUpdate(index, "price", Number(e.target.value))
                  }
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-2">
                <Label>Capacity</Label>
                <Input
                  type="number"
                  value={ticket.capacity ?? ""}
                  onChange={(e) =>
                    onUpdate(
                      index,
                      "capacity",
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                  placeholder="Unlimited"
                  min="0"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Min per Order</Label>
                <Input
                  type="number"
                  value={ticket.min_per_order}
                  onChange={(e) =>
                    onUpdate(index, "min_per_order", Number(e.target.value))
                  }
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <Label>Max per Order</Label>
                <Input
                  type="number"
                  value={ticket.max_per_order}
                  onChange={(e) =>
                    onUpdate(index, "max_per_order", Number(e.target.value))
                  }
                  min="1"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Sale Start</Label>
                <DateTimePicker
                  value={toDatetimeLocal(ticket.sale_start)}
                  onChange={(v) =>
                    onUpdate(
                      index,
                      "sale_start",
                      fromDatetimeLocal(v)
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Sale End</Label>
                <DateTimePicker
                  value={toDatetimeLocal(ticket.sale_end)}
                  onChange={(v) =>
                    onUpdate(
                      index,
                      "sale_end",
                      fromDatetimeLocal(v)
                    )
                  }
                />
              </div>
            </div>

            {/* Merchandise */}
            <div className="border-t border-border pt-4 space-y-4">
              <div className="flex items-center gap-3">
                <Switch
                  checked={ticket.includes_merch}
                  onCheckedChange={(checked) =>
                    onUpdate(index, "includes_merch", checked)
                  }
                />
                <Label className="cursor-pointer">
                  Includes Merchandise
                </Label>
              </div>

              {ticket.includes_merch && (
                <div className="space-y-4 pl-1">
                  {/* Product linking */}
                  {products.length > 0 && (
                    <div className="space-y-2">
                      <Label>Link Product</Label>
                      <Select
                        value={ticket.product_id || "__none__"}
                        onValueChange={(v) =>
                          onUpdate(
                            index,
                            "product_id",
                            v === "__none__" ? null : v
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            (Configure inline)
                          </SelectItem>
                          {products
                            .filter((p) => p.status === "active")
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} — {p.type}
                                {p.sizes.length > 0
                                  ? ` (${p.sizes.join(", ")})`
                                  : ""}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground/60">
                        Link a product from your catalog, or configure merch inline below.
                      </p>
                    </div>
                  )}

                  {linkedProduct && (
                    <div className="flex items-center gap-3 rounded-md border border-primary/15 bg-primary/5 p-3">
                      {linkedProduct.images?.front && (
                        <img
                          src={
                            linkedProduct.images.front.startsWith("data:")
                              ? linkedProduct.images.front
                              : `/api/media/${linkedProduct.images.front}`
                          }
                          alt={linkedProduct.name}
                          className="h-10 w-10 rounded object-cover shrink-0 bg-background/50"
                        />
                      )}
                      <div>
                        <p className="text-xs text-foreground font-medium">
                          Linked: {linkedProduct.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {linkedProduct.type} — Sizes:{" "}
                          {linkedProduct.sizes.join(", ") || "None"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Inline merch fields (fallback) */}
                  {!ticket.product_id && (
                    <>
                      <div className="space-y-2">
                        <Label>Merch Name</Label>
                        <Input
                          value={ticket.merch_name || ""}
                          onChange={(e) =>
                            onUpdate(index, "merch_name", e.target.value)
                          }
                          placeholder="e.g. Summer Drop Tee"
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Merch Type</Label>
                          <Input
                            value={ticket.merch_type || ""}
                            onChange={(e) =>
                              onUpdate(index, "merch_type", e.target.value)
                            }
                            placeholder="e.g. T-Shirt"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Available Sizes</Label>
                          <Input
                            value={(ticket.merch_sizes || []).join(", ")}
                            onChange={(e) =>
                              onUpdate(
                                index,
                                "merch_sizes",
                                e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean)
                              )
                            }
                            placeholder="XS, S, M, L, XL, XXL"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Merch Description</Label>
                        <Input
                          value={ticket.merch_description || ""}
                          onChange={(e) =>
                            onUpdate(
                              index,
                              "merch_description",
                              e.target.value
                            )
                          }
                          placeholder="One-time drop. Never again..."
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <ImageUpload
                          label="Merch Image — Front"
                          value={
                            (
                              ticket.merch_images as {
                                front?: string;
                                back?: string;
                              } | undefined
                            )?.front || ""
                          }
                          onChange={(v) =>
                            onUpdate(index, "merch_images", {
                              ...((ticket.merch_images as Record<
                                string,
                                string
                              >) || {}),
                              front: v,
                            })
                          }
                          uploadKey={`merch_${cardId}_front`}
                        />
                        <ImageUpload
                          label="Merch Image — Back"
                          value={
                            (
                              ticket.merch_images as {
                                front?: string;
                                back?: string;
                              } | undefined
                            )?.back || ""
                          }
                          onChange={(v) =>
                            onUpdate(index, "merch_images", {
                              ...((ticket.merch_images as Record<
                                string,
                                string
                              >) || {}),
                              back: v,
                            })
                          }
                          uploadKey={`merch_${cardId}_back`}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Delete */}
            <div className="flex justify-end pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (ticket.sold > 0) {
                    if (
                      !confirm(
                        `This ticket type has ${ticket.sold} sales. Are you sure?`
                      )
                    )
                      return;
                  }
                  onRemove(index);
                }}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 size={13} />
                Delete Ticket
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
