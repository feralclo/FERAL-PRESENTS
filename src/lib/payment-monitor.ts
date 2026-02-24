import { NextRequest } from "next/server";
import { TABLES } from "@/lib/constants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPlatformAlert } from "@/lib/payment-alerts";

/**
 * Payment event types for the monitoring system.
 */
export type PaymentEventType =
  | "payment_failed"
  | "payment_succeeded"
  | "checkout_error"
  | "checkout_validation"
  | "webhook_error"
  | "webhook_received"
  | "connect_account_unhealthy"
  | "connect_account_healthy"
  | "connect_fallback"
  | "rate_limit_hit"
  | "subscription_failed"
  | "orphaned_payment"
  | "client_checkout_error"
  | "incomplete_payment";

export type PaymentEventSeverity = "info" | "warning" | "critical";

interface LogPaymentEventParams {
  orgId: string;
  type: PaymentEventType;
  severity?: PaymentEventSeverity;
  eventId?: string;
  stripePaymentIntentId?: string;
  stripeAccountId?: string;
  errorCode?: string;
  errorMessage?: string;
  customerEmail?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Auto-derive severity from event type + error code when not explicitly set.
 */
function deriveSeverity(type: PaymentEventType, errorCode?: string): PaymentEventSeverity {
  switch (type) {
    case "payment_succeeded":
    case "webhook_received":
    case "connect_account_healthy":
    case "checkout_validation":
      return "info";

    case "payment_failed":
      // Card declines are warnings; other failures are critical
      if (errorCode === "card_declined" || errorCode === "insufficient_funds" || errorCode === "expired_card") {
        return "warning";
      }
      return "critical";

    case "checkout_error":
    case "webhook_error":
    case "connect_account_unhealthy":
    case "subscription_failed":
    case "orphaned_payment":
      return "critical";

    case "client_checkout_error":
    case "incomplete_payment":
      return "warning";

    case "connect_fallback":
    case "rate_limit_hit":
      return "warning";

    default:
      return "info";
  }
}

/**
 * Log a payment event to the payment_events table.
 *
 * Fire-and-forget — never throws. Catches all errors and logs to console as fallback.
 * If severity is critical, also sends a platform alert email.
 */
export async function logPaymentEvent(params: LogPaymentEventParams): Promise<void> {
  try {
    const severity = params.severity || deriveSeverity(params.type, params.errorCode);

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      console.error("[payment-monitor] Supabase not available — event not logged:", params.type);
      return;
    }

    const { error } = await supabase.from(TABLES.PAYMENT_EVENTS).insert({
      org_id: params.orgId,
      type: params.type,
      severity,
      event_id: params.eventId || null,
      stripe_payment_intent_id: params.stripePaymentIntentId || null,
      stripe_account_id: params.stripeAccountId || null,
      error_code: params.errorCode || null,
      error_message: params.errorMessage || null,
      customer_email: params.customerEmail || null,
      ip_address: params.ipAddress || null,
      metadata: params.metadata || {},
    });

    if (error) {
      console.error("[payment-monitor] Insert failed:", error);
      return;
    }

    // Send platform alert for critical events (fire-and-forget)
    if (severity === "critical") {
      sendPlatformAlert({
        subject: `${params.type} for org ${params.orgId}`,
        body: [
          `Type: ${params.type}`,
          `Org: ${params.orgId}`,
          params.errorCode ? `Error code: ${params.errorCode}` : null,
          params.errorMessage ? `Error: ${params.errorMessage}` : null,
          params.stripePaymentIntentId ? `PaymentIntent: ${params.stripePaymentIntentId}` : null,
          params.stripeAccountId ? `Account: ${params.stripeAccountId}` : null,
          params.customerEmail ? `Customer: ${params.customerEmail}` : null,
          `Time: ${new Date().toISOString()}`,
        ]
          .filter(Boolean)
          .join("\n"),
        severity: "critical",
      }).catch((err) => {
        console.error("[payment-monitor] Alert send failed:", err);
      });
    }
  } catch (err) {
    // Never throw — log to console as fallback
    console.error("[payment-monitor] Failed to log payment event:", err);
  }
}

/**
 * Extract client IP from a Next.js request.
 * Checks x-forwarded-for and x-real-ip headers.
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}
