"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { DEFAULT_TICKETS } from "@/lib/constants";
import type { EventSettings } from "@/types/settings";
import type { TicketKey, TicketType, TeeSize, SizeIds } from "@/types/tickets";
import { TEE_SIZES } from "@/types/tickets";

interface TicketCartState {
  tickets: Record<TicketKey, TicketType>;
  teeSizes: Record<TeeSize, number>;
  sizeIds: SizeIds;
}

/**
 * Centralized ticket cart state management.
 * Replaces duplicated vanilla JS across event page (~559-1268) and tickets page (~1183-1832).
 *
 * Handles:
 * - Ticket quantity tracking
 * - Size-specific VIP+Tee management
 * - Cart URL parameter construction
 * - Settings overlay (ticket IDs/names from admin)
 */
export function useTicketCart(settings: EventSettings | null) {
  const [state, setState] = useState<TicketCartState>(() =>
    buildInitialState(settings)
  );

  // Re-initialize when settings change (realtime admin updates)
  useEffect(() => {
    setState((prev) => {
      const newState = buildInitialState(settings);
      // Preserve existing quantities
      Object.keys(prev.tickets).forEach((key) => {
        const k = key as TicketKey;
        if (newState.tickets[k]) {
          newState.tickets[k].qty = prev.tickets[k].qty;
        }
      });
      TEE_SIZES.forEach((size) => {
        newState.teeSizes[size] = prev.teeSizes[size];
      });
      return newState;
    });
  }, [settings]);

  const addTicket = useCallback((key: TicketKey) => {
    setState((prev) => {
      const tickets = { ...prev.tickets };
      tickets[key] = { ...tickets[key], qty: tickets[key].qty + 1 };
      return { ...prev, tickets };
    });
  }, []);

  const removeTicket = useCallback((key: TicketKey) => {
    setState((prev) => {
      const tickets = { ...prev.tickets };
      if (tickets[key].qty <= 0) return prev;
      tickets[key] = { ...tickets[key], qty: tickets[key].qty - 1 };
      return { ...prev, tickets };
    });
  }, []);

  const addTeeSize = useCallback((size: TeeSize) => {
    setState((prev) => {
      const teeSizes = { ...prev.teeSizes };
      teeSizes[size] = teeSizes[size] + 1;
      const tickets = { ...prev.tickets };
      tickets["vip-tee"] = {
        ...tickets["vip-tee"],
        qty: Object.values(teeSizes).reduce((a, b) => a + b, 0),
      };
      return { ...prev, teeSizes, tickets };
    });
  }, []);

  const removeTeeSize = useCallback((size: TeeSize) => {
    setState((prev) => {
      const teeSizes = { ...prev.teeSizes };
      if (teeSizes[size] <= 0) return prev;
      teeSizes[size] = teeSizes[size] - 1;
      const tickets = { ...prev.tickets };
      tickets["vip-tee"] = {
        ...tickets["vip-tee"],
        qty: Object.values(teeSizes).reduce((a, b) => a + b, 0),
      };
      return { ...prev, teeSizes, tickets };
    });
  }, []);

  const totalQty = useMemo(
    () =>
      Object.values(state.tickets).reduce((sum, t) => sum + t.qty, 0),
    [state.tickets]
  );

  const totalPrice = useMemo(
    () =>
      Object.values(state.tickets).reduce(
        (sum, t) => sum + t.price * t.qty,
        0
      ),
    [state.tickets]
  );

  /**
   * Build the cart URL parameter string.
   * Format: ticketId:qty or ticketId:qty:SIZE (comma-separated)
   * Matches existing checkout cart parsing.
   */
  const getCartParam = useCallback(() => {
    const items: string[] = [];
    const { tickets, teeSizes, sizeIds } = state;

    Object.entries(tickets).forEach(([key, ticket]) => {
      if (ticket.qty <= 0) return;

      if (key === "vip-tee") {
        // For VIP+Tee, each size is a separate cart item
        TEE_SIZES.forEach((size) => {
          if (teeSizes[size] <= 0) return;
          const sizeTicketId = sizeIds[size] || ticket.id;
          items.push(`${sizeTicketId}:${teeSizes[size]}:${size}`);
        });
      } else {
        items.push(`${ticket.id}:${ticket.qty}`);
      }
    });

    return items.join(",");
  }, [state]);

  const getCheckoutUrl = useCallback(
    (eventSlug: string) => {
      const cart = getCartParam();
      if (!cart) return null;
      return `/event/${eventSlug}/checkout/?cart=${encodeURIComponent(cart)}`;
    },
    [getCartParam]
  );

  const reset = useCallback(() => {
    setState(buildInitialState(settings));
  }, [settings]);

  return {
    tickets: state.tickets,
    teeSizes: state.teeSizes,
    sizeIds: state.sizeIds,
    totalQty,
    totalPrice,
    addTicket,
    removeTicket,
    addTeeSize,
    removeTeeSize,
    getCartParam,
    getCheckoutUrl,
    reset,
  };
}

function buildInitialState(
  settings: EventSettings | null
): TicketCartState {
  const tickets: Record<TicketKey, TicketType> = {
    general: {
      id: settings?.ticketId1 || DEFAULT_TICKETS.GENERAL,
      name: settings?.ticketName1 || "General Release",
      subtitle: settings?.ticketSubtitle1 || "Standard entry",
      price: 26.46,
      qty: 0,
    },
    vip: {
      id: settings?.ticketId2 || DEFAULT_TICKETS.VIP,
      name: settings?.ticketName2 || "VIP Ticket",
      subtitle: settings?.ticketSubtitle2 || "VIP entry + perks",
      price: 35.0,
      qty: 0,
    },
    "vip-tee": {
      id: settings?.ticketId3 || DEFAULT_TICKETS.VIP_TEE,
      name: settings?.ticketName3 || "VIP Black + Tee",
      subtitle:
        settings?.ticketSubtitle3 ||
        "VIP entry + exclusive event tee",
      price: 65.0,
      qty: 0,
    },
  };

  const teeSizes: Record<TeeSize, number> = {
    XS: 0,
    S: 0,
    M: 0,
    L: 0,
    XL: 0,
    XXL: 0,
  };

  const sizeIds: SizeIds = {
    XS: settings?.sizeIdXS || null,
    S: settings?.sizeIdS || null,
    M: settings?.sizeIdM || null,
    L: settings?.sizeIdL || null,
    XL: settings?.sizeIdXL || null,
    XXL: settings?.sizeIdXXL || null,
  };

  return { tickets, teeSizes, sizeIds };
}
