"use client";

import { useState } from "react";
import Link from "next/link";
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
import { normalizeMerchImages } from "@/lib/merch-images";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/date-utils";
import { AlertTriangle, ChevronDown, ChevronRight, GripVertical, Lock, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CurrencyPriceOverrides } from "@/components/admin/CurrencyPriceOverrides";
import type { TicketTypeRow } from "@/types/events";
import type { Product } from "@/types/products";
import { CURRENCY_SYMBOLS } from "./types";
import { isZeroDecimalCurrency, formatPrice } from "@/lib/stripe/config";
import { calculateVat } from "@/lib/vat";

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
  /** Name of the preceding ticket this one is waiting on (sequential release) */
  waitingFor?: string;
  /** Whether this ticket is in a sequential release group */
  isSequentialGroup?: boolean;
  /** Position in the sequential release (1-based), e.g. 1 = first to release */
  sequencePosition?: number;
  /** Whether multi-currency is enabled (shows price overrides UI) */
  multiCurrencyEnabled?: boolean;
  /** Whether VAT is enabled for this event (after merging event override + org default). */
  vatEnabled?: boolean;
  /** VAT percentage to apply (e.g. 20 = 20%). Ignored when vatEnabled is false. */
  vatRate?: number;
  /** True when the entered price already includes VAT (extract). False when it's net (add on top). */
  vatIncludesPrice?: boolean;
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
  waitingFor,
  isSequentialGroup,
  sequencePosition,
  multiCurrencyEnabled,
  vatEnabled,
  vatRate,
  vatIncludesPrice,
}: TicketCardProps) {
  const [open, setOpen] = useState(false);
  // Advanced fields default to closed — most events don't need per-ticket
  // sale windows or per-ticket order limits. Auto-open if the ticket
  // already uses any of those (host needs to see the values they set).
  const [advancedOpen, setAdvancedOpen] = useState(
    !!(ticket.sale_start || ticket.sale_end) ||
      ticket.min_per_order > 1 ||
      ticket.max_per_order !== 10
  );
  const currSym = CURRENCY_SYMBOLS[currency] || currency;
  const cardId = ticket.id || `new-${index}`;
  const isVip = ticket.tier && ticket.tier !== "standard";

  // VAT preview — only shown when the event has VAT enabled. We always
  // surface the GROSS amount the buyer pays, even when prices are entered
  // net, so hosts never have to mental-math the checkout total.
  const vatPreview = (() => {
    if (!vatEnabled || !vatRate || vatRate <= 0) return null;
    const price = Number(ticket.price);
    if (!isFinite(price) || price <= 0) return null;
    const breakdown = calculateVat(price, vatRate, vatIncludesPrice ?? true, currency);
    return breakdown;
  })();

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
            {sequencePosition != null && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary tabular-nums shrink-0">
                {sequencePosition}
              </span>
            )}
            <span className="flex-1 font-mono text-sm text-foreground truncate">
              {ticket.name || "Untitled"}
            </span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatPrice(Number(ticket.price), currency)}
            </span>
            {isVip && (
              <Badge variant="outline" className="text-[10px] font-mono uppercase">
                VIP
              </Badge>
            )}
            {waitingFor && (
              <Badge
                variant="secondary"
                className="text-[10px] font-mono gap-1.5 text-muted-foreground border-border"
                title={`Reveals when "${waitingFor}" sells out`}
              >
                <Lock size={10} className="text-muted-foreground/70" />
                Waiting for {waitingFor}
              </Badge>
            )}
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
            {/* Name takes the full row — it's the most important field.
                Description sits under it as a compact line. */}
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={ticket.name}
                onChange={(e) => onUpdate(index, "name", e.target.value)}
                placeholder="e.g. General Admission"
              />
              <Input
                value={ticket.description || ""}
                onChange={(e) => onUpdate(index, "description", e.target.value)}
                placeholder="Optional description shown under the name"
                className="text-xs"
              />
            </div>

            <TierSelector
              value={(ticket.tier || "standard") as TierValue}
              onChange={(tier) => onUpdate(index, "tier", tier)}
            />

            {/* Group + Active on one row — both are quick toggles/picks
                that don't deserve a row each. */}
            <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
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
              {/* Status simplified to an Active toggle. Sold-out is
                  computed from sold/capacity (not user-set), and
                  Archived is a power-user state surfaced via Delete.
                  If the stored status is sold_out or archived, the
                  toggle visually reflects active=false and a hint pill
                  explains the actual state. */}
              <div className="space-y-2">
                <Label>Active</Label>
                <div className="flex h-9 items-center justify-between gap-3 rounded-md border border-border/60 bg-background px-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {ticket.status === "sold_out" && (
                      <Badge variant="secondary" className="text-[10px]">
                        Sold out
                      </Badge>
                    )}
                    {ticket.status === "archived" && (
                      <Badge variant="outline" className="text-[10px]">
                        Archived
                      </Badge>
                    )}
                    {ticket.status === "active" && <span>On sale</span>}
                    {ticket.status === "hidden" && <span>Hidden from buyers</span>}
                  </div>
                  <Switch
                    checked={ticket.status === "active" || ticket.status === "sold_out"}
                    onCheckedChange={(checked) =>
                      onUpdate(index, "status", checked ? "active" : "hidden")
                    }
                  />
                </div>
              </div>
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
                  step={isZeroDecimalCurrency(currency) ? "1" : "0.01"}
                />
                {vatPreview && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Buyer pays{" "}
                    <span className="font-mono font-semibold text-foreground tabular-nums">
                      {formatPrice(vatPreview.gross, currency)}
                    </span>{" "}
                    <span className="text-muted-foreground/80">
                      (incl.{" "}
                      <span className="font-mono tabular-nums">
                        {formatPrice(vatPreview.vat, currency)}
                      </span>{" "}
                      VAT
                      {vatRate ? ` @ ${vatRate}%` : ""})
                    </span>
                  </p>
                )}
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
                {isSequentialGroup && !ticket.capacity && (
                  <div className="flex items-start gap-2 rounded-md border border-warning/20 bg-warning/5 px-2.5 py-2">
                    <AlertTriangle size={13} className="text-warning shrink-0 mt-0.5" />
                    <p className="text-[11px] text-warning/90 leading-relaxed">
                      This ticket is in a sequential group. Set a capacity so it can sell out and reveal the next ticket.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {multiCurrencyEnabled && (
              <CurrencyPriceOverrides
                baseCurrency={currency}
                basePrice={Number(ticket.price)}
                overrides={ticket.price_overrides || null}
                onChange={(val) => onUpdate(index, "price_overrides", val)}
              />
            )}

            {/* Advanced disclosure — sale window + per-ticket order
                limits. Almost no event needs per-ticket sale windows
                (the org-wide announcement schedule covers the common
                case in PublishSection). Min/max per order on each
                ticket is also a power-user knob — defaults are
                1 / 10. Hidden by default; auto-opens if the ticket
                already has non-default values for any of these. */}
            <div className="border-t border-border/40 pt-3">
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                aria-expanded={advancedOpen}
                aria-controls={`ticket-advanced-${cardId}`}
                className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-1"
              >
                <span className="font-mono uppercase tracking-[0.16em] text-[10px]">
                  Advanced
                </span>
                <ChevronRight
                  size={13}
                  className={cn(
                    "transition-transform duration-200",
                    advancedOpen && "rotate-90"
                  )}
                />
              </button>
              <div
                id={`ticket-advanced-${cardId}`}
                hidden={!advancedOpen}
                className="space-y-4 pt-3"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Min per order</Label>
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
                    <Label>Max per order</Label>
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
                    <Label>Sale starts</Label>
                    <DateTimePicker
                      value={toDatetimeLocal(ticket.sale_start)}
                      onChange={(v) =>
                        onUpdate(index, "sale_start", fromDatetimeLocal(v))
                      }
                    />
                    <p className="text-[10px] text-muted-foreground/70">
                      Per-ticket override. Most events use the event-wide
                      release schedule in Publish.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Sale ends</Label>
                    <DateTimePicker
                      value={toDatetimeLocal(ticket.sale_end)}
                      onChange={(v) =>
                        onUpdate(index, "sale_end", fromDatetimeLocal(v))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Merchandise — Linked Product is the only path now.
                Production data confirmed 2/2 merch tickets use Linked
                Product, 0 inline (as of 2026-04-29). The inline merch
                fallback was dropped: tickets are tickets, products are
                products, and bundling them via product_id is the right
                shape. New products live in /admin/merch. */}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center gap-3">
                <Switch
                  checked={ticket.includes_merch}
                  onCheckedChange={(checked) => {
                    onUpdate(index, "includes_merch", checked);
                    // When turning merch off, clear the link too so
                    // the data is consistent with the toggle state.
                    if (!checked && ticket.product_id) {
                      onUpdate(index, "product_id", null);
                    }
                  }}
                />
                <Label className="cursor-pointer">Includes merch</Label>
              </div>

              {ticket.includes_merch && (
                <div className="space-y-3">
                  {products.filter((p) => p.status === "active").length > 0 ? (
                    <div className="space-y-2">
                      <Label>Linked product</Label>
                      <Select
                        value={ticket.product_id || ""}
                        onValueChange={(v) => onUpdate(index, "product_id", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a product…" />
                        </SelectTrigger>
                        <SelectContent>
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
                      <Link
                        href="/admin/merch/"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                      >
                        <Plus size={12} />
                        Create new product
                      </Link>
                    </div>
                  ) : (
                    <div className="rounded-md border border-warning/25 bg-warning/[0.04] p-3 space-y-2">
                      <p className="text-[11px] text-foreground">
                        No active products in your catalog yet.
                      </p>
                      <Link
                        href="/admin/merch/"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                      >
                        <Plus size={12} />
                        Create your first product
                      </Link>
                    </div>
                  )}

                  {linkedProduct && (() => {
                    const primaryImg = normalizeMerchImages(linkedProduct.images)[0];
                    return (
                      <div className="flex items-center gap-3 rounded-md border border-primary/15 bg-primary/[0.04] p-3">
                        {primaryImg && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={
                              primaryImg.startsWith("data:")
                                ? primaryImg
                                : `/api/media/${primaryImg}`
                            }
                            alt={linkedProduct.name}
                            className="h-10 w-10 rounded object-cover shrink-0 bg-background/50"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {linkedProduct.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {linkedProduct.type}
                            {linkedProduct.sizes.length > 0
                              ? ` · ${linkedProduct.sizes.join(", ")}`
                              : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
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
