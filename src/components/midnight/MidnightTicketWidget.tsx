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
import { getSequentialGroupTickets } from "@/lib/ticket-visibility";
import type { UseCartResult } from "@/hooks/useCart";
import type { TicketTypeRow } from "@/types/events";
import type { Order } from "@/types/orders";
import type { DiscountDisplay } from "./discount-utils";
import { getDiscountAmount } from "./discount-utils";

interface MidnightTicketWidgetProps {
  eventSlug: string;
  eventId: string;
  paymentMethod: string;
  currency: string;
  ticketTypes: TicketTypeRow[];
  cart: UseCartResult;
  ticketGroups?: string[];
  ticketGroupMap?: Record<string, string | null>;
  ticketGroupReleaseMode?: Record<string, "all" | "sequential">;
  onViewMerch?: (ticketType: TicketTypeRow) => void;
  discount?: DiscountDisplay | null;
  onApplyDiscount?: (d: DiscountDisplay) => void;
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
  ticketGroupReleaseMode,
  onViewMerch,
  discount,
  onApplyDiscount,
}: MidnightTicketWidgetProps) {
  const isStripe = paymentMethod === "stripe";
  const [expressError, setExpressError] = useState("");

  // Track first item → glow animations
  const hadItemsBefore = useRef(false);
  const [ctaGlow, setCtaGlow] = useState(false);
  const [expressRevealed, setExpressRevealed] = useState(false);
  const [expressAvailable, setExpressAvailable] = useState(false);

  // Manual discount code entry
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeValue, setCodeValue] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState("");
  const codeInputRef = useRef<HTMLInputElement>(null);

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

  // Compute discounted total for CTA display
  const discountedTotal = discount
    ? Math.max(0, Math.round((totalPrice - getDiscountAmount(totalPrice, discount)) * 100) / 100)
    : totalPrice;

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

  // Position discount code input above the mobile keyboard when opened.
  // Default autoFocus scrolls aggressively and pushes checkout out of view.
  // preventScroll hides the input behind the keyboard entirely.
  // Instead: scroll input to ~30% from viewport top (safely above keyboard),
  // then focus after a short delay so keyboard appears with input visible.
  useEffect(() => {
    if (!codeOpen || !codeInputRef.current) return;
    const el = codeInputRef.current;
    const rect = el.getBoundingClientRect();
    const targetY = window.innerHeight * 0.3;
    const scrollBy = rect.top - targetY;
    if (scrollBy > 20) {
      window.scrollBy({ top: scrollBy, behavior: "smooth" });
      // Focus after scroll settles so keyboard doesn't fight the scroll
      const timer = setTimeout(() => el.focus({ preventScroll: true }), 350);
      return () => clearTimeout(timer);
    } else {
      // Already in a good position — just focus
      el.focus({ preventScroll: true });
    }
  }, [codeOpen]);

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

  // Handle manual discount code submission
  const handleCodeApply = useCallback(async () => {
    const code = codeValue.trim();
    if (!code) return;
    setCodeError("");
    setCodeLoading(true);
    try {
      const res = await fetch("/api/discounts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, event_id: eventId }),
      });
      const data = await res.json();
      if (data.valid && data.discount) {
        sessionStorage.setItem("feral_popup_discount", data.discount.code);
        setCodeOpen(false);
        setCodeValue("");
        onApplyDiscount?.({
          code: data.discount.code,
          type: data.discount.type,
          value: data.discount.value,
        });
      } else {
        setCodeError(data.error || "Invalid code");
      }
    } catch {
      setCodeError("Something went wrong");
    } finally {
      setCodeLoading(false);
    }
  }, [codeValue, eventId, onApplyDiscount]);

  // Progression tickets: standard-tier ungrouped, not archived
  const groupMap = ticketGroupMap || {};
  const releaseMode = ticketGroupReleaseMode || {};
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

  // For each named sequential group, get ALL tickets (including hidden) for progression bar
  const sequentialGroupProgressions = useMemo(() => {
    const result: { name: string; tickets: TicketTypeRow[] }[] = [];
    const groups = ticketGroups || [];
    for (const name of groups) {
      if (releaseMode[name] === "sequential") {
        const allGroupTickets = getSequentialGroupTickets(ticketTypes, name, ticketGroupMap);
        if (allGroupTickets.length > 1) {
          result.push({ name, tickets: allGroupTickets });
        }
      }
    }
    return result;
  }, [ticketGroups, ticketTypes, ticketGroupMap, releaseMode]);

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
        className="sticky top-[calc(var(--header-height,80px)+24px)] lg:z-50 scroll-mt-[var(--header-height,80px)] max-lg:scroll-mt-[calc(var(--header-height,80px)-20px)] max-lg:relative [overflow-anchor:none]"
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
        className="sticky top-[calc(var(--header-height,80px)+24px)] lg:z-50 scroll-mt-[var(--header-height,80px)] max-lg:scroll-mt-[calc(var(--header-height,80px)-20px)] max-lg:relative [overflow-anchor:none]"
        id="tickets"
      >
        {/* Desktop: glass card. Mobile: transparent — tickets float on page bg */}
        <Card className="glass rounded-2xl max-lg:rounded-none max-lg:border-0 max-lg:shadow-none max-lg:backdrop-blur-0 max-lg:bg-transparent p-0 gap-0">
          <CardContent className="p-8 max-lg:p-6 max-[480px]:p-4">
            {/* Section header */}
            <h3 className="font-[family-name:var(--font-sans)] text-lg font-bold tracking-[-0.01em] mb-1.5">
              Tickets
            </h3>
            <p className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.12em] uppercase text-foreground/30 mb-6">
              Select your tickets below
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
                discount={discount}
              />
            ))}

            {/* Named groups with headers */}
            {namedGroups.map((group) => {
              const seqProg = sequentialGroupProgressions.find((s) => s.name === group.name);
              return (
                <div key={group.name} className="mt-6 max-[480px]:mt-5 pt-5 max-[480px]:pt-4 border-t border-foreground/[0.05]">
                  <div className="flex items-center gap-2.5 max-[480px]:gap-2 mb-3 max-[480px]:mb-2.5">
                    <Badge variant="outline" className="font-[family-name:var(--font-mono)] text-[0.6rem] max-[480px]:text-[0.55rem] font-bold tracking-[0.2em] uppercase text-muted-foreground/60 shrink-0 rounded-md">
                      {group.name}
                    </Badge>
                    <Separator className="flex-1 opacity-20" />
                  </div>
                  {seqProg && (
                    <MidnightTierProgression tickets={seqProg.tickets} currSymbol={currSymbol} />
                  )}
                  {group.tickets.map((tt) => (
                    <MidnightTicketCard
                      key={tt.id}
                      ticket={tt}
                      qty={quantities[tt.id] || 0}
                      currSymbol={currSymbol}
                      onAdd={addTicket}
                      onRemove={removeTicket}
                      onViewMerch={onViewMerch}
                      discount={discount}
                    />
                  ))}
                </div>
              );
            })}

            {/* Checkout CTA — ghost when empty, frosted glass when active */}
            <button
              type="button"
              className={cn(
                "w-full h-[48px] mt-5 text-[13px] max-[480px]:text-xs font-bold tracking-[0.03em] uppercase rounded-xl transition-all duration-300 cursor-pointer",
                totalQty === 0
                  ? "bg-foreground/[0.04] text-foreground/25 border border-foreground/[0.06] cursor-default"
                  : "bg-white/[0.12] border border-white/[0.18] text-foreground shadow-[0_0_20px_rgba(255,255,255,0.04)] hover:bg-white/[0.18] hover:border-white/[0.25] hover:shadow-[0_0_24px_rgba(255,255,255,0.07)] active:scale-[0.98]",
                ctaGlow ? "midnight-cta-ready" : "",
              )}
              disabled={totalQty === 0}
              onClick={handleCheckout}
            >
              {totalQty === 0
                ? "Select tickets to continue"
                : <span className="flex items-center justify-center gap-2.5">
                    <span>Checkout</span>
                    <span className="w-px h-3.5 bg-white/20" />
                    <span key={discountedTotal} className="midnight-qty-pop inline-block font-[family-name:var(--font-mono)] tracking-[0.04em]">{currSymbol}{discountedTotal.toFixed(2)}</span>
                  </span>}
            </button>

            {/* Express Checkout (Apple Pay / Google Pay) — always mounted
                for instant readiness. Hidden until first item added.
                "or" divider only renders when express methods are confirmed available. */}
            {isStripe && (
              <div
                className={`mt-0 overflow-hidden transition-all duration-500 ease-out ${
                  totalQty > 0
                    ? "opacity-100 max-h-[300px]"
                    : "opacity-0 max-h-0 pointer-events-none"
                }`}
              >
                {/* Divider — gradient lines with quiet label */}
                {expressAvailable && (
                  <div className="flex items-center gap-3 pt-5 pb-4">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
                    <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.2em] uppercase text-white/20 shrink-0">
                      or
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
                  </div>
                )}

                {/* Glass enclosure — only styled when express methods confirmed.
                    ExpressCheckout stays mounted always for instant readiness,
                    but the glass treatment is invisible until onAvailable fires. */}
                <div className={expressAvailable ? "midnight-express-glass rounded-2xl p-3" : ""}>
                  <div className={expressAvailable ? "midnight-express-btn-frame rounded-xl overflow-hidden" : "rounded-xl overflow-hidden"}>
                    <ExpressCheckout
                      eventId={eventId}
                      currency={currency}
                      amount={discountedTotal}
                      items={expressItems}
                      onSuccess={handleExpressSuccess}
                      onError={setExpressError}
                      onAvailable={() => setExpressAvailable(true)}
                      discountCode={discount?.code}
                    />
                  </div>
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
              discount={discount}
            />

            {/* Manual discount code entry — visible only with items and no active discount */}
            {totalQty > 0 && !discount && (
              <div className="mt-3">
                {!codeOpen ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[12px] tracking-[0.06em] text-emerald-400/70 hover:text-emerald-400 border-b border-dashed border-emerald-400/30 hover:border-emerald-400/50 transition-colors duration-200 cursor-pointer bg-transparent border-t-0 border-x-0 p-0 pb-px"
                    onClick={() => setCodeOpen(true)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>
                    Have a code?
                  </button>
                ) : (
                  <div className="overflow-hidden animate-in slide-in-from-top-1 fade-in duration-200">
                    <div className="flex gap-2">
                      <input
                        ref={codeInputRef}
                        type="text"
                        value={codeValue}
                        onChange={(e) => { setCodeValue(e.target.value.toUpperCase()); setCodeError(""); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCodeApply(); } }}
                        placeholder="Enter code"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        className="flex-1 min-w-0 bg-white/[0.04] border border-white/[0.10] rounded-lg text-foreground font-[family-name:var(--font-mono)] text-[16px] tracking-[0.04em] py-2.5 px-3 outline-none transition-colors duration-150 placeholder:text-foreground/25 focus:border-white/[0.25] focus:bg-white/[0.06]"
                        disabled={codeLoading}
                      />
                      <button
                        type="button"
                        className={cn(
                          "shrink-0 px-4 py-2.5 rounded-lg font-[family-name:var(--font-mono)] text-[10px] tracking-[0.1em] uppercase font-bold transition-all duration-150 cursor-pointer",
                          codeLoading
                            ? "bg-white/[0.06] text-foreground/30 cursor-wait"
                            : "bg-white/[0.10] border border-white/[0.15] text-foreground/70 hover:bg-white/[0.16] hover:text-foreground active:scale-[0.97]"
                        )}
                        onClick={handleCodeApply}
                        disabled={codeLoading || !codeValue.trim()}
                      >
                        {codeLoading ? "..." : "Apply"}
                      </button>
                    </div>
                    {codeError && (
                      <p className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.04em] text-red-400/70 mt-2 m-0">
                        {codeError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
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
        <DialogContent data-theme="midnight" className="max-w-[360px] text-center rounded-2xl">
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
            <button
              type="button"
              className="w-full h-11 bg-white text-[#0a0a0c] font-[family-name:var(--font-sans)] text-xs font-bold tracking-[0.06em] uppercase rounded-xl active:scale-[0.98] transition-transform duration-150 cursor-pointer"
              onClick={handleSizeConfirm}
            >
              Add to Cart
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

