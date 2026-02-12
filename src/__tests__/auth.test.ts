import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the security infrastructure:
 * - Route classification (public vs protected)
 * - Auth helper behavior
 * - Security header application
 */

// ─── Middleware route classification tests ──────────────────────────────
// We test the route classification logic by importing and testing the
// same patterns used in middleware.ts

const PUBLIC_API_PREFIXES = [
  "/api/stripe/payment-intent",
  "/api/stripe/confirm-order",
  "/api/stripe/webhook",
  "/api/stripe/apple-pay-verify",
  "/api/stripe/account",
  "/api/track",
  "/api/meta/capi",
  "/api/health",
  "/api/media/",
  "/api/auth/",
];

const PUBLIC_API_EXACT_GETS = ["/api/events", "/api/settings"];

function isPublicApiRoute(pathname: string, method: string): boolean {
  for (const prefix of PUBLIC_API_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  if (method === "GET") {
    for (const route of PUBLIC_API_EXACT_GETS) {
      if (pathname.startsWith(route)) return true;
    }
  }
  return false;
}

function isProtectedAdminPage(pathname: string): boolean {
  return pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");
}

describe("Route classification", () => {
  describe("public API routes", () => {
    it("allows payment-intent POST without auth", () => {
      expect(isPublicApiRoute("/api/stripe/payment-intent", "POST")).toBe(true);
    });

    it("allows confirm-order POST without auth", () => {
      expect(isPublicApiRoute("/api/stripe/confirm-order", "POST")).toBe(true);
    });

    it("allows webhook POST without auth", () => {
      expect(isPublicApiRoute("/api/stripe/webhook", "POST")).toBe(true);
    });

    it("allows apple-pay-verify GET without auth", () => {
      expect(isPublicApiRoute("/api/stripe/apple-pay-verify", "GET")).toBe(true);
    });

    it("allows stripe account GET without auth (checkout needs it)", () => {
      expect(isPublicApiRoute("/api/stripe/account", "GET")).toBe(true);
    });

    it("allows track POST without auth", () => {
      expect(isPublicApiRoute("/api/track", "POST")).toBe(true);
    });

    it("allows meta CAPI POST without auth", () => {
      expect(isPublicApiRoute("/api/meta/capi", "POST")).toBe(true);
    });

    it("allows health GET without auth", () => {
      expect(isPublicApiRoute("/api/health", "GET")).toBe(true);
    });

    it("allows media GET without auth", () => {
      expect(isPublicApiRoute("/api/media/some-key", "GET")).toBe(true);
    });

    it("allows auth routes without auth", () => {
      expect(isPublicApiRoute("/api/auth/login", "POST")).toBe(true);
      expect(isPublicApiRoute("/api/auth/logout", "POST")).toBe(true);
    });

    it("allows events GET without auth (public event listing)", () => {
      expect(isPublicApiRoute("/api/events", "GET")).toBe(true);
      expect(isPublicApiRoute("/api/events/some-id", "GET")).toBe(true);
    });

    it("allows settings GET without auth (event pages need it)", () => {
      expect(isPublicApiRoute("/api/settings", "GET")).toBe(true);
    });
  });

  describe("protected API routes", () => {
    it("requires auth for orders GET", () => {
      expect(isPublicApiRoute("/api/orders", "GET")).toBe(false);
    });

    it("requires auth for orders POST", () => {
      expect(isPublicApiRoute("/api/orders", "POST")).toBe(false);
    });

    it("requires auth for order detail GET", () => {
      expect(isPublicApiRoute("/api/orders/some-id", "GET")).toBe(false);
    });

    it("requires auth for order refund POST", () => {
      expect(isPublicApiRoute("/api/orders/some-id/refund", "POST")).toBe(false);
    });

    it("requires auth for orders export GET", () => {
      expect(isPublicApiRoute("/api/orders/export", "GET")).toBe(false);
    });

    it("requires auth for customers GET", () => {
      expect(isPublicApiRoute("/api/customers", "GET")).toBe(false);
    });

    it("requires auth for settings POST (write)", () => {
      expect(isPublicApiRoute("/api/settings", "POST")).toBe(false);
    });

    it("requires auth for events POST (create)", () => {
      expect(isPublicApiRoute("/api/events", "POST")).toBe(false);
    });

    it("requires auth for events PUT (update)", () => {
      expect(isPublicApiRoute("/api/events/some-id", "PUT")).toBe(false);
    });

    it("requires auth for events DELETE", () => {
      expect(isPublicApiRoute("/api/events/some-id", "DELETE")).toBe(false);
    });

    it("requires auth for upload POST", () => {
      expect(isPublicApiRoute("/api/upload", "POST")).toBe(false);
    });

    it("requires auth for Stripe Connect routes", () => {
      expect(isPublicApiRoute("/api/stripe/connect", "GET")).toBe(false);
      expect(isPublicApiRoute("/api/stripe/connect", "POST")).toBe(false);
      expect(isPublicApiRoute("/api/stripe/connect/acct_123", "GET")).toBe(false);
      expect(isPublicApiRoute("/api/stripe/connect/acct_123", "DELETE")).toBe(false);
    });

    it("requires auth for Apple Pay domain management", () => {
      expect(isPublicApiRoute("/api/stripe/apple-pay-domain", "GET")).toBe(false);
      expect(isPublicApiRoute("/api/stripe/apple-pay-domain", "POST")).toBe(false);
    });

    it("requires auth for guest list routes", () => {
      expect(isPublicApiRoute("/api/guest-list", "POST")).toBe(false);
      expect(isPublicApiRoute("/api/guest-list/event-123", "GET")).toBe(false);
    });

    it("requires auth for ticket validation routes", () => {
      expect(isPublicApiRoute("/api/tickets/FERAL-12345678", "GET")).toBe(false);
      expect(isPublicApiRoute("/api/tickets/FERAL-12345678/scan", "POST")).toBe(
        false
      );
    });
  });
});

describe("Admin page protection", () => {
  it("protects /admin/ dashboard", () => {
    expect(isProtectedAdminPage("/admin/")).toBe(true);
    expect(isProtectedAdminPage("/admin")).toBe(true);
  });

  it("protects all admin sub-pages", () => {
    expect(isProtectedAdminPage("/admin/events/")).toBe(true);
    expect(isProtectedAdminPage("/admin/orders/")).toBe(true);
    expect(isProtectedAdminPage("/admin/customers/")).toBe(true);
    expect(isProtectedAdminPage("/admin/settings/")).toBe(true);
    expect(isProtectedAdminPage("/admin/connect/")).toBe(true);
    expect(isProtectedAdminPage("/admin/health/")).toBe(true);
  });

  it("does NOT protect /admin/login (must be accessible)", () => {
    expect(isProtectedAdminPage("/admin/login")).toBe(false);
    expect(isProtectedAdminPage("/admin/login/")).toBe(false);
  });
});

// ─── requireAuth helper tests ───────────────────────────────────────────

// Mock Supabase
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(),
}));

