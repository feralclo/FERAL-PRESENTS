"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { ExpressCheckout } from "@/components/checkout/ExpressCheckout";
import type { TicketTypeRow } from "@/types/events";
import type { Order } from "@/types/orders";

const TEE_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

interface DynamicTicketWidgetProps {
  eventSlug: string;
  eventId: string;
  paymentMethod: string;
  ticketTypes: TicketTypeRow[];
  currency: string;
  onCartChange?: (totalPrice: number, totalQty: number) => void;
}

/** Tier → CSS class mapping for visual styling */
const TIER_CLASS: Record<string, string> = {
  standard: "",
  platinum: "ticket-option--vip",
  black: "ticket-option--vip-black",
};

export function DynamicTicketWidget({
  eventSlug,
  eventId,
  paymentMethod,
  ticketTypes,
  currency,
  onCartChange,
}: DynamicTicketWidgetProps) {
  const currSymbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  const isStripe = paymentMethod === "stripe";
  const [expressError, setExpressError] = useState("");

  // Only show active ticket types, sorted by sort_order
  const activeTypes = useMemo(
    () =>
      ticketTypes
        .filter((tt) => tt.status === "active")
        .sort((a, b) => a.sort_order - b.sort_order),
    [ticketTypes]
  );

  // Quantity state: { [ticketTypeId]: qty }
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Size state for merch tickets: { [ticketTypeId]: { [size]: qty } }
  const [merchSizes, setMerchSizes] = useState<
    Record<string, Record<string, number>>
  >({});

  // Size popup state
  const [sizePopup, setSizePopup] = useState<{
    ticketTypeId: string;
    selectedSize: string;
  } | null>(null);

  const getQty = (id: string) => quantities[id] || 0;

  const addTicket = useCallback(
    (tt: TicketTypeRow) => {
      if (tt.includes_merch) {
        // Show size popup
        setSizePopup({ ticketTypeId: tt.id, selectedSize: "M" });
        return;
      }
      setQuantities((prev) => ({
        ...prev,
        [tt.id]: Math.min((prev[tt.id] || 0) + 1, tt.max_per_order),
      }));
    },
    []
  );

  const removeTicket = useCallback(
    (tt: TicketTypeRow) => {
      if (tt.includes_merch) {
        // Remove last size added
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
    },
    []
  );

  const handleSizeConfirm = useCallback(() => {
    if (!sizePopup) return;
    const { ticketTypeId, selectedSize } = sizePopup;
    setMerchSizes((prev) => {
      const sizes = { ...(prev[ticketTypeId] || {}) };
      sizes[selectedSize] = (sizes[selectedSize] || 0) + 1;
      const newTotal = Object.values(sizes).reduce((a, b) => a + b, 0);
      setQuantities((qPrev) => ({ ...qPrev, [ticketTypeId]: newTotal }));
      return { ...prev, [ticketTypeId]: sizes };
    });
    setSizePopup(null);
  }, [sizePopup]);

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

  // Notify parent of cart changes (for bottom bar updates)
  useEffect(() => {
    onCartChange?.(totalPrice, totalQty);
  }, [totalPrice, totalQty, onCartChange]);

  const getCheckoutUrl = useCallback(() => {
    const items: string[] = [];
    for (const tt of activeTypes) {
      const qty = quantities[tt.id] || 0;
      if (qty <= 0) continue;

      if (tt.includes_merch && merchSizes[tt.id]) {
        // Each size as separate cart item
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
    if (url) window.location.assign(url);
  }, [getCheckoutUrl]);

  // Express checkout (Apple Pay / Google Pay) success — redirect to confirmation
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

  // Build items array for express checkout
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

  // Cart summary items
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

  // Find minimum price for display
  const minPrice = activeTypes.length > 0
    ? Math.min(...activeTypes.map((tt) => Number(tt.price)))
    : 0;

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
              {activeTypes.map((tt) => {
                const tierClass = TIER_CLASS[tt.tier || "standard"] || "";
                const qty = getQty(tt.id);
                const priceDisplay =
                  Number(tt.price) % 1 === 0
                    ? Number(tt.price)
                    : Number(tt.price).toFixed(2);

                return (
                  <div
                    key={tt.id}
                    className={`ticket-option ${tierClass}`}
                    data-ticket-id={tt.id}
                  >
                    <div className="ticket-option__row">
                      <div className="ticket-option__info">
                        <span className="ticket-option__name">{tt.name}</span>
                        <span className="ticket-option__perks">
                          {tt.description || "Standard entry"}
                        </span>
                      </div>
                      <span className="ticket-option__price">
                        {currSymbol}{priceDisplay}
                      </span>
                    </div>
                    <div className="ticket-option__bottom">
                      {tt.includes_merch ? (
                        <span
                          className="ticket-option__view-tee"
                          style={{ cursor: "default", opacity: 0.6 }}
                        >
                          Includes merch
                        </span>
                      ) : (
                        <span />
                      )}
                      <div className="ticket-option__controls">
                        <button
                          className="ticket-option__btn"
                          onClick={() => removeTicket(tt)}
                          aria-label="Remove"
                        >
                          &minus;
                        </button>
                        <span className="ticket-option__qty">{qty}</span>
                        <button
                          className="ticket-option__btn"
                          onClick={() => addTicket(tt)}
                          aria-label="Add"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

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
              {cartItems.length > 0 && (
                <div className="cart-summary">
                  <div className="cart-summary__label">Your Cart</div>
                  <div className="cart-summary__items">
                    {cartItems.map((item, i) => (
                      <div className="cart-summary__item" key={i}>
                        <span>
                          {item.qty}x {item.name}
                          {item.size && (
                            <span style={{ color: "#ff0033", marginLeft: 6, fontWeight: 700 }}>
                              {item.size}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
