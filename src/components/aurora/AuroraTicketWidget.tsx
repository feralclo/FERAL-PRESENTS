"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { AuroraCard, AuroraCardHeader, AuroraCardTitle, AuroraCardContent } from "./ui/card";
import { AuroraButton } from "./ui/button";
import { AuroraBadge } from "./ui/badge";
import { AuroraTicketCard } from "./AuroraTicketCard";
import { AuroraSocialProof } from "./AuroraSocialProof";
import { ExpressCheckout } from "@/components/checkout/ExpressCheckout";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import type { TicketTypeRow } from "@/types/events";
import type { Order } from "@/types/orders";

const TEE_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

interface AuroraTicketWidgetProps {
  eventSlug: string;
  eventId: string;
  paymentMethod: string;
  ticketTypes: TicketTypeRow[];
  currency: string;
  onCartChange?: (totalPrice: number, totalQty: number, items: { name: string; qty: number; size?: string }[]) => void;
  onCheckoutReady?: (checkoutFn: (() => void) | null) => void;
  ticketGroups?: string[];
  ticketGroupMap?: Record<string, string | null>;
  onViewMerch?: (ticketType: TicketTypeRow) => void;
  addMerchRef?: React.MutableRefObject<((ticketTypeId: string, size: string, qty: number) => void) | null>;
}

