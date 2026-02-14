"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { ExpressCheckout } from "@/components/checkout/ExpressCheckout";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import type { TicketTypeRow } from "@/types/events";
import type { Order } from "@/types/orders";

const TEE_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

interface DynamicTicketWidgetProps {
  eventSlug: string;
  eventId: string;
  paymentMethod: string;
  ticketTypes: TicketTypeRow[];
  currency: string;
  onCartChange?: (totalPrice: number, totalQty: number, items: { name: string; qty: number; size?: string }[]) => void;
  onCheckoutReady?: (checkoutFn: (() => void) | null) => void;
  /** Named ticket groups (e.g. ["VIP Experiences"]) */
  ticketGroups?: string[];
  /** Map ticket type ID → group name (null = default ungrouped) */
  ticketGroupMap?: Record<string, string | null>;
  /** WeeZTix ticket IDs by sort_order for checkout URL generation */
  weeztixIds?: Record<number, string>;
  /** WeeZTix size-specific ticket IDs (e.g. { XS: "uuid", S: "uuid", ... }) */
  weeztixSizeIds?: Record<string, string>;
  /** Called when user clicks "View Merch" on a ticket type with merch images */
  onViewMerch?: (ticketType: TicketTypeRow) => void;
  /** Ref that receives a function to add merch from an external source (e.g. TeeModal) */
  addMerchRef?: React.MutableRefObject<((ticketTypeId: string, size: string, qty: number) => void) | null>;
}

/** Tier → CSS class mapping for visual styling */
const TIER_CLASS: Record<string, string> = {
  standard: "",
  platinum: "ticket-option--vip",
  black: "ticket-option--vip-black",
  valentine: "ticket-option--valentine",
};

