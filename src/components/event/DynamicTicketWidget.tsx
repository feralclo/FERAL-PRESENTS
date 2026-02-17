"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { ExpressCheckout } from "@/components/checkout/ExpressCheckout";
import { TicketCard } from "./TicketCard";
import { CartSummary } from "./CartSummary";
import { TierProgression } from "./TierProgression";
import type { UseCartResult } from "@/hooks/useCart";
import type { TicketTypeRow } from "@/types/events";
import type { Order } from "@/types/orders";

const TEE_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

interface DynamicTicketWidgetProps {
  eventSlug: string;
  eventId: string;
  paymentMethod: string;
  currency: string;
  ticketTypes: TicketTypeRow[];
  cart: UseCartResult;
  onCartChange?: (totalPrice: number, totalQty: number, items: { name: string; qty: number; size?: string }[]) => void;
  onCheckoutReady?: (checkoutFn: (() => void) | null) => void;
  /** Named ticket groups (e.g. ["VIP Experiences"]) */
  ticketGroups?: string[];
  /** Map ticket type ID → group name (null = default ungrouped) */
  ticketGroupMap?: Record<string, string | null>;
  /** Called when user clicks "View Merch" on a ticket type with merch images */
  onViewMerch?: (ticketType: TicketTypeRow) => void;
}

export function DynamicTicketWidget({
  eventSlug,
  eventId,
  paymentMethod,
  currency,
  ticketTypes,
  cart,
  onCartChange,
  onCheckoutReady,
  ticketGroups,
  ticketGroupMap,
  onViewMerch,
}: DynamicTicketWidgetProps) {
  const isStripe = paymentMethod === "stripe";
  const [expressError, setExpressError] = useState("");

  const {
    activeTypes,
    quantities,
    sizePopup,
    setSizePopup,
    totalQty,
    totalPrice,
    cartItems,
    expressItems,
    minPrice,
    currSymbol,
    addTicket,
    removeTicket,
    handleSizeConfirm,
    handleCheckout,
  } = cart;

  // Expose checkout handler to parent (for bottom bar)
  useEffect(() => {
    onCheckoutReady?.(totalQty > 0 ? handleCheckout : null);
  }, [totalQty, handleCheckout, onCheckoutReady]);

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

  // Notify parent of cart changes (for bottom bar updates)
  useEffect(() => {
    onCartChange?.(totalPrice, totalQty, cartItems);
  }, [totalPrice, totalQty, cartItems, onCartChange]);

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

  if (activeTypes.length === 0) {
    return (
      <aside className="event-tickets" id="tickets">
        <div className="event-tickets__box">
          <h3 className="event-tickets__heading">
            Get Tickets<span className="text-red">_</span>
          </h3>
          <p className="event-tickets__subtext">
            Tickets are not yet available for this event.
          </p>
        </div>
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
      <aside className="event-tickets" id="tickets">
        <div className="event-tickets__box">
          <h3 className="event-tickets__heading">
            Get Tickets<span className="text-red">_</span>
          </h3>
          <p className="event-tickets__subtext">
            Secure your entry. Limited availability.
          </p>

          <div className="event-tickets__embed" id="tickets-embed">
            <div className="feral-tickets" id="feral-tickets">
              {/* Release progression bar */}
              <TierProgression tickets={progressionTickets} currSymbol={currSymbol} />

              {/* Default (ungrouped) tickets */}
              {defaultGroup.map((tt) => (
                <TicketCard
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
                <div key={group.name} className="ticket-group">
                  <div className="ticket-group__header">
                    <span className="ticket-group__name">{group.name}</span>
                  </div>
                  {group.tickets.map((tt) => (
                    <TicketCard
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
              <button
                className="feral-tickets__checkout"
                disabled={totalQty === 0}
                onClick={handleCheckout}
              >
                {totalQty === 0
                  ? "Select tickets to continue"
                  : `Checkout — ${currSymbol}${totalPrice.toFixed(2)}`}
              </button>

              {/* Express Checkout (Apple Pay / Google Pay) */}
              {isStripe && totalQty > 0 && (
                <div className="feral-tickets__express">
                  <div className="feral-tickets__express-divider">
                    <span className="feral-tickets__express-divider-line" />
                    <span className="feral-tickets__express-divider-text">or</span>
                    <span className="feral-tickets__express-divider-line" />
                  </div>
                  <ExpressCheckout
                    eventId={eventId}
                    currency={currency}
                    amount={totalPrice}
                    items={expressItems}
                    onSuccess={handleExpressSuccess}
                    onError={setExpressError}
                  />
                  {expressError && (
                    <div className="feral-tickets__express-error">{expressError}</div>
                  )}
                </div>
              )}

              {/* Cart Summary */}
              <CartSummary
                items={cartItems}
                ticketTypes={activeTypes}
                totalPrice={totalPrice}
                totalQty={totalQty}
                currSymbol={currSymbol}
              />
            </div>
          </div>

          {/* From price for bottom bar */}
          <div style={{ display: "none" }} data-min-price={minPrice} />
        </div>
      </aside>

      {/* Size Popup */}
      {sizePopup && (
        <div
          className="size-popup-overlay size-popup-overlay--visible"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSizePopup(null);
          }}
        >
          <div className="size-popup">
            <button
              className="size-popup__close"
              onClick={() => setSizePopup(null)}
            >
              &times;
            </button>
            <div className="size-popup__title">Select Your Size</div>
            <div className="size-popup__subtitle">
              {activeTypes.find((tt) => tt.id === sizePopup.ticketTypeId)?.name ||
                "Ticket"}
            </div>
            <div className="size-popup__options">
              {TEE_SIZES.map((size) => (
                <button
                  key={size}
                  className={`size-popup__btn ${
                    sizePopup.selectedSize === size
                      ? "size-popup__btn--selected"
                      : ""
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
            <button className="size-popup__confirm" onClick={handleSizeConfirm}>
              Add to Cart
            </button>
          </div>
        </div>
      )}
    </>
  );
}
