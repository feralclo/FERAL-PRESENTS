"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { getCurrencySymbol } from "@/lib/stripe/config";
import { getVisibleTickets } from "@/lib/ticket-visibility";
import type { TicketTypeRow } from "@/types/events";
import type { TrafficEventType } from "@/types/analytics";

const TEE_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

interface UseCartParams {
  eventSlug: string;
  ticketTypes: TicketTypeRow[];
  currency: string;
  /** Tracking facade — called internally on add/remove/checkout */
  tracking: {
    trackAddToCart: (name: string, ids: string[], price: number, qty: number, currency: string) => void;
    trackRemoveFromCart: (name: string, ids: string[]) => void;
    trackInitiateCheckout: (ids: string[], totalPrice: number, totalQty: number, currency: string) => void;
    trackEngagement: (type: TrafficEventType) => void;
  };
  /** Optional release config for sequential ticket visibility */
  releaseConfig?: {
    groupMap?: Record<string, string | null>;
    releaseMode?: Record<string, "all" | "sequential">;
  };
}

export interface UseCartResult {
  /** Active (visible) ticket types sorted by sort_order */
  activeTypes: TicketTypeRow[];
  /** Quantity per ticket type ID */
  quantities: Record<string, number>;
  /** Merch sizes per ticket type ID: { [ticketTypeId]: { [size]: qty } } */
  merchSizes: Record<string, Record<string, number>>;
  /** Size popup state (null = closed) */
  sizePopup: { ticketTypeId: string; selectedSize: string } | null;
  /** Set size popup state (for UI control) */
  setSizePopup: React.Dispatch<React.SetStateAction<{ ticketTypeId: string; selectedSize: string } | null>>;
  /** Total number of tickets in cart */
  totalQty: number;
  /** Total price in cart */
  totalPrice: number;
  /** Cart line items (for display + parent notification) */
  cartItems: { name: string; qty: number; size?: string; unitPrice: number }[];
  /** Items formatted for Express Checkout */
  expressItems: { ticket_type_id: string; qty: number; merch_size?: string }[];
  /** Minimum price across active types */
  minPrice: number;
  /** Currency symbol */
  currSymbol: string;
  /** Add a ticket (opens size popup for merch tickets) */
  addTicket: (tt: TicketTypeRow) => void;
  /** Remove a ticket */
  removeTicket: (tt: TicketTypeRow) => void;
  /** Confirm size popup selection → add merch ticket to cart */
  handleSizeConfirm: () => void;
  /** Add merch from external source (TeeModal) — stable callback */
  addMerchExternal: (ticketTypeId: string, size: string, qty: number) => void;
  /** Build checkout URL (null if cart empty) */
  getCheckoutUrl: () => string | null;
  /** Navigate to checkout */
  handleCheckout: () => void;
}

export function useCart({
  eventSlug,
  ticketTypes,
  currency,
  tracking,
  releaseConfig,
}: UseCartParams): UseCartResult {
  const currSymbol = getCurrencySymbol(currency);
  const interactFired = useRef(false);

  const activeTypes = useMemo(
    () => {
      if (releaseConfig?.releaseMode) {
        return getVisibleTickets(ticketTypes, releaseConfig.groupMap, releaseConfig.releaseMode);
      }
      return ticketTypes
        .filter((tt) => tt.status === "active")
        .sort((a, b) => a.sort_order - b.sort_order);
    },
    [ticketTypes, releaseConfig?.groupMap, releaseConfig?.releaseMode]
  );

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [merchSizes, setMerchSizes] = useState<Record<string, Record<string, number>>>({});
  const [sizePopup, setSizePopup] = useState<{
    ticketTypeId: string;
    selectedSize: string;
  } | null>(null);

  const getQty = (id: string) => quantities[id] || 0;

  const addTicket = useCallback(
    (tt: TicketTypeRow) => {
      if (!interactFired.current) {
        interactFired.current = true;
        tracking.trackEngagement("interact_tickets");
      }
      if (tt.includes_merch) {
        setSizePopup({ ticketTypeId: tt.id, selectedSize: "M" });
        return;
      }
      setQuantities((prev) => ({
        ...prev,
        [tt.id]: Math.min((prev[tt.id] || 0) + 1, tt.max_per_order),
      }));
      tracking.trackAddToCart(tt.name, [tt.id], Number(tt.price), 1, currency);
    },
    [tracking, currency]
  );

  const removeTicket = useCallback(
    (tt: TicketTypeRow) => {
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
        tracking.trackRemoveFromCart(tt.name, [tt.id]);
        return;
      }
      setQuantities((prev) => ({
        ...prev,
        [tt.id]: Math.max((prev[tt.id] || 0) - 1, 0),
      }));
      tracking.trackRemoveFromCart(tt.name, [tt.id]);
    },
    [tracking]
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
      tracking.trackAddToCart(tt.name, [tt.id], Number(tt.price), 1, currency);
    }
    setSizePopup(null);
  }, [sizePopup, activeTypes, tracking, currency]);

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
        tracking.trackAddToCart(tt.name, [tt.id], Number(tt.price) * qty, qty, currency);
      }
    },
    [activeTypes, tracking, currency]
  );

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

  const getCheckoutUrl = useCallback(() => {
    const items: string[] = [];
    for (const tt of activeTypes) {
      const qty = getQty(tt.id);
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
    tracking.trackInitiateCheckout(ids, totalPrice, totalQty, currency);
    window.location.assign(url);
  }, [getCheckoutUrl, activeTypes, quantities, totalPrice, currency, totalQty, tracking]);

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
    const items: { name: string; qty: number; size?: string; unitPrice: number }[] = [];
    for (const tt of activeTypes) {
      const qty = quantities[tt.id] || 0;
      if (qty <= 0) continue;
      const price = Number(tt.price);
      if (tt.includes_merch && merchSizes[tt.id]) {
        for (const [size, sQty] of Object.entries(merchSizes[tt.id])) {
          if (sQty > 0) items.push({ name: tt.name, qty: sQty, size, unitPrice: price });
        }
      } else {
        items.push({ name: tt.name, qty, unitPrice: price });
      }
    }
    return items;
  }, [activeTypes, quantities, merchSizes]);

  const minPrice = activeTypes.length > 0
    ? Math.min(...activeTypes.map((tt) => Number(tt.price)))
    : 0;

  return {
    activeTypes,
    quantities,
    merchSizes,
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
    addMerchExternal,
    getCheckoutUrl,
    handleCheckout,
  };
}
