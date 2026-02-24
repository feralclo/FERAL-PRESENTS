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
