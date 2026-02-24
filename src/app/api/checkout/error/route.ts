import { NextRequest, NextResponse } from "next/server";
import { getOrgIdFromRequest } from "@/lib/org";
import { logPaymentEvent, getClientIp } from "@/lib/payment-monitor";
import { createRateLimiter } from "@/lib/rate-limit";

// Rate limit: 20 error reports per minute per IP (generous to catch bursts, but prevents abuse)
const errorLimiter = createRateLimiter("checkout-error", {
  limit: 20,
  windowSeconds: 60,
});

/**
 * POST /api/checkout/error
 *
 * Public endpoint for client-side checkout error reporting.
 * Called by the checkout page when Stripe Elements fails, a network error occurs,
 * or any JavaScript error breaks the checkout flow.
 *
 * This closes the biggest monitoring blind spot: client-side failures that
 * never reach the server (broken forms, JS errors, network timeouts).
 */
export async function POST(request: NextRequest) {
  const blocked = errorLimiter(request);
  if (blocked) return blocked;

  try {
    const body = await request.json();
    const {
      error_code,
      error_message,
      event_id,
      event_slug,
      customer_email,
      context,
    } = body;

    if (!error_message) {
      return NextResponse.json({ error: "error_message required" }, { status: 400 });
    }

    const orgId = getOrgIdFromRequest(request);
    const ip = getClientIp(request);

    // Derive severity: Stripe Elements load failure = critical, card errors = warning
    const severity =
      error_code === "elements_load_failed" ||
      error_code === "checkout_crash" ||
      error_code === "network_error"
        ? "critical" as const
        : "warning" as const;

    logPaymentEvent({
      orgId,
      type: "client_checkout_error",
      severity,
      eventId: event_id || undefined,
      errorCode: error_code || "client_error",
      errorMessage: String(error_message).slice(0, 500),
      customerEmail: customer_email || undefined,
      ipAddress: ip,
      metadata: {
        event_slug: event_slug || undefined,
        context: context || undefined,
        user_agent: request.headers.get("user-agent") || undefined,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Never fail — best effort
  }
}
