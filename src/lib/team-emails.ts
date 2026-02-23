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
    const accentColor = branding.accent_color || "#8B5CF6";
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");

    if (!siteUrl) {
      console.warn("[team-email] NEXT_PUBLIC_SITE_URL is not set — invite link will be broken");
    }

    const inviteUrl = `${siteUrl}/admin/invite/${encodeURIComponent(params.inviteToken)}`;
    const inviterText = params.invitedByName
      ? `<strong style="color:#fff">${escapeHtml(params.invitedByName)}</strong> has invited you to join`
      : "You've been invited to join";

    const subject = `You're invited to ${orgName} on Entry`;
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin: 0; padding: 0; background: #08080c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 560px; margin: 0 auto; padding: 40px 24px;">
    <!-- Header -->
    <div style="margin-bottom: 32px;">
      <span style="font-family: monospace; font-size: 13px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; background: linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
        ENTRY
      </span>
      <span style="font-size: 11px; color: #71717a; margin-left: 8px;">
        × ${orgName}
      </span>
    </div>

    <!-- Body -->
    <h1 style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0;">
      You're invited.
    </h1>
    <p style="font-size: 14px; color: #a0a0b0; margin: 0 0 24px 0; line-height: 1.6;">
      Hey ${escapeHtml(params.firstName)}, ${inviterText} the <strong style="color:#fff">${orgName}</strong> team on Entry.
    </p>
    <div style="background: rgba(139,92,246,0.08); border: 1px solid rgba(139,92,246,0.2); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: ${accentColor}; margin: 0 0 8px 0; font-weight: 600;">
        What you'll get
      </p>
      <p style="font-size: 14px; color: #d0d0d8; margin: 0; line-height: 1.8;">
        Access to the admin dashboard to manage events, orders, and more — depending on the permissions assigned to you.
      </p>
    </div>
    <p style="font-size: 14px; color: #a0a0b0; margin: 0 0 24px 0; line-height: 1.6;">
      Click below to set your password and get started. This invite expires in 7 days.
    </p>
    <a href="${inviteUrl}" style="display: inline-block; background: ${accentColor}; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none; letter-spacing: 0.5px;">
      Accept Invite
    </a>

    <!-- Footer -->
    <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #1e1e2a;">
      <p style="font-size: 11px; color: #52525b; margin: 0; line-height: 1.6;">
        Powered by <span style="color: ${accentColor}; font-weight: 600;">Entry</span> — The events platform.
      </p>
    </div>
  </div>
</body>
</html>`;

    await resend.emails.send({
      from: `${emailSettings.from_name} <${emailSettings.from_email}>`,
      to: [params.email],
      subject,
      html,
    });

    console.log(`[team-email] Invite sent to ${params.email}`);
  } catch (err) {
    console.error("[team-email] Failed to send invite:", err);
  }
}
