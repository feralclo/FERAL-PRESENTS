"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

  // Pre-warm Stripe.js while user browses
  useEffect(() => {
    if (isStripe) preloadStripe();
  }, [isStripe]);

  // Express checkout success → redirect
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
        <Card className="glass rounded-2xl p-8 max-lg:rounded-none max-lg:p-6 max-lg:shadow-none max-lg:bg-transparent max-lg:border-0">
          <h3 className="font-[family-name:var(--font-sans)] text-lg font-bold tracking-[-0.01em] mb-2">
            Tickets
          </h3>
          <p className="font-[family-name:var(--font-sans)] text-sm text-muted-foreground">
            Tickets are not yet available for this event.
          </p>
        </Card>
      </aside>
    );
  }

  // Group tickets
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
        {/* Desktop: glass card. Mobile: transparent — tickets float on page bg */}
        <Card className="glass rounded-2xl max-lg:rounded-none max-lg:border-0 max-lg:shadow-none max-lg:backdrop-blur-0 max-lg:bg-transparent p-0 gap-0">
          <CardContent className="p-8 max-lg:p-6 max-[480px]:p-4">
            {/* Section header */}
            <h3 className="font-[family-name:var(--font-sans)] text-lg font-bold tracking-[-0.01em] mb-1.5">
              Tickets
            </h3>
            <p className="font-[family-name:var(--font-display)] text-xs tracking-[0.02em] text-muted-foreground/70 mb-6">
              Limited availability
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
              <div key={group.name} className="mt-6 max-[480px]:mt-5 pt-5 max-[480px]:pt-4 border-t border-foreground/[0.05]">
                <div className="flex items-center gap-2.5 max-[480px]:gap-2 mb-3 max-[480px]:mb-2.5">
                  <Badge variant="outline" className="font-[family-name:var(--font-mono)] text-[0.6rem] max-[480px]:text-[0.55rem] font-bold tracking-[0.2em] uppercase text-muted-foreground/60 shrink-0 rounded-md">
                    {group.name}
                  </Badge>
                  <Separator className="flex-1 opacity-20" />
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

            {/* Checkout CTA — ghost when empty, vivid accent when items in cart */}
            <Button
              className={cn(
                "w-full h-[52px] mt-5 text-sm max-[480px]:text-[13px] font-bold tracking-[0.02em] uppercase rounded-xl transition-all duration-300",
                totalQty === 0
                  ? "bg-foreground/[0.04] text-foreground/25 border border-foreground/[0.06] hover:bg-foreground/[0.06] hover:text-foreground/35 shadow-none"
                  : "",
                ctaGlow ? "midnight-cta-ready" : "",
              )}
              variant={totalQty > 0 ? "default" : "ghost"}
              disabled={totalQty === 0}
              onClick={handleCheckout}
            >
              {totalQty === 0
                ? "Select tickets to continue"
                : <>Checkout &mdash; <span key={totalPrice} className="midnight-qty-pop inline-block">{currSymbol}{totalPrice.toFixed(2)}</span></>}
            </Button>

            {/* Express Checkout (Apple Pay / Google Pay) — always mounted
                for instant readiness. Hidden until first item added. */}
            {isStripe && (
              <div
                className={`mt-0 overflow-hidden transition-all duration-500 ease-out ${
                  totalQty > 0
                    ? "opacity-100 max-h-[200px]"
                    : "opacity-0 max-h-0 pointer-events-none"
                } ${expressRevealed && totalQty > 0 ? "midnight-reveal-glow rounded-lg" : ""}`}
              >
                <div className="flex items-center gap-3 py-4">
                  <Separator className="flex-1 opacity-20" />
                  <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.15em] uppercase text-muted-foreground/60 shrink-0">
                    or
                  </span>
                  <Separator className="flex-1 opacity-20" />
                </div>
                <div className="rounded-xl overflow-hidden">
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
                  <div className="mt-2.5 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.5px] text-destructive text-center p-2.5 bg-destructive/[0.05] border border-destructive/10 rounded-xl">
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

      {/* Size Selection Dialog */}
      <Dialog
        open={sizePopup !== null}
        onOpenChange={(open) => {
          if (!open) setSizePopup(null);
        }}
      >
        <DialogContent className="max-w-[360px] text-center rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-sans)] text-sm font-bold tracking-[0.02em] uppercase text-platinum">
              Select Your Size
            </DialogTitle>
            {sizePopupTicket && (
              <DialogDescription className="font-[family-name:var(--font-sans)] text-xs text-muted-foreground">
                {sizePopupTicket.name}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="my-5">
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
              className="w-full midnight-metallic-cta font-[family-name:var(--font-sans)] text-xs font-bold tracking-[0.06em] uppercase rounded-xl"
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

