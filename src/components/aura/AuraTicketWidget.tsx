"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ShoppingCart,
  Ticket,
  ArrowRight,
  Lock,
} from "lucide-react";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { ExpressCheckout } from "@/components/checkout/ExpressCheckout";
import { AuraTicketCard } from "./AuraTicketCard";
import type { TicketTypeRow } from "@/types/events";

interface AuraTicketWidgetProps {
  eventSlug: string;
  eventId: string;
  paymentMethod: string;
  ticketTypes: TicketTypeRow[];
  currency: string;
  onCartChange?: (
    totalPrice: number,
    totalQty: number,
    items: { name: string; qty: number; size?: string }[]
  ) => void;
  onCheckoutReady?: (fn: () => void) => void;
  ticketGroups?: string[];
  ticketGroupMap?: Record<string, string | null>;
  onViewMerch?: (ticketType: TicketTypeRow) => void;
  addMerchRef?: React.MutableRefObject<
    ((ticketTypeId: string, size: string, qty: number) => void) | null
  >;
}

const CURR_SYMBOL: Record<string, string> = { GBP: "\u00a3", EUR: "\u20ac", USD: "$" };

export function AuraTicketWidget({
  eventSlug,
  eventId,
  paymentMethod,
  ticketTypes,
  currency,
  onCartChange,
  onCheckoutReady,
  ticketGroups,
  ticketGroupMap,
  onViewMerch,
  addMerchRef,
}: AuraTicketWidgetProps) {
  const router = useRouter();
  const { trackAddToCart, trackInitiateCheckout } = useMetaTracking();
  const currSymbol = CURR_SYMBOL[currency] || "$";
  const isStripe = paymentMethod === "stripe";

  // ── State ──────────────────────────────────────────────────────────────────
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [merchSizes, setMerchSizes] = useState<
    Record<string, Record<string, number>>
  >({});
  const [sizePopup, setSizePopup] = useState<{
    ticketTypeId: string;
    selectedSize: string;
  } | null>(null);
  const [expressError, setExpressError] = useState("");

  // ── Computed ────────────────────────────────────────────────────────────────
  const activeTypes = useMemo(
    () =>
      ticketTypes
        .filter((tt) => tt.status === "active")
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [ticketTypes]
  );

  const totalQty = useMemo(
    () => Object.values(quantities).reduce((s, q) => s + q, 0),
    [quantities]
  );

  const totalPrice = useMemo(() => {
    let sum = 0;
    for (const tt of activeTypes) {
      const q = quantities[tt.id] || 0;
      sum += q * tt.price;
    }
    return sum;
  }, [quantities, activeTypes]);

  const totalSold = useMemo(
    () => activeTypes.reduce((s, tt) => s + (tt.sold || 0), 0),
    [activeTypes]
  );

  const cartItems = useMemo(() => {
    const items: { name: string; qty: number; size?: string }[] = [];
    for (const tt of activeTypes) {
      const q = quantities[tt.id] || 0;
      if (q === 0) continue;
      if (tt.includes_merch && merchSizes[tt.id]) {
        for (const [size, sQty] of Object.entries(merchSizes[tt.id])) {
          if (sQty > 0) items.push({ name: tt.name, qty: sQty, size });
        }
      } else {
        items.push({ name: tt.name, qty: q });
      }
    }
    return items;
  }, [quantities, merchSizes, activeTypes]);

  const expressItems = useMemo(() => {
    const items: {
      ticket_type_id: string;
      qty: number;
      merch_size?: string;
    }[] = [];
    for (const tt of activeTypes) {
      const q = quantities[tt.id] || 0;
      if (q === 0) continue;
      if (tt.includes_merch && merchSizes[tt.id]) {
        for (const [size, sQty] of Object.entries(merchSizes[tt.id])) {
          if (sQty > 0)
            items.push({ ticket_type_id: tt.id, qty: sQty, merch_size: size });
        }
      } else {
        items.push({ ticket_type_id: tt.id, qty: q });
      }
    }
    return items;
  }, [activeTypes, quantities, merchSizes]);

  // ── Notify parent ──────────────────────────────────────────────────────────
  useEffect(() => {
    onCartChange?.(totalPrice, totalQty, cartItems);
  }, [totalPrice, totalQty, cartItems, onCartChange]);

  // ── Checkout URL ───────────────────────────────────────────────────────────
  const getCheckoutUrl = useCallback(() => {
    const parts: string[] = [];
    for (const tt of activeTypes) {
      const q = quantities[tt.id] || 0;
      if (q === 0) continue;
      if (tt.includes_merch && merchSizes[tt.id]) {
        for (const [size, sQty] of Object.entries(merchSizes[tt.id])) {
          if (sQty > 0) parts.push(`${tt.id}:${sQty}:${size}`);
        }
      } else {
        parts.push(`${tt.id}:${q}`);
      }
    }
    if (parts.length === 0) return null;
    return `/event/${eventSlug}/checkout/?cart=${encodeURIComponent(parts.join(","))}`;
  }, [activeTypes, quantities, merchSizes, eventSlug]);

  const handleCheckout = useCallback(() => {
    const url = getCheckoutUrl();
    if (!url) return;
    trackInitiateCheckout({
      content_ids: activeTypes
        .filter((tt) => (quantities[tt.id] || 0) > 0)
        .map((tt) => tt.id),
      content_type: "product",
      value: totalPrice,
      currency,
      num_items: totalQty,
    });
    router.push(url);
  }, [
    getCheckoutUrl,
    trackInitiateCheckout,
    activeTypes,
    quantities,
    totalPrice,
    currency,
    totalQty,
    router,
  ]);

  useEffect(() => {
    if (totalQty > 0) onCheckoutReady?.(handleCheckout);
    else onCheckoutReady?.(undefined as unknown as () => void);
  }, [totalQty, handleCheckout, onCheckoutReady]);

  // ── Cart operations ────────────────────────────────────────────────────────
  const addTicket = useCallback(
    (tt: TicketTypeRow) => {
      if (tt.includes_merch) {
        const sizes =
          tt.merch_sizes?.length
            ? tt.merch_sizes
            : ["XS", "S", "M", "L", "XL", "XXL"];
        setSizePopup({
          ticketTypeId: tt.id,
          selectedSize: sizes.includes("M") ? "M" : sizes[0],
        });
        return;
      }
      setQuantities((prev) => {
        const max = tt.max_per_order || 10;
        const cur = prev[tt.id] || 0;
        if (cur >= max) return prev;
        const next = { ...prev, [tt.id]: cur + 1 };
        trackAddToCart({
          content_name: tt.name,
          content_ids: [tt.id],
          content_type: "product",
          value: tt.price,
          currency,
          num_items: 1,
        });
        return next;
      });
    },
    [currency, trackAddToCart]
  );

  const removeTicket = useCallback(
    (tt: TicketTypeRow) => {
      if (tt.includes_merch && merchSizes[tt.id]) {
        const sizeEntries = Object.entries(merchSizes[tt.id]).filter(
          ([, q]) => q > 0
        );
        if (sizeEntries.length === 0) return;
        const [lastSize] = sizeEntries[sizeEntries.length - 1];
        setMerchSizes((prev) => {
          const updated = {
            ...prev[tt.id],
            [lastSize]: (prev[tt.id][lastSize] || 1) - 1,
          };
          if (updated[lastSize] <= 0) delete updated[lastSize];
          const result = { ...prev, [tt.id]: updated };
          const newTotal = Object.values(result[tt.id] || {}).reduce(
            (s, q) => s + q,
            0
          );
          setQuantities((qPrev) => ({ ...qPrev, [tt.id]: newTotal }));
          return result;
        });
        return;
      }
      setQuantities((prev) => {
        const cur = prev[tt.id] || 0;
        if (cur <= 0) return prev;
        return { ...prev, [tt.id]: cur - 1 };
      });
    },
    [merchSizes]
  );

  const handleSizeConfirm = useCallback(() => {
    if (!sizePopup) return;
    const { ticketTypeId, selectedSize } = sizePopup;
    const tt = activeTypes.find((t) => t.id === ticketTypeId);
    if (!tt) return;

    setMerchSizes((prev) => {
      const existing = prev[ticketTypeId] || {};
      return {
        ...prev,
        [ticketTypeId]: {
          ...existing,
          [selectedSize]: (existing[selectedSize] || 0) + 1,
        },
      };
    });
    setQuantities((prev) => ({
      ...prev,
      [ticketTypeId]: (prev[ticketTypeId] || 0) + 1,
    }));
    trackAddToCart({
      content_name: tt.name,
      content_ids: [tt.id],
      content_type: "product",
      value: tt.price,
      currency,
      num_items: 1,
    });
    setSizePopup(null);
  }, [sizePopup, activeTypes, currency, trackAddToCart]);

  // ── External merch add (from modal) ────────────────────────────────────────
  useEffect(() => {
    if (!addMerchRef) return;
    addMerchRef.current = (
      ticketTypeId: string,
      size: string,
      qty: number
    ) => {
      const tt = activeTypes.find((t) => t.id === ticketTypeId);
      if (!tt) return;
      setMerchSizes((prev) => {
        const existing = prev[ticketTypeId] || {};
        return {
          ...prev,
          [ticketTypeId]: {
            ...existing,
            [size]: (existing[size] || 0) + qty,
          },
        };
      });
      setQuantities((prev) => ({
        ...prev,
        [ticketTypeId]: (prev[ticketTypeId] || 0) + qty,
      }));
      trackAddToCart({
        content_name: tt.name,
        content_ids: [tt.id],
        content_type: "product",
        value: tt.price * qty,
        currency,
        num_items: qty,
      });
    };
  }, [addMerchRef, activeTypes, currency, trackAddToCart]);

  // ── Express checkout success ───────────────────────────────────────────────
  const handleExpressSuccess = useCallback(
    (order: { payment_ref?: string }) => {
      if (order.payment_ref) {
        router.push(`/event/${eventSlug}/checkout/?pi=${order.payment_ref}`);
      }
    },
    [router, eventSlug]
  );

  // ── Grouping ───────────────────────────────────────────────────────────────
  const groups = ticketGroups || [];
  const groupMap = ticketGroupMap || {};
  const defaultGroup = activeTypes.filter((tt) => !groupMap[tt.id]);
  const namedGroups = groups
    .map((name) => ({
      name,
      tickets: activeTypes.filter((tt) => groupMap[tt.id] === name),
    }))
    .filter((g) => g.tickets.length > 0);

  // ── Size popup helpers ─────────────────────────────────────────────────────
  const sizePopupTicket = sizePopup
    ? activeTypes.find((t) => t.id === sizePopup.ticketTypeId)
    : null;
  const sizePopupSizes = sizePopupTicket?.merch_sizes?.length
    ? sizePopupTicket.merch_sizes
    : ["XS", "S", "M", "L", "XL", "XXL"];

  // ── Empty state ────────────────────────────────────────────────────────────
  if (activeTypes.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Ticket
            size={32}
            className="mx-auto mb-3 text-muted-foreground"
          />
          <p className="text-sm text-muted-foreground">
            Tickets not yet available
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div id="tickets" className="space-y-4 scroll-mt-6">
      {/* Social proof stats */}
      {totalSold > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <Badge variant="default" className="gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />
            {Math.max(12, Math.floor(totalSold * 0.08))} viewing now
          </Badge>
          <Badge variant="secondary">{totalSold} sold</Badge>
        </div>
      )}

      {/* Default group -- each ticket in its own Card */}
      {defaultGroup.length > 0 && (
        <div className="space-y-3">
          {defaultGroup.map((tt) => (
            <AuraTicketCard
              key={tt.id}
              ticket={tt}
              qty={quantities[tt.id] || 0}
              currSymbol={currSymbol}
              onAdd={() => addTicket(tt)}
              onRemove={() => removeTicket(tt)}
              onViewMerch={
                tt.includes_merch && onViewMerch
                  ? () => onViewMerch(tt)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Named groups with Badge header */}
      {namedGroups.map((group) => (
        <div key={group.name} className="space-y-3">
          <div className="flex items-center gap-2 pt-2">
            <Badge
              variant="outline"
              className="text-xs uppercase tracking-wider"
            >
              {group.name}
            </Badge>
            <Separator className="flex-1 opacity-30" />
          </div>
          {group.tickets.map((tt) => (
            <AuraTicketCard
              key={tt.id}
              ticket={tt}
              qty={quantities[tt.id] || 0}
              currSymbol={currSymbol}
              onAdd={() => addTicket(tt)}
              onRemove={() => removeTicket(tt)}
              onViewMerch={
                tt.includes_merch && onViewMerch
                  ? () => onViewMerch(tt)
                  : undefined
              }
            />
          ))}
        </div>
      ))}

      {/* Cart summary */}
      {totalQty > 0 && (
        <Card className="border-primary/30 py-0 gap-0">
          <CardHeader className="px-5 pt-5 pb-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShoppingCart size={14} className="text-primary" />
              {totalQty} {totalQty === 1 ? "ticket" : "tickets"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 py-3 space-y-3">
            <div className="space-y-1">
              {cartItems.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs text-muted-foreground"
                >
                  <span>
                    {item.qty}&times; {item.name}
                    {item.size && (
                      <Badge
                        variant="secondary"
                        className="ml-1.5 text-[9px] py-0 px-1.5"
                      >
                        {item.size}
                      </Badge>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <Separator className="opacity-30" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-bold tabular-nums">
                {currSymbol}
                {totalPrice.toFixed(2)}
              </span>
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-2 px-5 pb-5 pt-0">
            <Button
              size="lg"
              className="w-full text-base font-semibold"
              onClick={handleCheckout}
            >
              Checkout
              <ArrowRight size={18} />
            </Button>
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Lock size={11} />
              <span>Secure checkout</span>
            </div>

            {/* Express checkout */}
            {isStripe && totalQty > 0 && (
              <div className="w-full pt-1">
                <div className="flex items-center gap-3 py-2">
                  <Separator className="flex-1 opacity-30" />
                  <span className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">
                    or
                  </span>
                  <Separator className="flex-1 opacity-30" />
                </div>
                <ExpressCheckout
                  eventId={eventId}
                  amount={totalPrice}
                  items={expressItems}
                  currency={currency}
                  onSuccess={handleExpressSuccess}
                  onError={(msg) => setExpressError(msg)}
                />
                {expressError && (
                  <p className="mt-2 text-xs text-destructive text-center">
                    {expressError}
                  </p>
                )}
              </div>
            )}
          </CardFooter>
        </Card>
      )}

      {/* Size selection dialog */}
      <Dialog
        open={sizePopup !== null}
        onOpenChange={(open) => {
          if (!open) setSizePopup(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Select Size</DialogTitle>
            {sizePopupTicket && (
              <DialogDescription>
                {sizePopupTicket.name}
                {sizePopupTicket.merch_name && (
                  <> &mdash; includes {sizePopupTicket.merch_name}</>
                )}
              </DialogDescription>
            )}
          </DialogHeader>
          {sizePopupTicket && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium">{sizePopupTicket.name}</span>
                  {sizePopupTicket.merch_description && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {sizePopupTicket.merch_description}
                    </p>
                  )}
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {currSymbol}{sizePopupTicket.price.toFixed(2)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {sizePopupSizes.map((size) => (
                  <Button
                    key={size}
                    variant={
                      sizePopup?.selectedSize === size ? "default" : "outline"
                    }
                    onClick={() =>
                      setSizePopup((prev) =>
                        prev ? { ...prev, selectedSize: size } : null
                      )
                    }
                    className="w-full"
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              size="lg"
              className="w-full font-semibold"
              onClick={handleSizeConfirm}
            >
              Add to Cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