export function DynamicTicketWidget({
  eventSlug,
  eventId,
  paymentMethod,
  ticketTypes,
  currency,
  onCartChange,
  onCheckoutReady,
  ticketGroups,
  ticketGroupMap,
  weeztixIds,
  weeztixSizeIds,
  onViewMerch,
  addMerchRef,
}: DynamicTicketWidgetProps) {
  const currSymbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  const isStripe = paymentMethod === "stripe";
  const { trackAddToCart: metaTrackAddToCart, trackInitiateCheckout: metaTrackInitiateCheckout } = useMetaTracking();
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

  // Expose addMerch function for external callers (TeeModal)
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

  const isWeeZTix = paymentMethod === "weeztix";

  const getCheckoutUrl = useCallback(() => {
    const items: string[] = [];
    for (const tt of activeTypes) {
      const qty = quantities[tt.id] || 0;
      if (qty <= 0) continue;

      if (isWeeZTix) {
        // WeeZTix checkout: use WeeZTix ticket IDs from settings
        if (tt.includes_merch && merchSizes[tt.id] && weeztixSizeIds) {
          // Size-specific WeeZTix IDs for merch tickets
          for (const [size, sQty] of Object.entries(merchSizes[tt.id])) {
            const sizeId = weeztixSizeIds[size];
            if (sQty > 0 && sizeId) items.push(`${sizeId}:${sQty}:${size}`);
          }
        } else {
          // Map by sort_order: ticket at sort_order N → weeztixIds[N]
          const wId = weeztixIds?.[tt.sort_order];
          if (wId) items.push(`${wId}:${qty}`);
        }
      } else {
        // Native checkout: use our DB ticket type IDs
        if (tt.includes_merch && merchSizes[tt.id]) {
          for (const [size, sQty] of Object.entries(merchSizes[tt.id])) {
            if (sQty > 0) items.push(`${tt.id}:${sQty}:${size}`);
          }
        } else {
          items.push(`${tt.id}:${qty}`);
        }
      }
    }
    if (items.length === 0) return null;
    return `/event/${eventSlug}/checkout/?cart=${encodeURIComponent(items.join(","))}`;
  }, [activeTypes, quantities, merchSizes, eventSlug, isWeeZTix, weeztixIds, weeztixSizeIds]);

  const handleCheckout = useCallback(() => {
    const url = getCheckoutUrl();
    if (!url) return;

    // Track InitiateCheckout before navigating
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

  // Expose checkout handler to parent (for bottom bar)
  useEffect(() => {
    onCheckoutReady?.(totalQty > 0 ? handleCheckout : null);
  }, [totalQty, handleCheckout, onCheckoutReady]);

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

  // Notify parent of cart changes (for bottom bar updates)
  useEffect(() => {
    onCartChange?.(totalPrice, totalQty, cartItems);
  }, [totalPrice, totalQty, cartItems, onCartChange]);

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
              {(() => {
                // Group tickets: default group first, then named groups
                const groupMap = ticketGroupMap || {};
                const groups = ticketGroups || [];
                const defaultGroup = activeTypes.filter(
                  (tt) => !groupMap[tt.id]
                );
                const namedGroups = groups.map((name) => ({
                  name,
                  tickets: activeTypes.filter(
                    (tt) => groupMap[tt.id] === name
                  ),
                })).filter((g) => g.tickets.length > 0);

                const renderTicket = (tt: TicketTypeRow) => {
                  const tierClass = TIER_CLASS[tt.tier || "standard"] || "";
                  const qty = getQty(tt.id);
                  const priceDisplay =
                    Number(tt.price) % 1 === 0
                      ? Number(tt.price)
                      : Number(tt.price).toFixed(2);

                  return (
                    <div
                      key={tt.id}
                      className={`ticket-option ${tierClass}${qty > 0 ? " ticket-option--active" : ""}`}
                      data-ticket-id={tt.id}
                    >
                      {tt.tier === "valentine" && (
                        <div className="ticket-option__hearts">
                          {[...Array(5)].map((_, i) => (
                            <span key={i} className="ticket-option__heart">{"\u2665"}</span>
                          ))}
                        </div>
                      )}
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
                          (tt.product_id && tt.product ? tt.product.images : tt.merch_images)?.front || (tt.product_id && tt.product ? tt.product.images : tt.merch_images)?.back ? (
                            <span
                              className="ticket-option__view-tee"
                              onClick={() => onViewMerch?.(tt)}
                              style={{ cursor: "pointer" }}
                            >
                              View Merch
                            </span>
                          ) : (
                            <span
                              className="ticket-option__view-tee"
                              style={{ cursor: "default", opacity: 0.6 }}
                            >
                              Includes merch
                            </span>
                          )
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
                };

                return (
                  <>
                    {/* Default (ungrouped) tickets */}
                    {defaultGroup.map(renderTicket)}

                    {/* Named groups with headers */}
                    {namedGroups.map((group) => (
                      <div key={group.name} className="ticket-group">
                        <div className="ticket-group__header">
                          <span className="ticket-group__name">{group.name}</span>
                        </div>
                        {group.tickets.map(renderTicket)}
                      </div>
                    ))}
                  </>
                );
              })()}

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
                  <div className="cart-summary__header">
                    <span className="cart-summary__title">Your Order</span>
                    <span className="cart-summary__count">
                      {totalQty} {totalQty === 1 ? "item" : "items"}
                    </span>
                  </div>
                  <div className="cart-summary__lines">
                    {cartItems.map((item, i) => {
                      const tt = activeTypes.find((t) => t.name === item.name);
                      const unitPrice = tt ? Number(tt.price) : 0;
                      const linePrice = unitPrice * item.qty;
                      const hasMerch = tt?.includes_merch && item.size;
                      const merchLabel =
                        (tt?.product?.name) ||
                        tt?.merch_name ||
                        (tt?.merch_type === "hoodie" ? "Hoodie" : "T-Shirt");

                      return (
                        <div className="cart-summary__line" key={i}>
                          <div className="cart-summary__line-main">
                            <span className="cart-summary__line-qty">
                              {item.qty}&times;
                            </span>
                            <span className="cart-summary__line-name">
                              {item.name}
                            </span>
                            <span className="cart-summary__line-price">
                              {currSymbol}
                              {linePrice % 1 === 0
                                ? linePrice
                                : linePrice.toFixed(2)}
                            </span>
                          </div>
                          {hasMerch && (
                            <div className="cart-summary__line-merch">
                              <span className="cart-summary__merch-badge">
                                + {merchLabel}
                              </span>
                              <span className="cart-summary__merch-size">
                                Size: <strong>{item.size}</strong>
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="cart-summary__footer">
                    <span className="cart-summary__total-label">Total</span>
                    <span className="cart-summary__total-value">
                      {currSymbol}{totalPrice.toFixed(2)}
                    </span>
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
