import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDataLayer } from "@/hooks/useDataLayer";

beforeEach(() => {
  (window as unknown as Record<string, unknown>).dataLayer = [];
});

describe("useDataLayer", () => {
  // ─── Referential stability ─────────────────────────────────────

  describe("referential stability", () => {
    it("returns the same object reference across re-renders", () => {
      const { result, rerender } = renderHook(() => useDataLayer());
      const first = result.current;
      rerender();
      rerender();
      rerender();
      expect(result.current).toBe(first);
    });

    it("returns stable push function", () => {
      const { result, rerender } = renderHook(() => useDataLayer());
      const fn = result.current.push;
      rerender();
      expect(result.current.push).toBe(fn);
    });

    it("returns stable trackAddToCart function", () => {
      const { result, rerender } = renderHook(() => useDataLayer());
      const fn = result.current.trackAddToCart;
      rerender();
      expect(result.current.trackAddToCart).toBe(fn);
    });
  });

  // ─── Event pushing ─────────────────────────────────────────────

  describe("push", () => {
    it("pushes events to window.dataLayer", () => {
      const { result } = renderHook(() => useDataLayer());
      act(() =>
        result.current.push({ event: "test_event", value: 42 })
      );
      expect(window.dataLayer).toContainEqual({
        event: "test_event",
        value: 42,
      });
    });

    it("creates dataLayer if it does not exist", () => {
      delete (window as unknown as Record<string, unknown>).dataLayer;
      const { result } = renderHook(() => useDataLayer());
      act(() => result.current.push({ event: "init" }));
      expect(window.dataLayer).toBeDefined();
      expect(window.dataLayer).toContainEqual({ event: "init" });
    });
  });

  // ─── Tracking helpers ──────────────────────────────────────────

  describe("trackViewContent", () => {
    it("pushes view_content event with correct shape", () => {
      const { result } = renderHook(() => useDataLayer());
      act(() =>
        result.current.trackViewContent("Test Event", ["id-1", "id-2"], 26.46)
      );
      expect(window.dataLayer).toContainEqual({
        event: "view_content",
        content_name: "Test Event",
        content_ids: ["id-1", "id-2"],
        content_type: "product",
        value: 26.46,
        currency: "GBP",
      });
    });
  });

  describe("trackAddToCart", () => {
    it("pushes add_to_cart event with correct shape", () => {
      const { result } = renderHook(() => useDataLayer());
      act(() =>
        result.current.trackAddToCart("General Release", ["id-1"], 26.46, 2)
      );
      expect(window.dataLayer).toContainEqual({
        event: "add_to_cart",
        content_name: "General Release",
        content_ids: ["id-1"],
        content_type: "product",
        value: 26.46,
        currency: "GBP",
        num_items: 2,
      });
    });
  });

  describe("trackInitiateCheckout", () => {
    it("pushes initiate_checkout event with correct shape", () => {
      const { result } = renderHook(() => useDataLayer());
      act(() =>
        result.current.trackInitiateCheckout(["id-1", "id-2"], 61.46, 2)
      );
      expect(window.dataLayer).toContainEqual({
        event: "initiate_checkout",
        content_ids: ["id-1", "id-2"],
        content_type: "product",
        value: 61.46,
        currency: "GBP",
        num_items: 2,
      });
    });
  });
});
