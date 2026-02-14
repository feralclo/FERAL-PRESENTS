import { type NextRequest, NextResponse } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";

/**
 * Security headers applied to all responses.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
};

/**
 * Admin page routes that require authentication.
 * Login page is excluded so users can actually log in.
 */
function isProtectedAdminPage(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")
  );
}

/**
 * API routes that require admin authentication.
 * Public API routes (customer-facing checkout, webhooks, analytics) are excluded.
 */
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

const PUBLIC_API_EXACT_GETS = [
  "/api/events",
  "/api/settings",
  "/api/products",
  "/api/branding",
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

function isProtectedApiRoute(pathname: string, method: string): boolean {
  return pathname.startsWith("/api/") && !isPublicApiRoute(pathname, method);
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

  // Create Supabase middleware client (refreshes session cookies)
  const client = createMiddlewareClient(request);

  if (!client) {
    // Supabase not configured — let the request through but add headers
    const response = NextResponse.next();
    return applySecurityHeaders(response);
  }

  const { supabase, response: getResponse } = client;

  // Refresh the session — this is the primary job of the middleware.
  // Must be called before checking the user so tokens are refreshed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect admin pages: redirect to login if not authenticated
  if (isProtectedAdminPage(pathname)) {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/admin/login/";
      loginUrl.searchParams.set("redirect", pathname);
      const redirectResponse = NextResponse.redirect(loginUrl);
      return applySecurityHeaders(redirectResponse);
    }
  }

  // Protect admin API routes: return 401 if not authenticated
  if (isProtectedApiRoute(pathname, method)) {
    if (!user) {
      const errorResponse = NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
      return applySecurityHeaders(errorResponse);
    }
  }

  return applySecurityHeaders(getResponse());
}

/**
 * Matcher: run middleware on admin pages and API routes.
 * Static assets, images, and public pages skip middleware entirely.
 */
export const config = {
  matcher: [
    "/admin/:path*",
    "/api/:path*",
  ],
};
