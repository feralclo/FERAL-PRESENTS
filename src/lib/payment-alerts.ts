import { Resend } from "resend";

/**
 * Platform alert email utility.
 *
 * Sends critical payment/health alerts to the platform owner via Resend.
 * Fire-and-forget — never throws. 30-minute cooldown per subject to prevent spam.
 */

const PLATFORM_ALERT_EMAIL = process.env.PLATFORM_ALERT_EMAIL;

/** In-memory cooldown: subject → expiry timestamp */
const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

/** Checkout alert: 2-minute cooldown with suppressed error count tracking */
const CHECKOUT_COOLDOWN_MS = 2 * 60 * 1000;
const checkoutCounts = new Map<
  string,
  { count: number; firstAt: number; lastMessage: string; lastCustomer: string }
>();

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export async function sendPlatformAlert(params: {
  subject: string;
  body: string;
  severity: "warning" | "critical";
}): Promise<void> {
  try {
    if (!PLATFORM_ALERT_EMAIL) {
      console.warn("[payment-alerts] PLATFORM_ALERT_EMAIL not configured — skipping alert");
      return;
    }

    // Check cooldown — prevent spamming the same alert
    const now = Date.now();
    const cooldownKey = params.subject;
    const expiresAt = cooldowns.get(cooldownKey);
    if (expiresAt && now < expiresAt) {
      return;
    }
    cooldowns.set(cooldownKey, now + COOLDOWN_MS);

    const resend = getResendClient();
    if (!resend) {
      console.warn("[payment-alerts] Resend not configured — skipping alert");
      return;
    }

    const prefix = params.severity === "critical" ? "[CRITICAL]" : "[WARNING]";

    const { error } = await resend.emails.send({
      from: "Entry Alerts <alerts@mail.entry.events>",
      to: [PLATFORM_ALERT_EMAIL],
      subject: `${prefix} ${params.subject}`,
      text: params.body,
      html: `
        <div style="font-family: monospace; padding: 20px; background: #0e0e0e; color: #f0f0f5;">
          <div style="padding: 16px; border-left: 4px solid ${params.severity === "critical" ? "#F43F5E" : "#FBBF24"}; background: #1a1a1a; margin-bottom: 16px;">
            <strong style="color: ${params.severity === "critical" ? "#F43F5E" : "#FBBF24"};">${prefix}</strong>
            <span style="color: #f0f0f5; margin-left: 8px;">${params.subject}</span>
          </div>
          <pre style="white-space: pre-wrap; color: #ccc; font-size: 13px;">${params.body}</pre>
          <hr style="border: 1px solid #2a2a2a; margin: 20px 0;" />
          <p style="color: #555; font-size: 11px;">Entry Platform Alert System</p>
        </div>
      `,
    });

    if (error) {
      console.error("[payment-alerts] Failed to send alert:", error);
    }
  } catch (err) {
    console.error("[payment-alerts] Alert send error:", err);
  }
}

/**
 * Checkout-specific alert with shorter cooldown (2 min) and error count tracking.
 *
 * When multiple checkout errors happen in quick succession, subsequent errors
 * are counted silently. When the cooldown expires, the next alert includes
 * the total count (e.g. "5 checkout errors in last 3 minutes").
 */
export async function sendCheckoutAlert(params: {
  subject: string;
  body: string;
  severity: "warning" | "critical";
  customerEmail?: string;
  errorMessage?: string;
  eventId?: string;
}): Promise<void> {
  try {
    if (!PLATFORM_ALERT_EMAIL) {
      console.warn("[payment-alerts] PLATFORM_ALERT_EMAIL not configured — skipping checkout alert");
      return;
    }

    const now = Date.now();
    const cooldownKey = "checkout_alert";
    const existing = checkoutCounts.get(cooldownKey);

    if (existing && now - existing.firstAt < CHECKOUT_COOLDOWN_MS) {
      // Still within cooldown — count silently
      existing.count++;
      existing.lastMessage = params.errorMessage || existing.lastMessage;
      existing.lastCustomer = params.customerEmail || existing.lastCustomer;
      return;
    }

    // Cooldown expired or first error — prepare to send
    const suppressedCount = existing?.count || 0;
    const suppressedSince = existing?.firstAt || now;

    // Reset counter for next window
    checkoutCounts.set(cooldownKey, {
      count: 1,
      firstAt: now,
      lastMessage: params.errorMessage || "",
      lastCustomer: params.customerEmail || "",
    });

    const resend = getResendClient();
    if (!resend) {
      console.warn("[payment-alerts] Resend not configured — skipping checkout alert");
      return;
    }

    const minutesSinceLast = suppressedCount > 0
      ? Math.round((now - suppressedSince) / 60_000)
      : 0;
    const countLine = suppressedCount > 1
      ? `<p style="color: #F43F5E; font-weight: bold; font-size: 15px; margin: 12px 0;">
           ${suppressedCount} checkout errors in last ${minutesSinceLast} minute${minutesSinceLast !== 1 ? "s" : ""}
         </p>`
      : "";

    const subject = `[CHECKOUT ALERT] ${params.subject}`;

    const { error } = await resend.emails.send({
      from: "Entry Alerts <alerts@mail.entry.events>",
      to: [PLATFORM_ALERT_EMAIL],
      subject,
      text: `${params.subject}\n\n${params.body}${suppressedCount > 1 ? `\n\n${suppressedCount} checkout errors in last ${minutesSinceLast} minutes` : ""}`,
      html: `
        <div style="font-family: monospace; padding: 20px; background: #0e0e0e; color: #f0f0f5;">
          <div style="padding: 16px; border-left: 4px solid #F43F5E; background: #1a1a1a; margin-bottom: 16px;">
            <strong style="color: #F43F5E; font-size: 14px;">[CHECKOUT ALERT]</strong>
            <span style="color: #f0f0f5; margin-left: 8px;">${params.subject}</span>
          </div>
          ${countLine}
          <pre style="white-space: pre-wrap; color: #ccc; font-size: 13px;">${params.body}</pre>
          <div style="margin-top: 20px;">
            <a href="https://admin.entry.events/admin/backend/payment-health/"
               style="display: inline-block; padding: 10px 20px; background: #F43F5E; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: bold;">
              View Payment Health Dashboard
            </a>
          </div>
          <hr style="border: 1px solid #2a2a2a; margin: 20px 0;" />
          <p style="color: #555; font-size: 11px;">Entry Checkout Alert System</p>
        </div>
      `,
    });

    if (error) {
      console.error("[payment-alerts] Failed to send checkout alert:", error);
    }
  } catch (err) {
    console.error("[payment-alerts] Checkout alert send error:", err);
  }
}
