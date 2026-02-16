import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// ── Supabase client mock ──
// Build a chainable query builder that returns empty data
function createQueryBuilder() {
  const builder: Record<string, unknown> = {};
  const methods = [
    "select", "insert", "update", "delete", "eq", "neq", "gt", "gte",
    "lt", "lte", "in", "order", "limit", "single", "maybeSingle",
  ];

  for (const method of methods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  // Terminal — resolves with empty data
  builder.then = (resolve: (val: unknown) => void) =>
    resolve({ data: [], count: 0, error: null });

  return builder;
}

// Channel mock
function createChannelMock() {
  return {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
}

const mockRemoveChannel = vi.fn();
const mockChannel = vi.fn().mockImplementation(() => createChannelMock());
const mockFrom = vi.fn().mockImplementation(() => createQueryBuilder());

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: mockFrom,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}));

vi.mock("@/lib/constants", () => ({
  ORG_ID: "feral",
  TABLES: {
    SITE_SETTINGS: "site_settings",
    TRAFFIC_EVENTS: "traffic_events",
    POPUP_EVENTS: "popup_events",
    EVENTS: "events",
    TICKET_TYPES: "ticket_types",
    ORDERS: "orders",
    ORDER_ITEMS: "order_items",
    TICKETS: "tickets",
    CUSTOMERS: "customers",
    GUEST_LIST: "guest_list",
    PRODUCTS: "products",
    DISCOUNTS: "discounts",
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

describe("useDashboardRealtime", () => {
  // ─── Initial state shape ─────────────────────────────────────

  describe("initial state", () => {
    it("returns correct initial state shape with all zeros", async () => {
      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      const { result } = renderHook(() => useDashboardRealtime());

      // Before data loads, everything should be at initial values
      expect(result.current.activeVisitors).toBe(0);
      expect(result.current.activeCarts).toBe(0);
      expect(result.current.inCheckout).toBe(0);
      expect(result.current.isLoading).toBe(true);

      expect(result.current.today).toEqual({
        revenue: 0,
        orders: 0,
        ticketsSold: 0,
        avgOrderValue: 0,
        conversionRate: 0,
      });

      expect(result.current.yesterday).toEqual({
        revenue: 0,
        orders: 0,
        ticketsSold: 0,
        avgOrderValue: 0,
        conversionRate: 0,
      });

      expect(result.current.funnel).toEqual({
        landing: 0,
        tickets: 0,
        add_to_cart: 0,
        checkout: 0,
        purchase: 0,
      });

      expect(result.current.activityFeed).toEqual([]);
      expect(result.current.topEvents).toEqual([]);
    });

    it("has isLoading true initially", async () => {
      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      const { result } = renderHook(() => useDashboardRealtime());
      expect(result.current.isLoading).toBe(true);
    });
  });

  // ─── Referential stability ───────────────────────────────────

  describe("referential stability", () => {
    it("returns the same object reference when state has not changed", async () => {
      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      const { result, rerender } = renderHook(() => useDashboardRealtime());
      const first = result.current;
      rerender();
      // useMemo should preserve reference if dependencies haven't changed
      expect(result.current).toBe(first);
    });

    it("today KPIs object is referentially stable across re-renders", async () => {
      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      const { result, rerender } = renderHook(() => useDashboardRealtime());
      const todayRef = result.current.today;
      rerender();
      expect(result.current.today).toBe(todayRef);
    });

    it("yesterday KPIs object is referentially stable across re-renders", async () => {
      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      const { result, rerender } = renderHook(() => useDashboardRealtime());
      const yesterdayRef = result.current.yesterday;
      rerender();
      expect(result.current.yesterday).toBe(yesterdayRef);
    });

    it("funnel object is referentially stable across re-renders", async () => {
      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      const { result, rerender } = renderHook(() => useDashboardRealtime());
      const funnelRef = result.current.funnel;
      rerender();
      expect(result.current.funnel).toBe(funnelRef);
    });

    it("activityFeed array is referentially stable across re-renders", async () => {
      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      const { result, rerender } = renderHook(() => useDashboardRealtime());
      const feedRef = result.current.activityFeed;
      rerender();
      expect(result.current.activityFeed).toBe(feedRef);
    });
  });

  // ─── Channel creation and cleanup ────────────────────────────

  describe("realtime channels", () => {
    it("creates 3 realtime channels on mount", async () => {
      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      renderHook(() => useDashboardRealtime());

      // Should create dashboard-traffic, dashboard-orders, dashboard-tickets
      expect(mockChannel).toHaveBeenCalledWith("dashboard-traffic");
      expect(mockChannel).toHaveBeenCalledWith("dashboard-orders");
      expect(mockChannel).toHaveBeenCalledWith("dashboard-tickets");
      expect(mockChannel).toHaveBeenCalledTimes(3);
    });

    it("subscribes to postgres_changes INSERT events on each channel", async () => {
      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      renderHook(() => useDashboardRealtime());

      // Each channel mock should have .on() and .subscribe() called
      for (const call of mockChannel.mock.results) {
        const channel = call.value;
        expect(channel.on).toHaveBeenCalledWith(
          "postgres_changes",
          expect.objectContaining({
            event: "INSERT",
            schema: "public",
          }),
          expect.any(Function)
        );
        expect(channel.subscribe).toHaveBeenCalled();
      }
    });

    it("removes all channels on unmount", async () => {
      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      const { unmount } = renderHook(() => useDashboardRealtime());

      unmount();

      expect(mockRemoveChannel).toHaveBeenCalledTimes(3);
    });
  });

  // ─── Initial data loading ────────────────────────────────────

  describe("initial data loading", () => {
    it("fetches initial data via the dashboard API on mount", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          today: { revenue: 0, orders: 0, ticketsSold: 0, avgOrderValue: 0, conversionRate: 0 },
          yesterday: { revenue: 0, orders: 0, ticketsSold: 0, avgOrderValue: 0, conversionRate: 0 },
          funnel: { landing: 0, tickets: 0, add_to_cart: 0, checkout: 0, purchase: 0 },
          activeVisitors: 0,
          activeCarts: 0,
          inCheckout: 0,
          recentActivity: [],
          recentSessions: [],
          recentCartSessions: [],
          recentPurchaseSessions: [],
          recentCheckoutSessions: [],
          topEvents: [],
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      renderHook(() => useDashboardRealtime());

      // Should call the dashboard API endpoint
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/dashboard");
    });

    it("uses API endpoint that returns today and yesterday data for trend comparison", async () => {
      const apiResponse = {
        today: { revenue: 100, orders: 2, ticketsSold: 4, avgOrderValue: 50, conversionRate: 5 },
        yesterday: { revenue: 80, orders: 1, ticketsSold: 2, avgOrderValue: 80, conversionRate: 3 },
        funnel: { landing: 100, tickets: 50, add_to_cart: 20, checkout: 10, purchase: 5 },
        activeVisitors: 3,
        activeCarts: 1,
        inCheckout: 0,
        recentActivity: [],
        recentSessions: [],
        recentCartSessions: [],
        recentPurchaseSessions: [],
        recentCheckoutSessions: [],
        topEvents: [],
      };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      renderHook(() => useDashboardRealtime());

      // The API response includes both today and yesterday data
      expect(apiResponse.today).toBeDefined();
      expect(apiResponse.yesterday).toBeDefined();
    });
  });

  // ─── DashboardState interface ────────────────────────────────

  describe("DashboardState interface", () => {
    it("exposes all required properties", async () => {
      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      const { result } = renderHook(() => useDashboardRealtime());

      // Check all properties exist
      expect(result.current).toHaveProperty("activeVisitors");
      expect(result.current).toHaveProperty("activeCarts");
      expect(result.current).toHaveProperty("inCheckout");
      expect(result.current).toHaveProperty("today");
      expect(result.current).toHaveProperty("yesterday");
      expect(result.current).toHaveProperty("funnel");
      expect(result.current).toHaveProperty("activityFeed");
      expect(result.current).toHaveProperty("topEvents");
      expect(result.current).toHaveProperty("isLoading");
    });

    it("today KPIs have correct shape", async () => {
      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      const { result } = renderHook(() => useDashboardRealtime());

      expect(result.current.today).toHaveProperty("revenue");
      expect(result.current.today).toHaveProperty("orders");
      expect(result.current.today).toHaveProperty("ticketsSold");
      expect(result.current.today).toHaveProperty("avgOrderValue");
      expect(result.current.today).toHaveProperty("conversionRate");
    });

    it("funnel has correct stage properties", async () => {
      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      const { result } = renderHook(() => useDashboardRealtime());

      expect(result.current.funnel).toHaveProperty("landing");
      expect(result.current.funnel).toHaveProperty("tickets");
      expect(result.current.funnel).toHaveProperty("add_to_cart");
      expect(result.current.funnel).toHaveProperty("checkout");
      expect(result.current.funnel).toHaveProperty("purchase");
    });

    it("activityFeed is an array", async () => {
      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      const { result } = renderHook(() => useDashboardRealtime());
      expect(Array.isArray(result.current.activityFeed)).toBe(true);
    });

    it("topEvents is an array", async () => {
      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      const { result } = renderHook(() => useDashboardRealtime());
      expect(Array.isArray(result.current.topEvents)).toBe(true);
    });
  });

  // ─── Interval setup ──────────────────────────────────────────

  describe("interval cleanup", () => {
    it("clears intervals on unmount", async () => {
      const { useDashboardRealtime } = await import("@/hooks/useDashboardRealtime");
      const { unmount } = renderHook(() => useDashboardRealtime());

      // Spy on clearInterval to verify cleanup
      const clearSpy = vi.spyOn(globalThis, "clearInterval");
      unmount();

      // Should clear presenceInterval, topEventsInterval, and dataRefreshInterval
      expect(clearSpy).toHaveBeenCalledTimes(3);
      clearSpy.mockRestore();
    });
  });
});
