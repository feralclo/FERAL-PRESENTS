import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCart } from "@/hooks/useCart";
import type { TicketTypeRow } from "@/types/events";

// ─── Mocks ─────────────────────────────────────────────────────────

vi.mock("@/lib/stripe/config", () => ({
  getCurrencySymbol: (c: string) => (c === "GBP" ? "£" : c === "EUR" ? "€" : "$"),
}));

const mockGetVisibleTickets = vi.fn();
vi.mock("@/lib/ticket-visibility", () => ({
  getVisibleTickets: (...args: unknown[]) => mockGetVisibleTickets(...args),
}));

// ─── Fixtures ──────────────────────────────────────────────────────

const GA_TICKET: TicketTypeRow = {
  id: "tt-ga",
  org_id: "test",
  event_id: "evt-1",
  name: "General Admission",
  price: 25,
  capacity: 100,
  sold: 10,
  sort_order: 0,
  includes_merch: false,
  status: "active",
  min_per_order: 1,
  max_per_order: 10,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

const VIP_TICKET: TicketTypeRow = {
  id: "tt-vip",
  org_id: "test",
  event_id: "evt-1",
  name: "VIP",
  price: 50,
  capacity: 50,
  sold: 0,
  sort_order: 1,
  includes_merch: false,
  status: "active",
  min_per_order: 1,
  max_per_order: 5,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

const MERCH_TICKET: TicketTypeRow = {
  id: "tt-merch",
  org_id: "test",
  event_id: "evt-1",
  name: "GA + Tee",
  price: 40,
  capacity: 50,
  sold: 0,
  sort_order: 2,
  includes_merch: true,
  merch_name: "Event Tee",
  status: "active",
  min_per_order: 1,
  max_per_order: 5,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

function makeTracking() {
  return {
    trackAddToCart: vi.fn(),
    trackRemoveFromCart: vi.fn(),
    trackInitiateCheckout: vi.fn(),
    trackEngagement: vi.fn(),
  };
}

function renderCart(
  overrides: {
    ticketTypes?: TicketTypeRow[];
    currency?: string;
    tracking?: ReturnType<typeof makeTracking>;
    releaseConfig?: { groupMap?: Record<string, string | null>; releaseMode?: Record<string, "all" | "sequential"> };
  } = {}
) {
  const tracking = overrides.tracking ?? makeTracking();
  return {
    tracking,
    ...renderHook(() =>
      useCart({
        eventSlug: "test-event",
        ticketTypes: overrides.ticketTypes ?? [GA_TICKET, VIP_TICKET],
        currency: overrides.currency ?? "GBP",
        tracking,
        releaseConfig: overrides.releaseConfig,
      })
    ),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useCart", () => {
  // ─── Initial state ─────────────────────────────────────────────

  describe("initial state", () => {
    it("returns empty quantities, zero totalQty, zero totalPrice on mount", () => {
      const { result } = renderCart();
      expect(result.current.quantities).toEqual({});
      expect(result.current.totalQty).toBe(0);
      expect(result.current.totalPrice).toBe(0);
    });

    it("activeTypes filters out non-active tickets", () => {
      const hidden: TicketTypeRow = { ...GA_TICKET, id: "tt-hidden", status: "hidden" };
      const { result } = renderCart({ ticketTypes: [GA_TICKET, hidden, VIP_TICKET] });
      expect(result.current.activeTypes).toHaveLength(2);
      expect(result.current.activeTypes.map((t) => t.id)).toEqual(["tt-ga", "tt-vip"]);
    });

    it("activeTypes sorted by sort_order", () => {
      const reversed = [VIP_TICKET, GA_TICKET]; // VIP sort_order=1, GA sort_order=0
      const { result } = renderCart({ ticketTypes: reversed });
      expect(result.current.activeTypes[0].id).toBe("tt-ga");
      expect(result.current.activeTypes[1].id).toBe("tt-vip");
    });

    it("minPrice returns lowest price among active types", () => {
      const { result } = renderCart();
      expect(result.current.minPrice).toBe(25);
    });
  });

  // ─── addTicket — normal tickets ────────────────────────────────

  describe("addTicket — normal tickets", () => {
    it("increments quantity by 1", () => {
      const { result } = renderCart();
      act(() => result.current.addTicket(GA_TICKET));
      expect(result.current.quantities["tt-ga"]).toBe(1);
      expect(result.current.totalQty).toBe(1);
    });

    it("caps quantity at max_per_order", () => {
      const { result } = renderCart();
      for (let i = 0; i < 11; i++) {
        act(() => result.current.addTicket(GA_TICKET));
      }
      expect(result.current.quantities["tt-ga"]).toBe(10);
    });

    it("calls tracking.trackAddToCart with correct args", () => {
      const { result, tracking } = renderCart();
      act(() => result.current.addTicket(GA_TICKET));
      expect(tracking.trackAddToCart).toHaveBeenCalledWith(
        "General Admission",
        ["tt-ga"],
        25,
        1,
        "GBP"
      );
    });

    it("first addTicket fires trackEngagement exactly once", () => {
      const { result, tracking } = renderCart();
      act(() => result.current.addTicket(GA_TICKET));
      act(() => result.current.addTicket(GA_TICKET));
      expect(tracking.trackEngagement).toHaveBeenCalledTimes(1);
      expect(tracking.trackEngagement).toHaveBeenCalledWith("interact_tickets");
    });
  });

  // ─── addTicket — merch tickets ─────────────────────────────────

  describe("addTicket — merch tickets", () => {
    it("opens sizePopup with default size M instead of incrementing quantity", () => {
      const { result } = renderCart({ ticketTypes: [GA_TICKET, MERCH_TICKET] });
      act(() => result.current.addTicket(MERCH_TICKET));
      expect(result.current.sizePopup).toEqual({
        ticketTypeId: "tt-merch",
        selectedSize: "M",
      });
    });

    it("does NOT increment quantity (qty stays 0 until size is confirmed)", () => {
      const { result } = renderCart({ ticketTypes: [GA_TICKET, MERCH_TICKET] });
      act(() => result.current.addTicket(MERCH_TICKET));
      expect(result.current.quantities["tt-merch"] ?? 0).toBe(0);
      expect(result.current.totalQty).toBe(0);
    });
  });

  // ─── removeTicket — normal tickets ─────────────────────────────

  describe("removeTicket — normal tickets", () => {
    it("decrements quantity by 1", () => {
      const { result } = renderCart();
      act(() => result.current.addTicket(GA_TICKET));
      act(() => result.current.addTicket(GA_TICKET));
      act(() => result.current.removeTicket(GA_TICKET));
      expect(result.current.quantities["tt-ga"]).toBe(1);
    });

    it("does not go below 0", () => {
      const { result } = renderCart();
      act(() => result.current.removeTicket(GA_TICKET));
      expect(result.current.quantities["tt-ga"]).toBe(0);
    });
  });

  // ─── removeTicket — merch tickets ──────────────────────────────

  describe("removeTicket — merch tickets", () => {
    it("removes the last-added size from merchSizes and decrements quantity", () => {
      const { result } = renderCart({ ticketTypes: [GA_TICKET, MERCH_TICKET] });
      // Add a merch ticket via size popup flow
      act(() => result.current.addTicket(MERCH_TICKET));
      act(() => result.current.handleSizeConfirm()); // confirms M
      expect(result.current.quantities["tt-merch"]).toBe(1);

      act(() => result.current.removeTicket(MERCH_TICKET));
      expect(result.current.quantities["tt-merch"]).toBe(0);
      expect(result.current.merchSizes["tt-merch"]).toEqual({});
    });
  });

  // ─── handleSizeConfirm ────────────────────────────────────────

  describe("handleSizeConfirm", () => {
    it("adds merch ticket with selected size, increments quantity, closes popup", () => {
      const { result } = renderCart({ ticketTypes: [GA_TICKET, MERCH_TICKET] });
      act(() => result.current.addTicket(MERCH_TICKET));
      // sizePopup should be open with default M
      act(() => result.current.handleSizeConfirm());
      expect(result.current.quantities["tt-merch"]).toBe(1);
      expect(result.current.merchSizes["tt-merch"]).toEqual({ M: 1 });
      expect(result.current.sizePopup).toBeNull();
    });

    it("calls tracking.trackAddToCart with correct args", () => {
      const { result, tracking } = renderCart({ ticketTypes: [GA_TICKET, MERCH_TICKET] });
      act(() => result.current.addTicket(MERCH_TICKET));
      tracking.trackAddToCart.mockClear();
      act(() => result.current.handleSizeConfirm());
      expect(tracking.trackAddToCart).toHaveBeenCalledWith(
        "GA + Tee",
        ["tt-merch"],
        40,
        1,
        "GBP"
      );
    });
  });

  // ─── addMerchExternal ─────────────────────────────────────────

  describe("addMerchExternal", () => {
    it("adds specified size and quantity to merchSizes", () => {
      const { result } = renderCart({ ticketTypes: [GA_TICKET, MERCH_TICKET] });
      act(() => result.current.addMerchExternal("tt-merch", "L", 2));
      expect(result.current.merchSizes["tt-merch"]).toEqual({ L: 2 });
      expect(result.current.quantities["tt-merch"]).toBe(2);
    });

    it("correctly handles multiple sizes for same ticket type", () => {
      const { result } = renderCart({ ticketTypes: [GA_TICKET, MERCH_TICKET] });
      act(() => result.current.addMerchExternal("tt-merch", "L", 1));
      act(() => result.current.addMerchExternal("tt-merch", "XL", 2));
      expect(result.current.merchSizes["tt-merch"]).toEqual({ L: 1, XL: 2 });
      expect(result.current.quantities["tt-merch"]).toBe(3);
    });
  });

  // ─── totalPrice ───────────────────────────────────────────────

  describe("totalPrice", () => {
    it("computed correctly: sum of (qty × price) for each active type", () => {
      const { result } = renderCart();
      act(() => result.current.addTicket(GA_TICKET)); // 25
      act(() => result.current.addTicket(VIP_TICKET)); // 50
      expect(result.current.totalPrice).toBe(75);
    });

    it("updates when quantities change", () => {
      const { result } = renderCart();
      act(() => result.current.addTicket(GA_TICKET));
      expect(result.current.totalPrice).toBe(25);
      act(() => result.current.addTicket(GA_TICKET));
      expect(result.current.totalPrice).toBe(50);
      act(() => result.current.removeTicket(GA_TICKET));
      expect(result.current.totalPrice).toBe(25);
    });
  });

  // ─── cartItems and expressItems ────────────────────────────────

  describe("cartItems and expressItems", () => {
    it("cartItems has correct structure for normal tickets", () => {
      const { result } = renderCart();
      act(() => result.current.addTicket(GA_TICKET));
      act(() => result.current.addTicket(GA_TICKET));
      const item = result.current.cartItems.find((i) => i.name === "General Admission");
      expect(item).toEqual(
        expect.objectContaining({ name: "General Admission", qty: 2, unitPrice: 25 })
      );
    });

    it("cartItems splits merch tickets by size", () => {
      const { result } = renderCart({ ticketTypes: [GA_TICKET, MERCH_TICKET] });
      act(() => result.current.addMerchExternal("tt-merch", "M", 1));
      act(() => result.current.addMerchExternal("tt-merch", "L", 2));
      const merchItems = result.current.cartItems.filter((i) => i.name === "GA + Tee");
      expect(merchItems).toHaveLength(2);
      expect(merchItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "GA + Tee", qty: 1, size: "M", unitPrice: 40 }),
          expect.objectContaining({ name: "GA + Tee", qty: 2, size: "L", unitPrice: 40 }),
        ])
      );
    });

    it("expressItems has correct structure", () => {
      const { result } = renderCart({ ticketTypes: [GA_TICKET, MERCH_TICKET] });
      act(() => result.current.addTicket(GA_TICKET));
      act(() => result.current.addMerchExternal("tt-merch", "M", 1));
      expect(result.current.expressItems).toEqual(
        expect.arrayContaining([
          { ticket_type_id: "tt-ga", qty: 1 },
          { ticket_type_id: "tt-merch", qty: 1, merch_size: "M" },
        ])
      );
    });
  });

  // ─── getCheckoutUrl ───────────────────────────────────────────

  describe("getCheckoutUrl", () => {
    it("returns null when cart is empty", () => {
      const { result } = renderCart();
      expect(result.current.getCheckoutUrl()).toBeNull();
    });

    it("returns correct URL format for normal tickets", () => {
      const { result } = renderCart();
      act(() => result.current.addTicket(GA_TICKET));
      act(() => result.current.addTicket(GA_TICKET));
      const url = result.current.getCheckoutUrl();
      expect(url).toBe("/event/test-event/checkout/?cart=tt-ga%3A2");
    });

    it("merch items encoded as {id}:{qty}:{size}", () => {
      const { result } = renderCart({ ticketTypes: [GA_TICKET, MERCH_TICKET] });
      act(() => result.current.addMerchExternal("tt-merch", "L", 1));
      const url = result.current.getCheckoutUrl();
      expect(url).toBe("/event/test-event/checkout/?cart=tt-merch%3A1%3AL");
    });

    it("appends &currency=eur when presentmentCurrency differs from event currency", () => {
      const { result } = renderCart();
      act(() => result.current.addTicket(GA_TICKET));
      const url = result.current.getCheckoutUrl("EUR");
      expect(url).toContain("&currency=eur");
    });
  });

  // ─── handleCheckout ───────────────────────────────────────────

  describe("handleCheckout", () => {
    let assignMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      assignMock = vi.fn();
      Object.defineProperty(window, "location", {
        value: { assign: assignMock },
        writable: true,
      });
    });

    it("calls tracking.trackInitiateCheckout with correct args", () => {
      const { result, tracking } = renderCart();
      act(() => result.current.addTicket(GA_TICKET));
      act(() => result.current.handleCheckout());
      expect(tracking.trackInitiateCheckout).toHaveBeenCalledWith(
        ["tt-ga"],
        25,
        1,
        "GBP"
      );
    });

    it("calls window.location.assign with the checkout URL", () => {
      const { result } = renderCart();
      act(() => result.current.addTicket(GA_TICKET));
      act(() => result.current.handleCheckout());
      expect(assignMock).toHaveBeenCalledWith(
        "/event/test-event/checkout/?cart=tt-ga%3A1"
      );
    });
  });

  // ─── Sequential release ───────────────────────────────────────

  describe("sequential release", () => {
    it("when releaseConfig provided, calls getVisibleTickets", () => {
      mockGetVisibleTickets.mockReturnValue([GA_TICKET]);
      const releaseConfig = {
        groupMap: { "tt-ga": "group1" },
        releaseMode: { group1: "sequential" as const },
      };
      const { result } = renderCart({ releaseConfig });
      expect(mockGetVisibleTickets).toHaveBeenCalledWith(
        [GA_TICKET, VIP_TICKET],
        releaseConfig.groupMap,
        releaseConfig.releaseMode
      );
      expect(result.current.activeTypes).toEqual([GA_TICKET]);
    });

    it("when no releaseConfig, uses default active filter + sort_order", () => {
      const { result } = renderCart();
      expect(mockGetVisibleTickets).not.toHaveBeenCalled();
      expect(result.current.activeTypes).toHaveLength(2);
      expect(result.current.activeTypes[0].id).toBe("tt-ga");
    });
  });

  // ─── Referential stability ────────────────────────────────────

  describe("referential stability", () => {
    it("addTicket callback is referentially stable across re-renders", () => {
      const { result, rerender } = renderCart();
      const ref = result.current.addTicket;
      rerender();
      expect(result.current.addTicket).toBe(ref);
    });

    it("removeTicket callback is referentially stable across re-renders", () => {
      const { result, rerender } = renderCart();
      const ref = result.current.removeTicket;
      rerender();
      expect(result.current.removeTicket).toBe(ref);
    });

    it("getCheckoutUrl callback is referentially stable across re-renders", () => {
      const ticketTypes = [GA_TICKET, VIP_TICKET];
      const tracking = makeTracking();
      const props = { eventSlug: "test-event" as const, ticketTypes, currency: "GBP", tracking };
      const { result, rerender } = renderHook((p) => useCart(p), { initialProps: props });
      const ref = result.current.getCheckoutUrl;
      rerender(props);
      expect(result.current.getCheckoutUrl).toBe(ref);
    });

    it("activeTypes array is referentially stable when ticketTypes input hasn't changed", () => {
      const ticketTypes = [GA_TICKET, VIP_TICKET];
      const tracking = makeTracking();
      const props = { eventSlug: "test-event" as const, ticketTypes, currency: "GBP", tracking };
      const { result, rerender } = renderHook((p) => useCart(p), { initialProps: props });
      const ref = result.current.activeTypes;
      rerender(props);
      expect(result.current.activeTypes).toBe(ref);
    });
  });
});
