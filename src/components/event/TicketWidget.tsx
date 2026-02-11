"use client";

import { useCallback, useMemo, useState } from "react";
import { useDataLayer } from "@/hooks/useDataLayer";
import { useTraffic } from "@/hooks/useTraffic";
import type { TicketKey, TeeSize } from "@/types/tickets";
import { TEE_SIZES } from "@/types/tickets";
import type { useTicketCart } from "@/hooks/useTicketCart";

interface TicketWidgetProps {
  eventSlug: string;
  cart: ReturnType<typeof useTicketCart>;
  onViewTee?: () => void;
}

export function TicketWidget({ eventSlug, cart, onViewTee }: TicketWidgetProps) {
  const { trackAddToCart: trackCartEvent, trackInitiateCheckout } =
    useDataLayer();
  const { trackAddToCart: trackTraffic, trackEngagement } = useTraffic();
  const [sizePopupOpen, setSizePopupOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState<TeeSize>("M");

  const handleAdd = useCallback(
    (key: TicketKey) => {
      if (key === "vip-tee") {
        // Show size popup for VIP+Tee
        setSizePopupOpen(true);
        return;
      }
      cart.addTicket(key);
      const ticket = cart.tickets[key];
      trackCartEvent(ticket.name, [ticket.id], ticket.price, ticket.qty + 1);
      trackTraffic(ticket.name, ticket.price, 1);
      trackEngagement("interact_tickets");
    },
    [cart, trackCartEvent, trackTraffic, trackEngagement]
  );

  const handleRemove = useCallback(
    (key: TicketKey) => {
      if (key === "vip-tee") {
        // Remove last size added
        const lastSize = TEE_SIZES.slice()
          .reverse()
          .find((s) => cart.teeSizes[s] > 0);
        if (lastSize) cart.removeTeeSize(lastSize);
      } else {
        cart.removeTicket(key);
      }
    },
    [cart]
  );

  const handleSizeConfirm = useCallback(() => {
    cart.addTeeSize(selectedSize);
    setSizePopupOpen(false);
    const ticket = cart.tickets["vip-tee"];
    trackCartEvent(ticket.name, [ticket.id], ticket.price, 1);
    trackTraffic(ticket.name, ticket.price, 1);
    trackEngagement("interact_tickets");
  }, [cart, selectedSize, trackCartEvent, trackTraffic, trackEngagement]);

  const handleCheckout = useCallback(() => {
    const url = cart.getCheckoutUrl(eventSlug);
    if (!url) return;

    const ids = Object.values(cart.tickets)
      .filter((t) => t.qty > 0)
      .map((t) => t.id);
    trackInitiateCheckout(ids, cart.totalPrice, cart.totalQty);

    // Use window.location for full page load (WeeZTix requires fresh page)
    window.location.assign(url);
  }, [cart, eventSlug, trackInitiateCheckout]);

  // Cart summary items
  const cartItems = useMemo(() => {
    const items: { name: string; qty: number; size?: string }[] = [];
    Object.entries(cart.tickets).forEach(([key, ticket]) => {
      if (ticket.qty <= 0) return;
      if (key === "vip-tee") {
        TEE_SIZES.forEach((size) => {
          if (cart.teeSizes[size] > 0) {
            items.push({ name: ticket.name, qty: cart.teeSizes[size], size });
          }
        });
      } else {
        items.push({ name: ticket.name, qty: ticket.qty });
      }
    });
    return items;
  }, [cart.tickets, cart.teeSizes]);

  const checkoutDisabled = cart.totalQty === 0;

  return (
    <>
      <aside className="event-tickets" id="tickets">
        <div className="event-tickets__box">
          {/* Mobile Compact Lineup Widget */}
          <div className="lineup-widget">
            <div className="lineup-widget__header">
              <span className="lineup-widget__label">LINEUP</span>
              <span className="lineup-widget__az">[A-Z]</span>
            </div>
            <div className="lineup-widget__artists">
              <span>DARK MATTER</span>
              <span className="lineup-widget__dot" />
              <span>MIKA HEGGEMAN</span>
              <span className="lineup-widget__dot" />
              <span>NICOLAS JULIAN</span>
              <span className="lineup-widget__dot" />
              <span>SANDY KLETZ</span>
              <span className="lineup-widget__dot" />
              <span>SO JUICE</span>
              <span className="lineup-widget__dot" />
              <span>STEVIE</span>
            </div>
            <div className="lineup-widget__line" />
          </div>

          <h3 className="event-tickets__heading">
            Get Tickets<span className="text-red">_</span>
          </h3>
          <p className="event-tickets__subtext">
            Secure your entry. Limited availability.
          </p>

          <div className="event-tickets__embed" id="tickets-embed">
            <div className="feral-tickets" id="feral-tickets">
              {/* Tier Progression */}
              <div className="tier-progression">
                <div className="tier-progression__tier tier-progression__tier--sold">
                  <span className="tier-progression__name">First Release</span>
                  <span className="tier-progression__price">&pound;21.50</span>
                  <span className="tier-progression__status">SOLD OUT</span>
                </div>
                <div className="tier-progression__tier tier-progression__tier--active">
                  <span className="tier-progression__name">
                    General Release
                  </span>
                  <span className="tier-progression__price">&pound;26.46</span>
                  <span className="tier-progression__status">NOW LIVE</span>
                </div>
                <div className="tier-progression__tier tier-progression__tier--next">
                  <span className="tier-progression__name">Final Release</span>
                  <span className="tier-progression__price">&pound;32.35</span>
                  <span className="tier-progression__status">UPCOMING</span>
                </div>
              </div>

              {/* General Release */}
              <TicketOption
                ticketKey="general"
                ticket={cart.tickets.general}
                onAdd={() => handleAdd("general")}
                onRemove={() => handleRemove("general")}
              />

              {/* VIP Section Header */}
              <div className="vip-section-header">
                VIP Experiences<span style={{ color: "#e5e4e2" }}>_</span>
              </div>

              {/* VIP Ticket */}
              <TicketOption
                ticketKey="vip"
                ticket={cart.tickets.vip}
                className="ticket-option--vip"
                onAdd={() => handleAdd("vip")}
                onRemove={() => handleRemove("vip")}
              />

              {/* VIP Black + Tee */}
              <TicketOption
                ticketKey="vip-tee"
                ticket={cart.tickets["vip-tee"]}
                className="ticket-option--vip-black"
                onAdd={() => handleAdd("vip-tee")}
                onRemove={() => handleRemove("vip-tee")}
                onViewTee={onViewTee}
              />

              {/* Checkout Button */}
              <button
                className="feral-tickets__checkout"
                disabled={checkoutDisabled}
                onClick={handleCheckout}
              >
                {checkoutDisabled
                  ? "Select tickets to continue"
                  : `Checkout — £${cart.totalPrice.toFixed(2)}`}
              </button>

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
                            <>
                              <span style={{ color: "#888", marginLeft: 8, marginRight: 4, fontWeight: 400 }}>
                                &mdash;
                              </span>
                              <span style={{ color: "#fff", fontWeight: 700 }}>
                                Size:
                              </span>
                              <span style={{ color: "#ff0033", marginLeft: 4, fontWeight: 700 }}>
                                {item.size}
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Size Popup */}
      {sizePopupOpen && (
        <div
          className="size-popup-overlay size-popup-overlay--visible"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSizePopupOpen(false);
          }}
        >
          <div className="size-popup">
            <button
              className="size-popup__close"
              onClick={() => setSizePopupOpen(false)}
            >
              &times;
            </button>
            <div className="size-popup__title">Select Your Size</div>
            <div className="size-popup__subtitle">
              VIP Ticket + Limited Edition T-Shirt
            </div>
            <div className="size-popup__options">
              {TEE_SIZES.map((size) => (
                <button
                  key={size}
                  className={`size-popup__btn ${
                    selectedSize === size ? "size-popup__btn--selected" : ""
                  }`}
                  onClick={() => setSelectedSize(size)}
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

function TicketOption({
  ticketKey,
  ticket,
  className = "",
  onAdd,
  onRemove,
  onViewTee,
}: {
  ticketKey: TicketKey;
  ticket: { id: string; name: string; subtitle: string; price: number; qty: number };
  className?: string;
  onAdd: () => void;
  onRemove: () => void;
  onViewTee?: () => void;
}) {
  return (
    <div className={`ticket-option ${className}`} data-ticket-id={ticket.id}>
      <div className="ticket-option__row">
        <div className="ticket-option__info">
          <span className="ticket-option__name">{ticket.name}</span>
          <span className="ticket-option__perks">{ticket.subtitle}</span>
          {ticketKey === "general" && (
            <span className="ticket-option__tier">
              <span className="tier-highlight">Last few tickets left!</span>
            </span>
          )}
        </div>
        <span className="ticket-option__price">
          &pound;{ticket.price % 1 === 0 ? ticket.price : ticket.price.toFixed(2)}
        </span>
      </div>
      <div className="ticket-option__bottom">
        {onViewTee ? (
          <button className="ticket-option__view-tee" onClick={onViewTee}>
            View Tee
          </button>
        ) : (
          <span />
        )}
        <div className="ticket-option__controls">
          <button
            className="ticket-option__btn"
            onClick={onRemove}
            aria-label="Remove"
          >
            &minus;
          </button>
          <span className="ticket-option__qty">{ticket.qty}</span>
          <button
            className="ticket-option__btn"
            onClick={onAdd}
            aria-label="Add"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
