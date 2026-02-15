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
  "/api/discounts/validate",
  "/api/track",
  "/api/meta/capi",
  "/api/health",
  "/api/media/",
  "/api/auth/",
  "/api/rep-portal/signup",
  "/api/rep-portal/login",
  "/api/rep-portal/logout",
  "/api/rep-portal/verify-email",
  "/api/rep-portal/invite/",
];

const PUBLIC_API_EXACT_GETS = ["/api/events", "/api/settings", "/api/merch", "/api/branding", "/api/themes"];

function isPublicApiRoute(pathname: string, method: string): boolean {
  for (const prefix of PUBLIC_API_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  if (method === "GET" && /^\/api\/orders\/[^/]+\/wallet\/(apple|google)$/.test(pathname)) {
    return true;
  }
  if (method === "GET") {
    for (const route of PUBLIC_API_EXACT_GETS) {
      if (pathname.startsWith(route)) return true;
    }
  }
  return false;
}

function isRepPortalApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/rep-portal/");
}

function isAdminApiRoute(pathname: string, method: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  if (isPublicApiRoute(pathname, method)) return false;
  if (isRepPortalApiRoute(pathname)) return false;
  return true;
}

function isProtectedAdminPage(pathname: string): boolean {
  return pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");
}

const REP_PUBLIC_PAGES = ["/rep/login", "/rep/join", "/rep/invite"];

function isProtectedRepPage(pathname: string): boolean {
  if (!pathname.startsWith("/rep")) return false;
  for (const pub of REP_PUBLIC_PAGES) {
    if (pathname.startsWith(pub)) return false;
  }
  return true;
}

