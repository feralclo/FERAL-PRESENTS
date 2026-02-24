import { NextRequest, NextResponse } from "next/server";
import { generatePaymentDigest } from "@/lib/payment-digest";
import { sendPlatformAlert } from "@/lib/payment-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/payment-digest
 *
 * Runs every 6 hours via Vercel cron.
 * Generates an AI-powered payment health digest using Claude.
 * Emails the digest to the platform owner if there are concerns.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const digest = await generatePaymentDigest(6);

    if (!digest) {
      return NextResponse.json({ error: "Failed to generate digest" }, { status: 500 });
    }

    // Email digest to platform owner if risk level is concern or critical
    if (digest.risk_level === "concern" || digest.risk_level === "critical") {
      const findingsHtml = digest.findings
        .map((f) => {
          const color = f.severity === "critical" ? "#F43F5E"
            : f.severity === "concern" ? "#FB923C"
            : f.severity === "watch" ? "#FBBF24"
            : "#38BDF8";
          return `<div style="padding: 12px; border-left: 3px solid ${color}; background: #1a1a1a; margin-bottom: 8px;">
            <strong style="color: ${color}; font-size: 13px;">${f.title}</strong>
            <p style="color: #ccc; font-size: 12px; margin: 4px 0 0;">${f.detail}</p>
          </div>`;
        })
        .join("");

      const recsHtml = digest.recommendations
        .map((r) => `<li style="color: #ccc; font-size: 12px; margin-bottom: 4px;">${r}</li>`)
        .join("");

      await sendPlatformAlert({
        subject: `Payment Health Digest — ${digest.risk_level.toUpperCase()}`,
        body: `${digest.summary}\n\nFindings:\n${digest.findings.map((f) => `[${f.severity}] ${f.title}: ${f.detail}`).join("\n")}\n\nRecommendations:\n${digest.recommendations.map((r) => `• ${r}`).join("\n")}`,
        severity: digest.risk_level === "critical" ? "critical" : "warning",
      });

      // Also send a nicely formatted HTML version (using Resend directly for custom HTML)
      const resendKey = process.env.RESEND_API_KEY;
      const alertEmail = process.env.PLATFORM_ALERT_EMAIL;
      if (resendKey && alertEmail) {
        try {
          const { Resend } = await import("resend");
          const resend = new Resend(resendKey);
          await resend.emails.send({
            from: "Entry Alerts <alerts@mail.entry.events>",
            to: [alertEmail],
            subject: `Payment Health Digest — ${digest.risk_level.toUpperCase()}`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; background: #0e0e0e; color: #f0f0f5; max-width: 600px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 20px;">
                  <div style="width: 10px; height: 10px; border-radius: 50%; background: ${digest.risk_level === "critical" ? "#F43F5E" : "#FB923C"};"></div>
                  <h1 style="margin: 0; font-size: 18px; color: #f0f0f5;">Payment Health Digest</h1>
                </div>
                <p style="color: #ccc; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">${digest.summary}</p>
                <h2 style="color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 12px;">Findings</h2>
                ${findingsHtml}
                <h2 style="color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin: 24px 0 12px;">Recommendations</h2>
                <ul style="padding-left: 20px; margin: 0;">${recsHtml}</ul>
                <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #2a2a2a;">
                  <p style="color: #555; font-size: 11px; margin: 0;">Stats: ${digest.raw_stats.payments_succeeded} succeeded, ${digest.raw_stats.payments_failed} failed (${(digest.raw_stats.failure_rate * 100).toFixed(1)}%) · ${digest.raw_stats.checkout_errors} server errors · ${digest.raw_stats.client_errors} browser errors</p>
                  <p style="color: #444; font-size: 10px; margin: 8px 0 0;">Generated ${new Date(digest.generated_at).toLocaleString("en-GB")} · Entry Platform AI</p>
                </div>
              </div>
            `,
          });
        } catch {
          // Non-fatal — the text alert already sent above
        }
      }
    }

    return NextResponse.json({
      ok: true,
      risk_level: digest.risk_level,
      findings_count: digest.findings.length,
      summary_preview: digest.summary.slice(0, 100),
    });
  } catch (err) {
    console.error("[payment-digest] Cron error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Digest generation failed" },
      { status: 500 }
    );
  }
}
