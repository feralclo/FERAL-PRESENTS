import { type NextRequest, NextResponse } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";
import { SUPABASE_URL } from "@/lib/constants";

/**
 * Security headers applied to all responses.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=*, interest-cohort=()",
};

/* ── Org resolution cache ── */

const FALLBACK_ORG = "feral";
const CACHE_TTL_MS = 60_000; // 60s

interface CacheEntry {
  orgId: string;
  expiry: number;
}

const domainCache = new Map<string, CacheEntry>();
const userOrgCache = new Map<string, CacheEntry>();

function getCached(cache: Map<string, CacheEntry>, key: string): string | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) return entry.orgId;
  if (entry) cache.delete(key);
  return null;
}

function setCache(cache: Map<string, CacheEntry>, key: string, orgId: string): void {
  cache.set(key, { orgId, expiry: Date.now() + CACHE_TTL_MS });
}

/**
 * Resolve org_id from the domains table by hostname.
 * Uses Supabase REST API directly (service role key) for lightweight lookup.
 */
async function resolveOrgByDomain(hostname: string): Promise<string> {
  const cached = getCached(domainCache, hostname);
  if (cached) return cached;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !serviceRoleKey) return FALLBACK_ORG;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/domains?hostname=eq.${encodeURIComponent(hostname)}&select=org_id&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      }
    );

    if (res.ok) {
      const rows = await res.json();
      if (rows.length > 0) {
        const orgId = rows[0].org_id;
        setCache(domainCache, hostname, orgId);
        return orgId;
      }
    }
  } catch (err) {
    console.error("[middleware] Domain lookup failed:", err instanceof Error ? err.message : err);
  }

  // Wildcard subdomain fallback: {slug}.entry.events → use slug as org_id
  // Note: This trusts the subdomain slug as org_id. If the org doesn't exist,
  // queries will return empty results (no data leak), but orphaned records could
  // be created. A future improvement could validate the org exists.
  const subdomainMatch = hostname.match(/^([a-z0-9-]+)\.entry\.events$/);
  if (subdomainMatch && subdomainMatch[1] !== "admin") {
    const slug = subdomainMatch[1];
    setCache(domainCache, hostname, slug);
    return slug;
  }

  return FALLBACK_ORG;
}

/**
 * Resolve org_id from org_users table by auth user ID.
 */
async function resolveOrgByUser(userId: string): Promise<string> {
  const cached = getCached(userOrgCache, userId);
  if (cached) return cached;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !serviceRoleKey) return FALLBACK_ORG;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/org_users?auth_user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=org_id&order=created_at.asc&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      }
    );

    if (res.ok) {
      const rows = await res.json();
      if (rows.length > 0) {
        const orgId = rows[0].org_id;
        setCache(userOrgCache, userId, orgId);
        return orgId;
      }
    }
  } catch {
    // Fall through to fallback
  }

  return FALLBACK_ORG;
}

/* ── Route classification helpers ── */

/**
 * Admin page routes that require admin authentication.
 * Login page is excluded so users can actually log in.
 */
function isProtectedAdminPage(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") &&
    !pathname.startsWith("/admin/login") &&
    !pathname.startsWith("/admin/invite") &&
    !pathname.startsWith("/admin/signup") &&
    !pathname.startsWith("/admin/beta")
  );
}

/**
 * Rep portal page routes that require rep authentication.
 * Public pages (login, join, invite) are excluded.
 */
const REP_PUBLIC_PAGES = ["/rep/login", "/rep/join", "/rep/invite", "/rep/verify-email"];

function isProtectedRepPage(pathname: string): boolean {
  if (!pathname.startsWith("/rep")) return false;
  for (const pub of REP_PUBLIC_PAGES) {
    if (pathname.startsWith(pub)) return false;
  }
  return true;
}

/**
 * API routes that require NO authentication (fully public).
 * Customer-facing checkout, webhooks, analytics, and rep public endpoints.
 */
const PUBLIC_API_PREFIXES = [
  "/api/stripe/payment-intent",
  "/api/stripe/confirm-order",
  "/api/stripe/webhook",
  "/api/stripe/apple-pay-verify",
  "/api/stripe/account",
  "/api/discounts/validate",
  "/api/checkout/capture",
  "/api/checkout/error",
  "/api/popup/capture",
  "/api/track",
  "/api/meta/capi",
  "/api/health",
  "/api/cron/",
  "/api/unsubscribe",
  "/api/media/",
  "/api/auth/",
  "/api/rep-portal/signup",
  "/api/rep-portal/login",
  "/api/rep-portal/logout",
  "/api/rep-portal/verify-email",
  "/api/rep-portal/invite/",
  "/api/rep-portal/push-vapid-key",
  "/api/team/accept-invite",
  "/api/announcement/signup",
  "/api/beta/",
];

const PUBLIC_API_EXACT_GETS = [
  "/api/events",
  "/api/settings",
  "/api/merch",
  "/api/branding",
  "/api/themes",
];

function isPublicApiRoute(pathname: string, method: string): boolean {
  // Always-public API routes (any method)
  for (const prefix of PUBLIC_API_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }

  // Wallet pass downloads — public GET only (order UUID = unguessable access token)
  // Matches: /api/orders/[uuid]/wallet/apple and /api/orders/[uuid]/wallet/google
  if (method === "GET" && /^\/api\/orders\/[^/]+\/wallet\/(apple|google)$/.test(pathname)) {
    return true;
  }

  // Public GET-only routes (read access for event pages)
  if (method === "GET") {
    for (const route of PUBLIC_API_EXACT_GETS) {
      if (pathname.startsWith(route)) return true;
    }
  }

  return false;
}

/**
 * Rep-portal API routes that require rep authentication (NOT admin auth).
 * These are authenticated routes but are NOT admin routes — they use
 * requireRepAuth() in the handler, not requireAuth().
 */
function isRepPortalApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/rep-portal/");
}

/**
 * Admin API routes that require admin authentication.
 * Excludes public routes and rep-portal routes (which have their own auth).
 */
function isAdminApiRoute(pathname: string, method: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  if (isPublicApiRoute(pathname, method)) return false;
  if (isRepPortalApiRoute(pathname)) return false;
  return true;
}

/**
 * Check if a user is a rep-only user (not an admin).
 *
 * The platform supports dual-role users — the same person can be both an admin
 * and a rep (e.g., platform owner testing rep features with their own email).
 *
 * Role flags in app_metadata (additive, shallow-merged by Supabase):
 * - is_admin: true — set when user logs in via /api/auth/login (admin login)
 * - is_rep: true   — set when user signs up or accepts invite as a rep
 * - role: "rep"    — legacy flag (backward compat with older rep accounts)
 *
 * is_admin always wins: a user who is both admin and rep can access admin.
 */
function isRepUser(user: { app_metadata?: Record<string, unknown> }): boolean {
  const meta = user.app_metadata;
  if (!meta) return false;
  // Admin flag always wins — dual-role users can access admin
  if (meta.is_admin === true) return false;
  // Check for rep markers (new-style is_rep flag or legacy role field)
  return meta.is_rep === true || meta.role === "rep";
}

/**
 * Apply security headers to a response.
 */
function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // HSTS only in production (don't break local dev)
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;
  const hostname = request.headers.get("host") || "";

  // ── Domain routing: admin routes only on admin hosts ──
  // Admin hosts: admin.entry.events, localhost (dev), *.vercel.app (previews)
  // Tenant hosts: custom domains — redirect /admin/* to admin domain
  const isAdminHost =
    hostname.startsWith("admin.entry.events") ||
    hostname.startsWith("localhost") ||
    hostname.includes(".vercel.app");

  // admin.entry.events root → redirect to /admin/
  if (hostname.startsWith("admin.entry.events") && pathname === "/") {
    return applySecurityHeaders(NextResponse.redirect(new URL("https://admin.entry.events/admin/")));
  }

  if (!isAdminHost && (isProtectedAdminPage(pathname) || pathname.startsWith("/admin/login"))) {
    const adminUrl = new URL(`https://admin.entry.events${pathname}`);
    adminUrl.search = request.nextUrl.search;
    return applySecurityHeaders(NextResponse.redirect(adminUrl, 302));
  }

  // Create Supabase middleware client (refreshes session cookies)
  const client = createMiddlewareClient(request);

  if (!client) {
    // Supabase not configured — let the request through but add headers
    const response = NextResponse.next();
    response.headers.set("x-org-id", FALLBACK_ORG);
    return applySecurityHeaders(response);
  }

  const { supabase, response: getResponse } = client;

  // Refresh the session — this is the primary job of the middleware.
  // Must be called before checking the user so tokens are refreshed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Resolve org_id ──
  let orgId = FALLBACK_ORG;

  if (isAdminHost && user) {
    // Admin host + authenticated → resolve from org_users
    orgId = await resolveOrgByUser(user.id);
  } else if (!isAdminHost) {
    // Tenant host → resolve from domains table
    const cleanHost = hostname.split(":")[0]; // Strip port for local dev
    orgId = await resolveOrgByDomain(cleanHost);
  }

  // ── Admin pages ──
  // Require authentication. Role-based access is enforced at the API level
  // by requireAuth() in each admin route handler — not here.
  // This prevents dual-role users (same email for admin + rep) from being
  // locked out due to stale or incorrectly set app_metadata flags.
  if (isProtectedAdminPage(pathname)) {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/admin/login/";
      loginUrl.searchParams.set("redirect", pathname);
      const redirectResponse = NextResponse.redirect(loginUrl);
      return applySecurityHeaders(redirectResponse);
    }
  }

  // ── Rep portal pages ──
  // Require authentication (any user — handler checks rep status).
  if (isProtectedRepPage(pathname)) {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/rep/login";
      loginUrl.searchParams.set("redirect", pathname);
      const redirectResponse = NextResponse.redirect(loginUrl);
      return applySecurityHeaders(redirectResponse);
    }
  }

  // ── Admin API routes ──
  // Require authentication. Role-based access is enforced by requireAuth()
  // in each route handler (defense-in-depth).
  if (isAdminApiRoute(pathname, method)) {
    if (!user) {
      const errorResponse = NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
      return applySecurityHeaders(errorResponse);
    }
  }

  // ── Rep-portal API routes (non-public) ──
  // Require authentication (route handler does the rep-specific check).
  if (isRepPortalApiRoute(pathname) && !isPublicApiRoute(pathname, method)) {
    if (!user) {
      const errorResponse = NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
      return applySecurityHeaders(errorResponse);
    }
  }

  // ── Inject x-org-id header for downstream server components/routes ──
  // Set on request headers so Next.js forwards to server components via headers()
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-org-id", orgId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Copy cookies from the auth-refreshed response (Supabase middleware client may
  // have set refreshed session cookies that we must preserve)
  const authResponse = getResponse();
  authResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie.name, cookie.value, {
      path: cookie.path || "/",
      sameSite: (cookie.sameSite as "lax" | "strict" | "none") || "lax",
      secure: cookie.secure,
      maxAge: 60 * 60 * 24 * 30, // 30 days — match middleware client
    });
  });

  return applySecurityHeaders(response);
}

/**
 * Matcher: run middleware on admin pages, API routes, rep portal, and event pages.
 * Static assets, images, and public pages skip middleware entirely.
 */
export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/api/:path*",
    "/auth/:path*",
    "/rep/:path*",
    "/event/:path*",
  ],
};