function isRepUser(user: { app_metadata?: Record<string, unknown> }): boolean {
  const meta = user.app_metadata;
  if (!meta) return false;
  // Admin flag always wins — dual-role users can access admin
  if (meta.is_admin === true) return false;
  // Check for rep markers (new-style is_rep flag or legacy role field)
  return meta.is_rep === true || meta.role === "rep";
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

    it("allows products GET without auth (ticket pages resolve linked products)", () => {
      expect(isPublicApiRoute("/api/merch", "GET")).toBe(true);
      expect(isPublicApiRoute("/api/merch/some-id", "GET")).toBe(true);
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

    it("requires auth for products POST (create)", () => {
      expect(isPublicApiRoute("/api/merch", "POST")).toBe(false);
    });

    it("requires auth for products PUT (update)", () => {
      expect(isPublicApiRoute("/api/merch/some-id", "PUT")).toBe(false);
    });

    it("requires auth for products DELETE", () => {
      expect(isPublicApiRoute("/api/merch/some-id", "DELETE")).toBe(false);
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
    expect(isProtectedAdminPage("/admin/merch/")).toBe(true);
    expect(isProtectedAdminPage("/admin/merch/some-id")).toBe(true);
  });

  it("does NOT protect /admin/login (must be accessible)", () => {
    expect(isProtectedAdminPage("/admin/login")).toBe(false);
    expect(isProtectedAdminPage("/admin/login/")).toBe(false);
  });
});

describe("Rep portal route classification", () => {
  it("identifies rep-portal API routes", () => {
    expect(isRepPortalApiRoute("/api/rep-portal/dashboard")).toBe(true);
    expect(isRepPortalApiRoute("/api/rep-portal/quests")).toBe(true);
    expect(isRepPortalApiRoute("/api/rep-portal/me")).toBe(true);
  });

  it("does NOT classify admin rep-management routes as rep-portal", () => {
    expect(isRepPortalApiRoute("/api/reps")).toBe(false);
    expect(isRepPortalApiRoute("/api/reps/stats")).toBe(false);
    expect(isRepPortalApiRoute("/api/reps/some-id")).toBe(false);
  });

  it("classifies rep public API routes as public", () => {
    expect(isPublicApiRoute("/api/rep-portal/signup", "POST")).toBe(true);
    expect(isPublicApiRoute("/api/rep-portal/login", "POST")).toBe(true);
    expect(isPublicApiRoute("/api/rep-portal/logout", "POST")).toBe(true);
    expect(isPublicApiRoute("/api/rep-portal/verify-email", "POST")).toBe(true);
    expect(isPublicApiRoute("/api/rep-portal/invite/some-token", "GET")).toBe(true);
  });

  it("classifies authenticated rep-portal routes as NOT public and NOT admin", () => {
    expect(isPublicApiRoute("/api/rep-portal/dashboard", "GET")).toBe(false);
    expect(isPublicApiRoute("/api/rep-portal/quests", "GET")).toBe(false);
    expect(isAdminApiRoute("/api/rep-portal/dashboard", "GET")).toBe(false);
    expect(isAdminApiRoute("/api/rep-portal/quests", "GET")).toBe(false);
  });

  it("classifies admin rep-management routes as admin API routes", () => {
    expect(isAdminApiRoute("/api/reps", "GET")).toBe(true);
    expect(isAdminApiRoute("/api/reps", "POST")).toBe(true);
    expect(isAdminApiRoute("/api/reps/stats", "GET")).toBe(true);
    expect(isAdminApiRoute("/api/reps/some-id", "PUT")).toBe(true);
  });
});

describe("Rep page protection", () => {
  it("protects authenticated rep portal pages", () => {
    expect(isProtectedRepPage("/rep/")).toBe(true);
    expect(isProtectedRepPage("/rep")).toBe(true);
    expect(isProtectedRepPage("/rep/quests")).toBe(true);
    expect(isProtectedRepPage("/rep/rewards")).toBe(true);
    expect(isProtectedRepPage("/rep/sales")).toBe(true);
    expect(isProtectedRepPage("/rep/profile")).toBe(true);
    expect(isProtectedRepPage("/rep/leaderboard")).toBe(true);
  });

  it("does NOT protect public rep pages", () => {
    expect(isProtectedRepPage("/rep/login")).toBe(false);
    expect(isProtectedRepPage("/rep/join")).toBe(false);
    expect(isProtectedRepPage("/rep/invite/some-token")).toBe(false);
  });

  it("does NOT match non-rep routes", () => {
    expect(isProtectedRepPage("/admin/")).toBe(false);
    expect(isProtectedRepPage("/api/orders")).toBe(false);
    expect(isProtectedRepPage("/event/test")).toBe(false);
  });
});

describe("Rep user detection", () => {
  it("identifies rep users by legacy app_metadata.role", () => {
    expect(isRepUser({ app_metadata: { role: "rep" } })).toBe(true);
  });

  it("identifies rep users by new is_rep flag", () => {
    expect(isRepUser({ app_metadata: { is_rep: true } })).toBe(true);
  });

  it("does NOT flag admin users as rep users", () => {
    expect(isRepUser({ app_metadata: { role: "admin" } })).toBe(false);
    expect(isRepUser({ app_metadata: {} })).toBe(false);
    expect(isRepUser({})).toBe(false);
  });

  it("does NOT flag users with no metadata as rep users", () => {
    expect(isRepUser({ app_metadata: undefined })).toBe(false);
    expect(isRepUser({})).toBe(false);
  });
});

describe("Dual-role user detection (admin + rep)", () => {
  it("allows admin+rep dual-role user to access admin (is_admin wins)", () => {
    // User has both flags — is_admin always takes precedence
    expect(isRepUser({ app_metadata: { is_admin: true, is_rep: true } })).toBe(false);
  });

  it("allows admin+rep dual-role user with legacy role field", () => {
    // User has is_admin + legacy role: "rep" — is_admin still wins
    expect(isRepUser({ app_metadata: { is_admin: true, role: "rep" } })).toBe(false);
  });

  it("blocks rep-only user (is_rep without is_admin)", () => {
    expect(isRepUser({ app_metadata: { is_rep: true } })).toBe(true);
  });

  it("blocks rep-only user with legacy role field (role without is_admin)", () => {
    expect(isRepUser({ app_metadata: { role: "rep" } })).toBe(true);
  });

  it("allows admin-only user (is_admin without is_rep)", () => {
    expect(isRepUser({ app_metadata: { is_admin: true } })).toBe(false);
  });

  it("allows user with no role flags (dashboard-created admin)", () => {
    expect(isRepUser({ app_metadata: {} })).toBe(false);
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

  it("allows user with legacy role:rep (requireAuth only checks is_rep flag)", async () => {
    // Users with the old-style role:"rep" are NOT blocked by requireAuth().
    // This is intentional — dual-role users (admin + rep with same email) may
    // have this field set from the rep signup flow. The new is_rep flag is the
    // only field that blocks admin access.
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    vi.mocked(getSupabaseServer).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "rep-user-1",
              email: "rep@feral.com",
              app_metadata: { role: "rep" },
            },
          },
          error: null,
        }),
      },
    } as unknown as Awaited<ReturnType<typeof getSupabaseServer>>);

    const { requireAuth } = await import("@/lib/auth");
    const result = await requireAuth();

    // Legacy role:"rep" is allowed through — only is_rep: true blocks
    expect(result.error).toBeNull();
    expect(result.user).toEqual({ id: "rep-user-1", email: "rep@feral.com" });
  });

  it("returns 403 when user is a rep-only (new is_rep flag)", async () => {
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    vi.mocked(getSupabaseServer).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "rep-user-2",
              email: "rep2@feral.com",
              app_metadata: { is_rep: true },
            },
          },
          error: null,
        }),
      },
    } as unknown as Awaited<ReturnType<typeof getSupabaseServer>>);

    const { requireAuth } = await import("@/lib/auth");
    const result = await requireAuth();

    expect(result.user).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(403);
  });

  it("allows dual-role user (is_admin + is_rep) to access admin", async () => {
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    vi.mocked(getSupabaseServer).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "dual-user-1",
              email: "boss@feral.com",
              app_metadata: { is_admin: true, is_rep: true },
            },
          },
          error: null,
        }),
      },
    } as unknown as Awaited<ReturnType<typeof getSupabaseServer>>);

    const { requireAuth } = await import("@/lib/auth");
    const result = await requireAuth();

    expect(result.error).toBeNull();
    expect(result.user).toEqual({ id: "dual-user-1", email: "boss@feral.com" });
  });

  it("allows dual-role user (is_admin + legacy role:rep) to access admin", async () => {
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    vi.mocked(getSupabaseServer).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "dual-user-2",
              email: "boss2@feral.com",
              app_metadata: { is_admin: true, role: "rep" },
            },
          },
          error: null,
        }),
      },
    } as unknown as Awaited<ReturnType<typeof getSupabaseServer>>);

    const { requireAuth } = await import("@/lib/auth");
    const result = await requireAuth();

    expect(result.error).toBeNull();
    expect(result.user).toEqual({ id: "dual-user-2", email: "boss2@feral.com" });
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