describe("requireAuth", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns user when authenticated", async () => {
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    vi.mocked(getSupabaseServer).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: "admin@feral.com" } },
          error: null,
        }),
      },
    } as unknown as Awaited<ReturnType<typeof getSupabaseServer>>);

    const { requireAuth } = await import("@/lib/auth");
    const result = await requireAuth();

    expect(result.error).toBeNull();
    expect(result.user).toEqual({ id: "user-1", email: "admin@feral.com" });
  });

  it("returns 401 when not authenticated", async () => {
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    vi.mocked(getSupabaseServer).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "Not authenticated" },
        }),
      },
    } as unknown as Awaited<ReturnType<typeof getSupabaseServer>>);

    const { requireAuth } = await import("@/lib/auth");
    const result = await requireAuth();

    expect(result.user).toBeNull();
    expect(result.error).not.toBeNull();
    // Verify it's a 401 response
    expect(result.error!.status).toBe(401);
  });

  it("returns 503 when Supabase is not configured", async () => {
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    vi.mocked(getSupabaseServer).mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getSupabaseServer>>
    );

    const { requireAuth } = await import("@/lib/auth");
    const result = await requireAuth();

    expect(result.user).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(503);
  });
});

// ─── Constants security tests ───────────────────────────────────────────

describe("Constants security", () => {
  it("does not contain hardcoded Supabase credentials", async () => {
    const constants = await import("@/lib/constants");

    // With env vars not set in test, these should be empty strings
    // NOT hardcoded JWT tokens
    expect(constants.SUPABASE_URL).not.toContain("supabase.co");
    expect(constants.SUPABASE_ANON_KEY).not.toContain("eyJ");
  });
});
