import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTicketCart } from "@/hooks/useTicketCart";
import { DEFAULT_TICKETS } from "@/lib/constants";

describe("useTicketCart", () => {
  // ─── Initialisation ───────────────────────────────────────────

  describe("initial state", () => {
    it("starts with zero quantities", () => {
      const { result } = renderHook(() => useTicketCart(null));
      expect(result.current.totalQty).toBe(0);
      expect(result.current.totalPrice).toBe(0);
      expect(result.current.tickets.general.qty).toBe(0);
      expect(result.current.tickets.vip.qty).toBe(0);
      expect(result.current.tickets["vip-tee"].qty).toBe(0);
    });

    it("uses default ticket IDs when no settings", () => {
      const { result } = renderHook(() => useTicketCart(null));
      expect(result.current.tickets.general.id).toBe(DEFAULT_TICKETS.GENERAL);
      expect(result.current.tickets.vip.id).toBe(DEFAULT_TICKETS.VIP);
      expect(result.current.tickets["vip-tee"].id).toBe(DEFAULT_TICKETS.VIP_TEE);
    });

    it("uses settings ticket IDs when provided", () => {
      const settings = {
        ticketId1: "custom-general-id",
        ticketId2: "custom-vip-id",
        ticketId3: "custom-viptee-id",
        ticketName1: "Early Bird",
        ticketName2: "Premium",
        ticketName3: "Premium + Merch",
      };
      const { result } = renderHook(() =>
        useTicketCart(settings as Parameters<typeof useTicketCart>[0])
      );
      expect(result.current.tickets.general.id).toBe("custom-general-id");
      expect(result.current.tickets.vip.id).toBe("custom-vip-id");
      expect(result.current.tickets["vip-tee"].id).toBe("custom-viptee-id");
      expect(result.current.tickets.general.name).toBe("Early Bird");
    });
  });

  // ─── Adding tickets ───────────────────────────────────────────

  describe("addTicket", () => {
    it("increments general ticket quantity", () => {
      const { result } = renderHook(() => useTicketCart(null));
      act(() => result.current.addTicket("general"));
      expect(result.current.tickets.general.qty).toBe(1);
      expect(result.current.totalQty).toBe(1);
    });

    it("calculates total price correctly", () => {
      const { result } = renderHook(() => useTicketCart(null));
      act(() => result.current.addTicket("general")); // £26.46
      act(() => result.current.addTicket("general")); // £26.46
      expect(result.current.totalQty).toBe(2);
      expect(result.current.totalPrice).toBeCloseTo(52.92);
    });

    it("handles mixed ticket types", () => {
      const { result } = renderHook(() => useTicketCart(null));
      act(() => result.current.addTicket("general")); // £26.46
      act(() => result.current.addTicket("vip")); // £35.00
      expect(result.current.totalQty).toBe(2);
      expect(result.current.totalPrice).toBeCloseTo(61.46);
    });
  });

  // ─── Removing tickets ─────────────────────────────────────────

  describe("removeTicket", () => {
    it("decrements ticket quantity", () => {
      const { result } = renderHook(() => useTicketCart(null));
      act(() => result.current.addTicket("general"));
      act(() => result.current.addTicket("general"));
      act(() => result.current.removeTicket("general"));
      expect(result.current.tickets.general.qty).toBe(1);
    });

    it("does not go below zero", () => {
      const { result } = renderHook(() => useTicketCart(null));
      act(() => result.current.removeTicket("general"));
      expect(result.current.tickets.general.qty).toBe(0);
      expect(result.current.totalPrice).toBe(0);
    });
  });

  // ─── Tee sizes ────────────────────────────────────────────────

  describe("tee sizes (VIP+Tee)", () => {
    it("adds a tee size and increments vip-tee qty", () => {
      const { result } = renderHook(() => useTicketCart(null));
      act(() => result.current.addTeeSize("M"));
      expect(result.current.teeSizes.M).toBe(1);
      expect(result.current.tickets["vip-tee"].qty).toBe(1);
    });

    it("tracks multiple sizes independently", () => {
      const { result } = renderHook(() => useTicketCart(null));
      act(() => result.current.addTeeSize("M"));
      act(() => result.current.addTeeSize("L"));
      act(() => result.current.addTeeSize("M"));
      expect(result.current.teeSizes.M).toBe(2);
      expect(result.current.teeSizes.L).toBe(1);
      expect(result.current.tickets["vip-tee"].qty).toBe(3);
    });

    it("removes a tee size and decrements vip-tee qty", () => {
      const { result } = renderHook(() => useTicketCart(null));
      act(() => result.current.addTeeSize("M"));
      act(() => result.current.addTeeSize("M"));
      act(() => result.current.removeTeeSize("M"));
      expect(result.current.teeSizes.M).toBe(1);
      expect(result.current.tickets["vip-tee"].qty).toBe(1);
    });

    it("does not go below zero on tee size removal", () => {
      const { result } = renderHook(() => useTicketCart(null));
      act(() => result.current.removeTeeSize("XL"));
      expect(result.current.teeSizes.XL).toBe(0);
      expect(result.current.tickets["vip-tee"].qty).toBe(0);
    });
  });

  // ─── Cart parameter building ──────────────────────────────────

  describe("getCartParam", () => {
    it("returns empty string when cart is empty", () => {
      const { result } = renderHook(() => useTicketCart(null));
      expect(result.current.getCartParam()).toBe("");
    });

    it("builds correct param for single ticket type", () => {
      const { result } = renderHook(() => useTicketCart(null));
      act(() => result.current.addTicket("general"));
      act(() => result.current.addTicket("general"));
      const param = result.current.getCartParam();
      expect(param).toBe(`${DEFAULT_TICKETS.GENERAL}:2`);
    });

    it("builds correct param for multiple ticket types", () => {
      const { result } = renderHook(() => useTicketCart(null));
      act(() => result.current.addTicket("general"));
      act(() => result.current.addTicket("vip"));
      const param = result.current.getCartParam();
      expect(param).toContain(`${DEFAULT_TICKETS.GENERAL}:1`);
      expect(param).toContain(`${DEFAULT_TICKETS.VIP}:1`);
      expect(param.split(",")).toHaveLength(2);
    });

    it("includes size for VIP+Tee items", () => {
      const { result } = renderHook(() => useTicketCart(null));
      act(() => result.current.addTeeSize("L"));
      const param = result.current.getCartParam();
      // Should contain ticketId:qty:SIZE format
      expect(param).toMatch(/:1:L$/);
    });

    it("creates separate items per size for VIP+Tee", () => {
      const { result } = renderHook(() => useTicketCart(null));
      act(() => result.current.addTeeSize("M"));
      act(() => result.current.addTeeSize("L"));
      const param = result.current.getCartParam();
      const items = param.split(",");
      expect(items).toHaveLength(2);
      expect(items.some((i) => i.endsWith(":1:M"))).toBe(true);
      expect(items.some((i) => i.endsWith(":1:L"))).toBe(true);
    });
  });

  // ─── Checkout URL ─────────────────────────────────────────────

  describe("getCheckoutUrl", () => {
    it("returns null when cart is empty", () => {
      const { result } = renderHook(() => useTicketCart(null));
      expect(result.current.getCheckoutUrl("liverpool-27-march")).toBeNull();
    });

    it("builds correct checkout URL with slug and cart param", () => {
      const { result } = renderHook(() => useTicketCart(null));
      act(() => result.current.addTicket("general"));
      const url = result.current.getCheckoutUrl("liverpool-27-march");
      expect(url).toContain("/event/liverpool-27-march/checkout/?cart=");
      expect(url).toContain(encodeURIComponent(`${DEFAULT_TICKETS.GENERAL}:1`));
    });

    it("URL-encodes the cart parameter", () => {
      const { result } = renderHook(() => useTicketCart(null));
      act(() => result.current.addTicket("general"));
      act(() => result.current.addTicket("vip"));
      const url = result.current.getCheckoutUrl("test-event")!;
      // The comma between items should be encoded
      const cartParam = url.split("cart=")[1];
      expect(cartParam).toBeDefined();
      // Verify it round-trips correctly
      const decoded = decodeURIComponent(cartParam);
      expect(decoded).toContain(`${DEFAULT_TICKETS.GENERAL}:1`);
      expect(decoded).toContain(`${DEFAULT_TICKETS.VIP}:1`);
    });
  });

  // ─── Reset ────────────────────────────────────────────────────

  describe("reset", () => {
    it("clears all quantities back to zero", () => {
      const { result } = renderHook(() => useTicketCart(null));
      act(() => result.current.addTicket("general"));
      act(() => result.current.addTicket("vip"));
      act(() => result.current.addTeeSize("M"));
      act(() => result.current.reset());
      expect(result.current.totalQty).toBe(0);
      expect(result.current.totalPrice).toBe(0);
      expect(result.current.teeSizes.M).toBe(0);
    });
  });

  // ─── Settings update preservation ─────────────────────────────

  describe("settings update", () => {
    it("preserves cart quantities when settings change", () => {
      const { result, rerender } = renderHook(
        ({ settings }) => useTicketCart(settings),
        { initialProps: { settings: null } }
      );

      // Add tickets
      act(() => result.current.addTicket("general"));
      act(() => result.current.addTicket("general"));
      expect(result.current.tickets.general.qty).toBe(2);

      // Settings change (admin updates ticket names)
      const newSettings = {
        ticketName1: "Updated Name",
        ticketId1: "new-id-123",
      };
      rerender({
        settings: newSettings as Parameters<typeof useTicketCart>[0],
      });

      // Quantities should be preserved
      expect(result.current.tickets.general.qty).toBe(2);
      // But IDs should update
      expect(result.current.tickets.general.id).toBe("new-id-123");
      expect(result.current.tickets.general.name).toBe("Updated Name");
    });
  });
});
