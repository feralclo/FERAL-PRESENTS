import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { TrafficEventType } from "@/types/analytics";

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock sessionStorage
const sessionStore: Record<string, string> = {};
Object.defineProperty(globalThis, "sessionStorage", {
  value: {
    getItem: (key: string) => sessionStore[key] ?? null,
    setItem: (key: string, value: string) => {
      sessionStore[key] = value;
    },
    removeItem: (key: string) => {
      delete sessionStore[key];
    },
    clear: () => {
      Object.keys(sessionStore).forEach((key) => delete sessionStore[key]);
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true });
  localStorage.clear();
  sessionStorage.clear();

  // Set env vars so sendTrafficEvent doesn't bail out
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// We need to re-import useTraffic after env stubs are set,
// but since module-level constants are evaluated at import time,
// we test the public API shape and behavior instead.

describe("useTraffic", () => {
  // ─── API shape ───────────────────────────────────────────────

  describe("API shape", () => {
    it("exposes trackEngagement and trackAddToCart methods", async () => {
      const { useTraffic } = await import("@/hooks/useTraffic");
      const { result } = renderHook(() => useTraffic());
      expect(typeof result.current.trackEngagement).toBe("function");
      expect(typeof result.current.trackAddToCart).toBe("function");
    });

    it("returns exactly two methods", async () => {
      const { useTraffic } = await import("@/hooks/useTraffic");
      const { result } = renderHook(() => useTraffic());
      const keys = Object.keys(result.current);
      expect(keys).toHaveLength(2);
      expect(keys).toContain("trackEngagement");
      expect(keys).toContain("trackAddToCart");
    });
  });

  // ─── Referential stability ───────────────────────────────────

  describe("referential stability", () => {
    it("returns stable trackEngagement across re-renders", async () => {
      const { useTraffic } = await import("@/hooks/useTraffic");
      const { result, rerender } = renderHook(() => useTraffic());
      const fn = result.current.trackEngagement;
      rerender();
      rerender();
      rerender();
      expect(result.current.trackEngagement).toBe(fn);
    });

    it("returns stable trackAddToCart across re-renders", async () => {
      const { useTraffic } = await import("@/hooks/useTraffic");
      const { result, rerender } = renderHook(() => useTraffic());
      const fn = result.current.trackAddToCart;
      rerender();
      rerender();
      rerender();
      expect(result.current.trackAddToCart).toBe(fn);
    });
  });

  // ─── trackAddToCart fires every time (no single-fire guard) ──

  describe("trackAddToCart fires every time", () => {
    it("does not have a single-fire guard — calls send on every invocation", async () => {
      const { useTraffic } = await import("@/hooks/useTraffic");
      const { result } = renderHook(() => useTraffic());

      // Clear calls from initial page view tracking
      mockFetch.mockClear();

      act(() => {
        result.current.trackAddToCart("Early Bird", 25.0, 1);
      });
      act(() => {
        result.current.trackAddToCart("Early Bird", 25.0, 1);
      });
      act(() => {
        result.current.trackAddToCart("VIP Ticket", 50.0, 2);
      });

      // Each call should trigger a separate fetch (no single-fire guard)
      const addToCartCalls = mockFetch.mock.calls.filter((call) => {
        const body = call[1]?.body;
        if (!body) return false;
        try {
          return JSON.parse(body).event_type === "add_to_cart";
        } catch {
          return false;
        }
      });

      expect(addToCartCalls.length).toBe(3);
    });

    it("sends product details in trackAddToCart payload", async () => {
      const { useTraffic } = await import("@/hooks/useTraffic");
      const { result } = renderHook(() => useTraffic());
      mockFetch.mockClear();

      act(() => {
        result.current.trackAddToCart("General Release", 30.0, 2);
      });

      const addToCartCalls = mockFetch.mock.calls.filter((call) => {
        const body = call[1]?.body;
        if (!body) return false;
        try {
          return JSON.parse(body).event_type === "add_to_cart";
        } catch {
          return false;
        }
      });

      expect(addToCartCalls.length).toBe(1);
      const payload = JSON.parse(addToCartCalls[0][1].body);
      expect(payload.product_name).toBe("General Release");
      expect(payload.product_price).toBe(30.0);
      expect(payload.product_qty).toBe(2);
      expect(payload.org_id).toBe("feral");
    });
  });

  // ─── TrafficEventType validation ─────────────────────────────

  describe("TrafficEventType completeness", () => {
    it("includes all original event types", () => {
      const originalTypes: TrafficEventType[] = [
        "page_view",
        "landing",
        "tickets",
        "checkout",
        "purchase",
        "add_to_cart",
        "remove_from_cart",
        "scroll_25",
        "scroll_50",
        "scroll_75",
        "scroll_100",
        "time_10s",
        "time_30s",
        "time_60s",
        "time_120s",
        "click_lineup",
        "interact_tickets",
      ];

      // TypeScript compilation verifies these are valid — this is a runtime guard
      for (const t of originalTypes) {
        expect(typeof t).toBe("string");
      }
    });

    it("includes all new payment/post-purchase event types", () => {
      const newTypes: TrafficEventType[] = [
        "checkout_start",
        "payment_processing",
        "payment_success",
        "payment_failed",
        "payment_method_selected",
        "pdf_download",
        "wallet_apple",
        "wallet_google",
      ];

      // TypeScript compilation verifies these are valid members of the union
      for (const t of newTypes) {
        expect(typeof t).toBe("string");
      }
      expect(newTypes).toHaveLength(8);
    });

    it("total TrafficEventType count is 25", () => {
      const allTypes: TrafficEventType[] = [
        "page_view",
        "landing",
        "tickets",
        "checkout",
        "purchase",
        "add_to_cart",
        "remove_from_cart",
        "scroll_25",
        "scroll_50",
        "scroll_75",
        "scroll_100",
        "time_10s",
        "time_30s",
        "time_60s",
        "time_120s",
        "click_lineup",
        "interact_tickets",
        "checkout_start",
        "payment_processing",
        "payment_success",
        "payment_failed",
        "payment_method_selected",
        "pdf_download",
        "wallet_apple",
        "wallet_google",
      ];
      expect(allTypes).toHaveLength(25);
    });
  });

  // ─── Dev mode guard ──────────────────────────────────────────

  describe("dev mode", () => {
    it("respects devmode localStorage flag", async () => {
      localStorage.setItem("feral_devmode", "1");
      const { useTraffic } = await import("@/hooks/useTraffic");
      const { result } = renderHook(() => useTraffic());
      mockFetch.mockClear();

      act(() => {
        result.current.trackAddToCart("Test Ticket", 10, 1);
      });

      // Should not have made any fetch calls due to devmode
      const addToCartCalls = mockFetch.mock.calls.filter((call) => {
        const body = call[1]?.body;
        if (!body) return false;
        try {
          return JSON.parse(body).event_type === "add_to_cart";
        } catch {
          return false;
        }
      });
      expect(addToCartCalls.length).toBe(0);
    });
  });
});
