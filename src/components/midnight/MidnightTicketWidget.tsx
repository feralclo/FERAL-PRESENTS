"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExpressCheckout } from "@/components/checkout/ExpressCheckout";
import { preloadStripe } from "@/lib/stripe/client";
import { MidnightTicketCard } from "./MidnightTicketCard";
import { MidnightCartSummary } from "./MidnightCartSummary";
import { MidnightTierProgression } from "./MidnightTierProgression";
import { MidnightSizeSelector } from "./MidnightSizeSelector";
import type { UseCartResult } from "@/hooks/useCart";
import type { TicketTypeRow } from "@/types/events";
import type { Order } from "@/types/orders";

interface MidnightTicketWidgetProps {
  eventSlug: string;
  eventId: string;
  paymentMethod: string;
  currency: string;
  ticketTypes: TicketTypeRow[];
  cart: UseCartResult;
  ticketGroups?: string[];
  ticketGroupMap?: Record<string, string | null>;
  onViewMerch?: (ticketType: TicketTypeRow) => void;
}

export function MidnightTicketWidget({
  eventSlug,
  eventId,
  paymentMethod,
  currency,
  ticketTypes,
  cart,
  ticketGroups,
  ticketGroupMap,
  onViewMerch,
}: MidnightTicketWidgetProps) {
  const isStripe = paymentMethod === "stripe";
  const [expressError, setExpressError] = useState("");

  // Track first item → glow animations
  const hadItemsBefore = useRef(false);
  const [ctaGlow, setCtaGlow] = useState(false);
  const [expressRevealed, setExpressRevealed] = useState(false);

  const {
    activeTypes,
    quantities,
    sizePopup,
    setSizePopup,
    totalQty,
    totalPrice,
    cartItems,
    expressItems,
    currSymbol,
    addTicket,
    removeTicket,
    handleSizeConfirm,
    handleCheckout,
  } = cart;

  // Detect first item added → trigger one-shot CTA glow + express reveal
  useEffect(() => {
    if (totalQty > 0 && !hadItemsBefore.current) {
      hadItemsBefore.current = true;
      setCtaGlow(true);
      if (isStripe) setExpressRevealed(true);
      const timer = setTimeout(() => setCtaGlow(false), 600);
      return () => clearTimeout(timer);
    }
    if (totalQty === 0) {
      hadItemsBefore.current = false;
    }
  }, [totalQty, isStripe]);

  // Pre-warm Stripe.js + account fetch while user browses tickets.
  // By the time they tap "add," both are cached — Express Checkout
  // renders ~1s faster.
  useEffect(() => {
    if (isStripe) preloadStripe();
  }, [isStripe]);

  // Express checkout success — redirect to confirmation
  const handleExpressSuccess = useCallback(
    (order: Order) => {
      if (order.payment_ref) {
        window.location.assign(
          `/event/${eventSlug}/checkout/?pi=${order.payment_ref}`
        );
      } else {
        window.location.assign(`/event/${eventSlug}/checkout/`);
      }
    },
    [eventSlug]
  );

  // Progression tickets: standard-tier ungrouped, not archived
  const groupMap = ticketGroupMap || {};
  const progressionTickets = useMemo(
    () =>
      ticketTypes
        .filter(
          (tt) =>
            (tt.tier || "standard") === "standard" &&
            !groupMap[tt.id] &&
            tt.status !== "archived"
        )
        .sort((a, b) => a.sort_order - b.sort_order),
    [ticketTypes, groupMap]
  );

  // Size popup helpers
  const sizePopupTicket = sizePopup
    ? activeTypes.find((t) => t.id === sizePopup.ticketTypeId)
    : null;
  const sizePopupSizes = sizePopupTicket?.merch_sizes?.length
    ? sizePopupTicket.merch_sizes
    : ["XS", "S", "M", "L", "XL", "XXL"];

  // Empty state
  if (activeTypes.length === 0) {
    return (
      <aside
        className="sticky top-[calc(var(--header-height,80px)+24px)] z-50 scroll-mt-[calc(var(--header-height,80px)+24px)] max-lg:scroll-mt-[var(--header-height,80px)] max-lg:relative [overflow-anchor:none]"
        id="tickets"
      >
        <Card className="glass rounded-2xl p-7 max-lg:rounded-none max-lg:p-6 max-lg:shadow-none">
          <h3 className="font-[family-name:var(--font-mono)] text-sm font-bold tracking-[4px] uppercase mb-2">
            Get Tickets<span className="text-primary">_</span>
          </h3>
          <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[1px] text-muted-foreground">
            Tickets are not yet available for this event.
          </p>
        </Card>
      </aside>
    );
  }

  // Group tickets: default group first, then named groups
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
      <aside
        className="sticky top-[calc(var(--header-height,80px)+24px)] z-50 scroll-mt-[calc(var(--header-height,80px)+24px)] max-lg:scroll-mt-[var(--header-height,80px)] max-lg:relative [overflow-anchor:none]"
        id="tickets"
      >
        <Card className="glass rounded-2xl max-lg:rounded-none max-lg:border-x-0 max-lg:border-t max-lg:border-t-primary/15 max-lg:shadow-none max-lg:backdrop-blur-0 max-lg:bg-card p-0 gap-0">
          <CardContent className="p-7 max-lg:p-6 max-[480px]:p-4">
            <h3 className="font-[family-name:var(--font-mono)] text-sm font-bold tracking-[4px] uppercase mb-2">
              Get Tickets<span className="text-primary">_</span>
            </h3>
            <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[1px] text-muted-foreground mb-5">
              Secure your entry. Limited availability.
            </p>

            {/* Release progression bar */}
            <MidnightTierProgression tickets={progressionTickets} currSymbol={currSymbol} />

            {/* Default (ungrouped) tickets */}
            {defaultGroup.map((tt) => (
              <MidnightTicketCard
                key={tt.id}
                ticket={tt}
                qty={quantities[tt.id] || 0}
                currSymbol={currSymbol}
                onAdd={addTicket}
                onRemove={removeTicket}
                onViewMerch={onViewMerch}
              />
            ))}

            {/* Named groups with headers */}
            {namedGroups.map((group) => (
              <div key={group.name} className="mt-5 max-[480px]:mt-4 pt-4 max-[480px]:pt-3 border-t border-foreground/[0.06]">
                <div className="flex items-center gap-2.5 max-[480px]:gap-2 mb-2.5 max-[480px]:mb-2">
                  <Badge variant="outline" className="font-[family-name:var(--font-mono)] text-[0.6rem] max-[480px]:text-[0.55rem] font-bold tracking-[0.2em] uppercase text-muted-foreground shrink-0">
                    {group.name}
                  </Badge>
                  <Separator className="flex-1 opacity-30" />
                </div>
                {group.tickets.map((tt) => (
                  <MidnightTicketCard
                    key={tt.id}
                    ticket={tt}
                    qty={quantities[tt.id] || 0}
                    currSymbol={currSymbol}
                    onAdd={addTicket}
                    onRemove={removeTicket}
                    onViewMerch={onViewMerch}
                  />
                ))}
              </div>
            ))}

            {/* Checkout Button */}
            <Button
              className={`w-full h-12 mt-4 text-[0.85rem] max-[480px]:text-[0.8rem] font-bold tracking-[0.02em] uppercase ${ctaGlow ? "midnight-cta-ready" : ""}`}
              disabled={totalQty === 0}
              onClick={handleCheckout}
            >
              {totalQty === 0
                ? "Select tickets to continue"
                : <>Checkout — <span key={totalPrice} className="midnight-qty-pop inline-block">{currSymbol}{totalPrice.toFixed(2)}</span></>}
            </Button>

            {/* Express Checkout (Apple Pay / Google Pay) — always mounted for
                instant readiness. Hidden until first item added, then reveals
                with smooth expand animation. */}
            {isStripe && (
              <div
                className={`mt-0 overflow-hidden transition-all duration-500 ease-out ${
                  totalQty > 0
                    ? "opacity-100 max-h-[200px]"
                    : "opacity-0 max-h-0 pointer-events-none"
                } ${expressRevealed && totalQty > 0 ? "midnight-reveal-glow rounded-lg" : ""}`}
              >
                <div className="flex items-center gap-3 py-3.5">
                  <Separator className="flex-1 opacity-30" />
                  <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.15em] uppercase text-muted-foreground/80 shrink-0">
                    or
                  </span>
                  <Separator className="flex-1 opacity-30" />
                </div>
                <div className="rounded-lg overflow-hidden">
                  <ExpressCheckout
                    eventId={eventId}
                    currency={currency}
                    amount={totalPrice}
                    items={expressItems}
                    onSuccess={handleExpressSuccess}
                    onError={setExpressError}
                  />
                </div>
                {expressError && (
                  <div className="mt-2 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.5px] text-destructive text-center p-2 bg-destructive/[0.06] border border-destructive/15 rounded-lg">
                    {expressError}
                  </div>
                )}
              </div>
            )}

            {/* Cart Summary */}
            <MidnightCartSummary
              items={cartItems}
              totalPrice={totalPrice}
              totalQty={totalQty}
              currSymbol={currSymbol}
            />
          </CardContent>
        </Card>
      </aside>

      {/* Size Selection Dialog — Radix Dialog with focus trap + aria-modal */}
      <Dialog
        open={sizePopup !== null}
        onOpenChange={(open) => {
          if (!open) setSizePopup(null);
        }}
      >
        <DialogContent className="max-w-[360px] text-center">
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-mono)] text-xs font-bold tracking-[2px] uppercase text-platinum">
              Select Your Size
            </DialogTitle>
            {sizePopupTicket && (
              <DialogDescription className="font-[family-name:var(--font-mono)] text-[10px] tracking-[1px]">
                {sizePopupTicket.name}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="my-4">
            <MidnightSizeSelector
              sizes={sizePopupSizes}
              selectedSize={sizePopup?.selectedSize || "M"}
              onSelect={(size) =>
                setSizePopup((prev) =>
                  prev ? { ...prev, selectedSize: size } : prev
                )
              }
            />
          </div>
          <DialogFooter>
            <Button
              size="lg"
              className="w-full midnight-metallic-cta font-[family-name:var(--font-mono)] text-[11px] tracking-[2px] uppercase rounded-lg"
              onClick={handleSizeConfirm}
            >
              Add to Cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