export function AuroraTicketWidget({
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
}: AuroraTicketWidgetProps) {
  const currSymbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  const isStripe = paymentMethod === "stripe";
  const { trackAddToCart: metaTrackAddToCart, trackInitiateCheckout: metaTrackInitiateCheckout } = useMetaTracking();
  const [expressError, setExpressError] = useState("");

  const activeTypes = useMemo(
    () =>
      ticketTypes
        .filter((tt) => tt.status === "active")
        .sort((a, b) => a.sort_order - b.sort_order),
    [ticketTypes]
  );

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [merchSizes, setMerchSizes] = useState<Record<string, Record<string, number>>>({});
  const [sizePopup, setSizePopup] = useState<{ ticketTypeId: string; selectedSize: string } | null>(null);

  const getQty = (id: string) => quantities[id] || 0;

  const addTicket = useCallback(
    (tt: TicketTypeRow) => {
      if (tt.includes_merch) {
        setSizePopup({ ticketTypeId: tt.id, selectedSize: "M" });
        return;
      }
      setQuantities((prev) => ({
        ...prev,
        [tt.id]: Math.min((prev[tt.id] || 0) + 1, tt.max_per_order),
      }));
      metaTrackAddToCart({
        content_name: tt.name,
        content_ids: [tt.id],
        content_type: "product",
        value: Number(tt.price),
        currency,
        num_items: 1,
      });
    },
    [metaTrackAddToCart, currency]
  );

  const removeTicket = useCallback((tt: TicketTypeRow) => {
    if (tt.includes_merch) {
      setMerchSizes((prev) => {
        const sizes = { ...prev[tt.id] };
        const lastSize = [...TEE_SIZES].reverse().find((s) => (sizes[s] || 0) > 0);
        if (!lastSize) return prev;
        sizes[lastSize] = (sizes[lastSize] || 0) - 1;
        if (sizes[lastSize] <= 0) delete sizes[lastSize];
        const newTotal = Object.values(sizes).reduce((a, b) => a + b, 0);
        setQuantities((qPrev) => ({ ...qPrev, [tt.id]: newTotal }));
        return { ...prev, [tt.id]: sizes };
      });
      return;
    }
    setQuantities((prev) => ({
      ...prev,
      [tt.id]: Math.max((prev[tt.id] || 0) - 1, 0),
    }));
  }, []);

  const handleSizeConfirm = useCallback(() => {
    if (!sizePopup) return;
    const { ticketTypeId, selectedSize } = sizePopup;
    const tt = activeTypes.find((t) => t.id === ticketTypeId);
    setMerchSizes((prev) => {
      const sizes = { ...(prev[ticketTypeId] || {}) };
      sizes[selectedSize] = (sizes[selectedSize] || 0) + 1;
      const newTotal = Object.values(sizes).reduce((a, b) => a + b, 0);
      setQuantities((qPrev) => ({ ...qPrev, [ticketTypeId]: newTotal }));
      return { ...prev, [ticketTypeId]: sizes };
    });
    if (tt) {
      metaTrackAddToCart({
        content_name: tt.name,
        content_ids: [tt.id],
        content_type: "product",
        value: Number(tt.price),
        currency,
        num_items: 1,
      });
    }
    setSizePopup(null);
  }, [sizePopup, activeTypes, metaTrackAddToCart, currency]);

  // Expose addMerch for TeeModal
  const addMerchExternal = useCallback(
    (ticketTypeId: string, size: string, qty: number) => {
      setMerchSizes((prev) => {
        const sizes = { ...(prev[ticketTypeId] || {}) };
        sizes[size] = (sizes[size] || 0) + qty;
        const newTotal = Object.values(sizes).reduce((a, b) => a + b, 0);
        setQuantities((qPrev) => ({ ...qPrev, [ticketTypeId]: newTotal }));
        return { ...prev, [ticketTypeId]: sizes };
      });
      const tt = activeTypes.find((t) => t.id === ticketTypeId);
      if (tt) {
        metaTrackAddToCart({
          content_name: tt.name,
          content_ids: [tt.id],
          content_type: "product",
          value: Number(tt.price) * qty,
          currency,
          num_items: qty,
        });
      }
    },
    [activeTypes, metaTrackAddToCart, currency]
  );

  useEffect(() => {
    if (addMerchRef) addMerchRef.current = addMerchExternal;
    return () => { if (addMerchRef) addMerchRef.current = null; };
  }, [addMerchRef, addMerchExternal]);

  const totalQty = useMemo(
    () => Object.values(quantities).reduce((a, b) => a + b, 0),
    [quantities]
  );

  const totalPrice = useMemo(
    () =>
      activeTypes.reduce(
        (sum, tt) => sum + (quantities[tt.id] || 0) * Number(tt.price),
        0
      ),
    [quantities, activeTypes]
  );

  const totalSold = useMemo(
    () => activeTypes.reduce((sum, tt) => sum + (tt.sold || 0), 0),
    [activeTypes]
  );

  const getCheckoutUrl = useCallback(() => {
    const items: string[] = [];
    for (const tt of activeTypes) {
      const qty = quantities[tt.id] || 0;
      if (qty <= 0) continue;
      if (tt.includes_merch && merchSizes[tt.id]) {
        for (const [size, sQty] of Object.entries(merchSizes[tt.id])) {
          if (sQty > 0) items.push(`${tt.id}:${sQty}:${size}`);
        }
      } else {
        items.push(`${tt.id}:${qty}`);
      }
    }
    if (items.length === 0) return null;
    return `/event/${eventSlug}/checkout/?cart=${encodeURIComponent(items.join(","))}`;
  }, [activeTypes, quantities, merchSizes, eventSlug]);

  const handleCheckout = useCallback(() => {
    const url = getCheckoutUrl();
    if (!url) return;
    const ids = activeTypes
      .filter((tt) => (quantities[tt.id] || 0) > 0)
      .map((tt) => tt.id);
    metaTrackInitiateCheckout({
      content_ids: ids,
      content_type: "product",
      value: totalPrice,
      currency,
      num_items: totalQty,
    });
    window.location.assign(url);
  }, [getCheckoutUrl, activeTypes, quantities, totalPrice, currency, totalQty, metaTrackInitiateCheckout]);

  useEffect(() => {
    onCheckoutReady?.(totalQty > 0 ? handleCheckout : null);
  }, [totalQty, handleCheckout, onCheckoutReady]);

  const handleExpressSuccess = useCallback(
    (order: Order) => {
      if (order.payment_ref) {
        window.location.assign(`/event/${eventSlug}/checkout/?pi=${order.payment_ref}`);
      } else {
        window.location.assign(`/event/${eventSlug}/checkout/`);
      }
    },
    [eventSlug]
  );

  const expressItems = useMemo(() => {
    const items: { ticket_type_id: string; qty: number; merch_size?: string }[] = [];
    for (const tt of activeTypes) {
      const qty = quantities[tt.id] || 0;
      if (qty <= 0) continue;
      if (tt.includes_merch && merchSizes[tt.id]) {
        for (const [size, sQty] of Object.entries(merchSizes[tt.id])) {
          if (sQty > 0) items.push({ ticket_type_id: tt.id, qty: sQty, merch_size: size });
        }
      } else {
        items.push({ ticket_type_id: tt.id, qty });
      }
    }
    return items;
  }, [activeTypes, quantities, merchSizes]);

  const cartItems = useMemo(() => {
    const items: { name: string; qty: number; size?: string }[] = [];
    for (const tt of activeTypes) {
      const qty = quantities[tt.id] || 0;
      if (qty <= 0) continue;
      if (tt.includes_merch && merchSizes[tt.id]) {
        for (const [size, sQty] of Object.entries(merchSizes[tt.id])) {
          if (sQty > 0) items.push({ name: tt.name, qty: sQty, size });
        }
      } else {
        items.push({ name: tt.name, qty });
      }
    }
    return items;
  }, [activeTypes, quantities, merchSizes]);

  useEffect(() => {
    onCartChange?.(totalPrice, totalQty, cartItems);
  }, [totalPrice, totalQty, cartItems, onCartChange]);

  if (activeTypes.length === 0) {
    return (
      <div id="tickets" className="py-4">
        <AuroraCard glass className="p-6 text-center">
          <p className="text-aurora-text-secondary">
            Tickets are not yet available for this event.
          </p>
        </AuroraCard>
      </div>
    );
  }

  // Group tickets
  const groupMap = ticketGroupMap || {};
  const groups = ticketGroups || [];
  const defaultGroup = activeTypes.filter((tt) => !groupMap[tt.id]);
  const namedGroups = groups
    .map((name) => ({
      name,
      tickets: activeTypes.filter((tt) => groupMap[tt.id] === name),
    }))
    .filter((g) => g.tickets.length > 0);

  return (
    <>
      <div id="tickets" className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-aurora-text">
            Get Tickets
          </h2>
          <AuroraSocialProof sold={totalSold} />
        </div>

        {/* Ticket Cards */}
        <div className="space-y-3">
          {defaultGroup.map((tt) => (
            <AuroraTicketCard
              key={tt.id}
              ticket={tt}
              qty={getQty(tt.id)}
              currSymbol={currSymbol}
              onAdd={() => addTicket(tt)}
              onRemove={() => removeTicket(tt)}
              onViewMerch={onViewMerch ? () => onViewMerch(tt) : undefined}
            />
          ))}

          {namedGroups.map((group) => (
            <div key={group.name}>
              <h3 className="text-sm font-medium text-aurora-text-secondary uppercase tracking-wider mb-2 mt-4">
                {group.name}
              </h3>
              <div className="space-y-3">
                {group.tickets.map((tt) => (
                  <AuroraTicketCard
                    key={tt.id}
                    ticket={tt}
                    qty={getQty(tt.id)}
                    currSymbol={currSymbol}
                    onAdd={() => addTicket(tt)}
                    onRemove={() => removeTicket(tt)}
                    onViewMerch={onViewMerch ? () => onViewMerch(tt) : undefined}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Cart Summary */}
        {totalQty > 0 && (
          <AuroraCard glass className="p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-aurora-text-secondary">
                {totalQty} {totalQty === 1 ? "ticket" : "tickets"}
              </span>
              <span className="text-lg font-bold text-aurora-text">
                {currSymbol}{totalPrice.toFixed(2)}
              </span>
            </div>

            {/* Cart lines */}
            <div className="space-y-1.5 text-sm border-t border-aurora-border/50 pt-3">
              {cartItems.map((item, i) => {
                const tt = activeTypes.find((t) => t.name === item.name);
                const unitPrice = tt ? Number(tt.price) : 0;
                const linePrice = unitPrice * item.qty;
                return (
                  <div key={i} className="flex items-center justify-between text-aurora-text-secondary">
                    <span>
                      {item.qty}&times; {item.name}
                      {item.size && <span className="ml-1 text-xs">({item.size})</span>}
                    </span>
                    <span className="tabular-nums">
                      {currSymbol}{linePrice % 1 === 0 ? linePrice : linePrice.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Checkout button */}
            <AuroraButton
              variant="primary"
              size="lg"
              glow
              className="w-full"
              onClick={handleCheckout}
            >
              Checkout &mdash; {currSymbol}{totalPrice.toFixed(2)}
            </AuroraButton>

            {/* Express checkout */}
            {isStripe && (
              <div className="pt-1">
                <ExpressCheckout
                  eventId={eventId}
                  currency={currency}
                  amount={totalPrice}
                  items={expressItems}
                  onSuccess={handleExpressSuccess}
                  onError={setExpressError}
                />
                {expressError && (
                  <p className="text-xs text-destructive mt-1">{expressError}</p>
                )}
              </div>
            )}
          </AuroraCard>
        )}

        {/* Empty state CTA */}
        {totalQty === 0 && (
          <AuroraButton
            variant="secondary"
            size="lg"
            className="w-full"
            disabled
          >
            Select tickets to continue
          </AuroraButton>
        )}
      </div>

      {/* Size Popup */}
      {sizePopup && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSizePopup(null);
          }}
        >
          <div className="aurora-glass-strong w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-aurora-text">Select Size</h3>
              <button
                className="text-aurora-text-secondary hover:text-aurora-text text-xl"
                onClick={() => setSizePopup(null)}
              >
                &times;
              </button>
            </div>
            <p className="text-sm text-aurora-text-secondary">
              {activeTypes.find((tt) => tt.id === sizePopup.ticketTypeId)?.name || "Ticket"}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {TEE_SIZES.map((size) => (
                <button
                  key={size}
                  className={`rounded-xl border py-2.5 text-sm font-medium transition-all ${
                    sizePopup.selectedSize === size
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-aurora-border text-aurora-text-secondary hover:border-aurora-text/30"
                  }`}
                  onClick={() =>
                    setSizePopup((prev) =>
                      prev ? { ...prev, selectedSize: size } : prev
                    )
                  }
                >
                  {size}
                </button>
              ))}
            </div>
            <AuroraButton
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleSizeConfirm}
            >
              Add to Cart
            </AuroraButton>
          </div>
        </div>
      )}
    </>
  );
}
