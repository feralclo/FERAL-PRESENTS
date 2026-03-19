import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import type { EmailSettings } from "@/types/email";
import { DEFAULT_EMAIL_SETTINGS } from "@/types/email";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

/**
 * Send a team invite email. Fire-and-forget — never throws.
 *
 * Light background, Entry platform branding (not tenant-branded).
 * Dark-mode safe — no black backgrounds that invert badly.
 */
export async function sendTeamInviteEmail(params: {
  email: string;
  firstName: string;
  orgId: string;
  inviteToken: string;
  invitedByName?: string;
}): Promise<void> {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.log("[team-email] RESEND_API_KEY not configured — skipping");
      return;
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) return;

    const { data: brandingRow } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", `${params.orgId}_branding`)
      .single();

    // Fetch email settings for verified from address
    const { data: emailRow } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", `${params.orgId}_email`)
      .single();

    const emailSettings: EmailSettings = {
      ...DEFAULT_EMAIL_SETTINGS,
      from_email: `${params.orgId}@mail.entry.events`,
      ...((emailRow?.data as Partial<EmailSettings>) || {}),
    };

    const branding = (brandingRow?.data as Record<string, string>) || {};
    const orgName = escapeHtml(branding.org_name || params.orgId.toUpperCase());
    // Always use admin host for invite links — tenant domains don't serve /admin routes
    const adminHost = process.env.NODE_ENV === "production"
      ? "https://admin.entry.events"
      : (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

    const inviteUrl = `${adminHost}/admin/invite/${encodeURIComponent(params.inviteToken)}`;
    const inviterLine = params.invitedByName
      ? `${escapeHtml(params.invitedByName)} has invited you to join the <strong>${orgName}</strong> team on Entry.`
      : `You've been invited to join the <strong>${orgName}</strong> team on Entry.`;

    const subject = `${params.invitedByName || orgName} invited you to Entry`;
    const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" style="color-scheme: light only;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${escapeHtml(subject)}</title>
  <style>
    :root { color-scheme: light only; }
    @media (prefers-color-scheme: dark) {
      .email-bg { background-color: #f4f4f5 !important; }
      .email-card { background-color: #ffffff !important; }
      .email-text { color: #18181b !important; }
      .email-text-secondary { color: #3f3f46 !important; }
      .email-text-muted { color: #a1a1aa !important; }
      .email-logo { color: #8B5CF6 !important; }
      .email-btn { background-color: #7C3AED !important; }
      .email-btn a { color: #ffffff !important; }
    }
  </style>
</head>
<body class="email-bg" style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #18181b;">
  <!-- Gmail dark mode prevention: hidden white div forces light luminance detection -->
  <div style="display: none; max-height: 0; overflow: hidden; color: #f4f4f5; font-size: 0;">
    &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847;
  </div>
  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-bg" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <!-- Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-card" style="max-width: 480px; background-color: #ffffff; border-radius: 12px; overflow: hidden;">

          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 0 32px; text-align: center;">
              <span class="email-logo" style="font-family: 'Courier New', monospace; font-size: 15px; font-weight: 700; letter-spacing: 6px; text-transform: uppercase; color: #8B5CF6;">
                ENTRY
              </span>
              <div style="margin-top: 16px; height: 1px; background-color: #e4e4e7;"></div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 32px 8px 32px;">
              <h1 class="email-text" style="font-size: 22px; font-weight: 700; color: #18181b; margin: 0 0 16px 0; line-height: 1.3;">
                You're invited to join a team
              </h1>
              <p class="email-text-secondary" style="font-size: 15px; color: #3f3f46; margin: 0 0 24px 0; line-height: 1.6;">
                Hi ${escapeHtml(params.firstName)},
              </p>
              <p class="email-text-secondary" style="font-size: 15px; color: #3f3f46; margin: 0 0 24px 0; line-height: 1.6;">
                ${inviterLine}
              </p>
              <p class="email-text-secondary" style="font-size: 15px; color: #3f3f46; margin: 0 0 28px 0; line-height: 1.6;">
                Click the button below to accept and get started.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td class="email-btn" style="background-color: #7C3AED; border-radius: 8px;">
                    <a href="${inviteUrl}" style="display: inline-block; padding: 14px 36px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; letter-spacing: 0.3px;">
                      Accept Invite
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="height: 1px; background-color: #e4e4e7;"></div>
            </td>
          </tr>

          <!-- Fine print -->
          <tr>
            <td style="padding: 20px 32px 28px 32px;">
              <p class="email-text-muted" style="font-size: 12px; color: #a1a1aa; margin: 0 0 4px 0; line-height: 1.5;">
                This invite expires in 7 days. You can sign in with Google or set a password.
              </p>
              <p class="email-text-muted" style="font-size: 12px; color: #a1a1aa; margin: 0; line-height: 1.5;">
                If you didn't expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>

        </table>

        <!-- Footer outside card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px;">
          <tr>
            <td style="padding: 20px 32px 0 32px; text-align: center;">
              <p style="font-size: 11px; color: #a1a1aa; margin: 0;">
                Sent by <span style="color: #7C3AED; font-weight: 600;">Entry</span> on behalf of ${orgName}
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

    await resend.emails.send({
      from: `Entry <${emailSettings.from_email}>`,
      to: [params.email],
      subject,
      html,
    });

    console.log(`[team-email] Invite sent to ${params.email}`);
  } catch (err) {
    console.error("[team-email] Failed to send invite:", err);
  }
}
