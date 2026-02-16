import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getRepSettings } from "@/lib/rep-points";

/**
 * Escape HTML special characters to prevent XSS in email templates.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Lazy Resend client.
 */
function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

type RepEmailType =
  | "welcome"
  | "invite"
  | "email_verification"
  | "quest_notification"
  | "reward_unlocked"
  | "reward_fulfilled"
  | "level_up"
  | "application_rejected"
  | "sale_notification";

interface RepEmailParams {
  type: RepEmailType;
  repId: string;
  orgId: string;
  data?: Record<string, unknown>;
}

/**
 * Send a rep-related email. Fire-and-forget — never throws.
 */
export async function sendRepEmail(params: RepEmailParams): Promise<void> {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.log("[rep-email] RESEND_API_KEY not configured — skipping");
      return;
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) return;

    // Fetch rep info
    const { data: rep } = await supabase
      .from(TABLES.REPS)
      .select("*")
      .eq("id", params.repId)
      .eq("org_id", params.orgId)
      .single();

    if (!rep) return;

    // Fetch org branding for tenant context
    const { data: brandingRow } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", `${params.orgId}_branding`)
      .single();

    const branding = (brandingRow?.data as Record<string, string>) || {};
    const orgName = branding.org_name || params.orgId.toUpperCase();
    const accentColor = branding.accent_color || "#8B5CF6";

    // Get program settings for sender info
    const settings = await getRepSettings(params.orgId);
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");

    if (!siteUrl) {
      console.warn("[rep-email] NEXT_PUBLIC_SITE_URL is not set — email links will be broken");
    }

    const { subject, html } = buildEmail(params.type, {
      rep,
      orgName,
      accentColor,
      siteUrl,
      settings,
      ...params.data,
    });

    await resend.emails.send({
      from: `${settings.email_from_name} <${settings.email_from_address}>`,
      to: [rep.email],
      subject,
      html,
    });

    console.log(`[rep-email] ${params.type} sent to ${rep.email}`);
  } catch (err) {
    console.error(`[rep-email] Failed to send ${params.type}:`, err);
  }
}

/**
 * Send an invite email to a potential rep (before they have a rep row with auth).
 */
export async function sendRepInviteEmail(params: {
  email: string;
  firstName: string;
  orgId: string;
  inviteToken: string;
  discountCode?: string;
}): Promise<void> {
  try {
    const resend = getResendClient();
    if (!resend) return;

    const supabase = await getSupabaseAdmin();
    if (!supabase) return;

    const { data: brandingRow } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", `${params.orgId}_branding`)
      .single();

    const branding = (brandingRow?.data as Record<string, string>) || {};
    const orgName = escapeHtml(branding.org_name || params.orgId.toUpperCase());
    const accentColor = branding.accent_color || "#8B5CF6";
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    if (!siteUrl) {
      console.warn("[rep-email] NEXT_PUBLIC_SITE_URL is not set — invite link will be broken");
    }
    const settings = await getRepSettings(params.orgId);
    const inviteUrl = `${siteUrl}/rep/invite/${encodeURIComponent(params.inviteToken)}`;

    const subject = `You've been selected as a ${orgName} Rep`;
    const html = wrapEmail(accentColor, orgName, `
      <h1 style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0;">
        You've been selected.
      </h1>
      <p style="font-size: 14px; color: #a0a0b0; margin: 0 0 24px 0; line-height: 1.6;">
        Hey ${escapeHtml(params.firstName)}, the team at <strong style="color:#fff">${escapeHtml(orgName)}</strong> wants you on board as an official rep.
      </p>
      <div style="background: rgba(139,92,246,0.08); border: 1px solid rgba(139,92,246,0.2); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: ${accentColor}; margin: 0 0 8px 0; font-weight: 600;">
          Your Discount Code
        </p>
        <p style="font-size: 20px; font-weight: 700; font-family: monospace; color: #ffffff; margin: 0; letter-spacing: 3px;">
          ${escapeHtml(params.discountCode || "Awaiting activation")}
        </p>
      </div>
      <p style="font-size: 14px; color: #a0a0b0; margin: 0 0 24px 0; line-height: 1.6;">
        Share your code with your network. Every ticket sold earns you points, unlocks rewards, and climbs you up the leaderboard.
      </p>
      <a href="${inviteUrl}" style="display: inline-block; background: ${accentColor}; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none; letter-spacing: 0.5px;">
        Accept Invite
      </a>
    `);

    await resend.emails.send({
      from: `${settings.email_from_name} <${settings.email_from_address}>`,
      to: [params.email],
      subject,
      html,
    });

    console.log(`[rep-email] Invite sent to ${params.email}`);
  } catch (err) {
    console.error("[rep-email] Failed to send invite:", err);
  }
}

// ─── Email Builders ──────────────────────────────────────────────────────────

function buildEmail(
  type: RepEmailType,
  ctx: Record<string, unknown>
): { subject: string; html: string } {
  const rep = ctx.rep as Record<string, unknown>;
  const orgName = escapeHtml(ctx.orgName as string);
  const accent = ctx.accentColor as string;
  const siteUrl = ctx.siteUrl as string;
  const firstName = escapeHtml((rep.first_name as string) || "there");

  switch (type) {
    case "email_verification": {
      const verifyUrl = `${siteUrl}/rep/verify-email?token=${encodeURIComponent(String(ctx.verification_token || ""))}`;
      return {
        subject: `Verify your email — ${orgName} Reps`,
        html: wrapEmail(accent, orgName, `
          <h1 style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0;">
            Verify your email
          </h1>
          <p style="font-size: 14px; color: #a0a0b0; margin: 0 0 24px 0; line-height: 1.6;">
            Hey ${firstName}, tap the button below to confirm your email and activate your rep account.
          </p>
          <a href="${verifyUrl}" style="display: inline-block; background: ${accent}; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none; letter-spacing: 0.5px;">
            Verify Email
          </a>
          <p style="font-size: 12px; color: #71717a; margin: 24px 0 0 0; line-height: 1.6;">
            If you didn\u2019t sign up for ${orgName} Reps, you can ignore this email.
          </p>
        `),
      };
    }

    case "welcome":
      return {
        subject: `Welcome to the team, ${firstName}!`,
        html: wrapEmail(accent, orgName, `
          <h1 style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0;">
            Welcome aboard, ${firstName}.
          </h1>
          <p style="font-size: 14px; color: #a0a0b0; margin: 0 0 24px 0; line-height: 1.6;">
            You're now an official <strong style="color:#fff">${orgName}</strong> rep. Your dashboard is live and your journey starts now.
          </p>
          ${rep.invite_token ? `
          <div style="background: rgba(139,92,246,0.08); border: 1px solid rgba(139,92,246,0.2); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: ${accent}; margin: 0 0 4px 0; font-weight: 600;">
              Getting Started
            </p>
            <p style="font-size: 14px; color: #d0d0d8; margin: 0; line-height: 1.6;">
              Share your personal discount code, complete quests, and earn points to unlock rewards.
            </p>
          </div>
          ` : ""}
          <a href="${siteUrl}/rep" style="display: inline-block; background: ${accent}; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none;">
            Go to Dashboard
          </a>
        `),
      };

    case "quest_notification":
      return {
        subject: `New Quest: ${escapeHtml(String(ctx.quest_title || "Complete it for points!"))}`,
        html: wrapEmail(accent, orgName, `
          <h1 style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0;">
            New Quest Available
          </h1>
          <p style="font-size: 14px; color: #a0a0b0; margin: 0 0 16px 0; line-height: 1.6;">
            Hey ${firstName}, there's a new quest waiting for you.
          </p>
          <div style="background: rgba(139,92,246,0.08); border: 1px solid rgba(139,92,246,0.2); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <p style="font-size: 18px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0;">
              ${escapeHtml(String(ctx.quest_title || "New Quest"))}
            </p>
            ${ctx.quest_description ? `<p style="font-size: 14px; color: #a0a0b0; margin: 0 0 12px 0;">${escapeHtml(String(ctx.quest_description))}</p>` : ""}
            <div style="display: inline-block; background: ${accent}; color: #fff; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 6px;">
              +${ctx.points_reward || 0} PTS
            </div>
            ${ctx.expires_at ? `<p style="font-size: 12px; color: #71717a; margin: 8px 0 0 0;">Expires: ${ctx.expires_at}</p>` : ""}
          </div>
          <a href="${siteUrl}/rep/quests" style="display: inline-block; background: ${accent}; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none;">
            View Quest
          </a>
        `),
      };

    case "reward_unlocked":
      return {
        subject: "You've unlocked a reward!",
        html: wrapEmail(accent, orgName, `
          <h1 style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0;">
            Reward Unlocked!
          </h1>
          <p style="font-size: 14px; color: #a0a0b0; margin: 0 0 24px 0; line-height: 1.6;">
            ${firstName}, you've hit a milestone and unlocked a reward.
          </p>
          <div style="background: rgba(139,92,246,0.08); border: 1px solid rgba(139,92,246,0.2); border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
            <p style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 4px 0;">
              ${escapeHtml(String(ctx.reward_name || "Reward"))}
            </p>
            <p style="font-size: 14px; color: #a0a0b0; margin: 0;">
              ${escapeHtml(String(ctx.milestone_title || "Milestone achieved"))}
            </p>
          </div>
          <a href="${siteUrl}/rep/rewards" style="display: inline-block; background: ${accent}; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none;">
            Claim Reward
          </a>
        `),
      };

    case "reward_fulfilled": {
      const rewardName = escapeHtml(String(ctx.reward_name || "Your reward"));
      const productDetails = ctx.product_name ? escapeHtml(String(ctx.product_name)) : null;
      const customValue = ctx.custom_value ? escapeHtml(String(ctx.custom_value)) : null;
      const fulfilmentNotes = ctx.notes ? escapeHtml(String(ctx.notes)) : null;
      return {
        subject: `Your reward is ready — ${rewardName}`,
        html: wrapEmail(accent, orgName, `
          <h1 style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0;">
            Reward Fulfilled!
          </h1>
          <p style="font-size: 14px; color: #a0a0b0; margin: 0 0 24px 0; line-height: 1.6;">
            ${firstName}, your reward has been processed and is ready for you.
          </p>
          <div style="background: rgba(52,211,153,0.08); border: 1px solid rgba(52,211,153,0.2); border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
            <p style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0;">
              ${rewardName}
            </p>
            ${productDetails ? `<p style="font-size: 14px; color: #34D399; margin: 0 0 4px 0;">Product: ${productDetails}</p>` : ""}
            ${customValue ? `<p style="font-size: 14px; color: #a0a0b0; margin: 0 0 4px 0;">${customValue}</p>` : ""}
            ${fulfilmentNotes ? `<p style="font-size: 13px; color: #a0a0b0; margin: 8px 0 0 0; font-style: italic;">"${fulfilmentNotes}"</p>` : ""}
          </div>
          <a href="${siteUrl}/rep/rewards" style="display: inline-block; background: ${accent}; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none;">
            View Rewards
          </a>
        `),
      };
    }

    case "level_up": {
      const newLevel = ctx.new_level || 2;
      const newLevelName = escapeHtml(String(ctx.new_level_name || `Level ${newLevel}`));
      const oldLevel = ctx.old_level || 1;
      const oldLevelName = escapeHtml(String(ctx.old_level_name || `Level ${oldLevel}`));
      return {
        subject: `You leveled up — ${newLevelName}!`,
        html: wrapEmail(accent, orgName, `
          <h1 style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0;">
            Level Up!
          </h1>
          <p style="font-size: 14px; color: #a0a0b0; margin: 0 0 24px 0; line-height: 1.6;">
            ${firstName}, you've been promoted.
          </p>
          <div style="background: rgba(139,92,246,0.08); border: 1px solid rgba(139,92,246,0.2); border-radius: 12px; padding: 24px; margin-bottom: 24px; text-align: center;">
            <p style="font-size: 13px; color: #71717a; margin: 0 0 4px 0; text-decoration: line-through;">
              Level ${oldLevel} — ${oldLevelName}
            </p>
            <p style="font-size: 28px; font-weight: 800; margin: 8px 0 0 0; background: linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
              Level ${newLevel} — ${newLevelName}
            </p>
          </div>
          <a href="${siteUrl}/rep" style="display: inline-block; background: ${accent}; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none;">
            View Dashboard
          </a>
        `),
      };
    }

    case "application_rejected":
      return {
        subject: `Update on your ${orgName} application`,
        html: wrapEmail(accent, orgName, `
          <h1 style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0;">
            Application Update
          </h1>
          <p style="font-size: 14px; color: #a0a0b0; margin: 0 0 16px 0; line-height: 1.6;">
            Hey ${firstName}, thanks for your interest in joining the ${orgName} rep team.
          </p>
          <p style="font-size: 14px; color: #a0a0b0; margin: 0 0 16px 0; line-height: 1.6;">
            After careful review, we're unable to bring you on board at this time. This doesn't mean the door is closed — we run new campaigns regularly and encourage you to apply again in the future.
          </p>
          <p style="font-size: 14px; color: #a0a0b0; margin: 0; line-height: 1.6;">
            Keep pushing. Keep creating.
          </p>
        `),
      };

    case "sale_notification":
      return {
        subject: "Someone used your code!",
        html: wrapEmail(accent, orgName, `
          <h1 style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0;">
            Sale incoming!
          </h1>
          <p style="font-size: 14px; color: #a0a0b0; margin: 0 0 24px 0; line-height: 1.6;">
            ${firstName}, someone just used your discount code to buy tickets.
          </p>
          <div style="background: rgba(139,92,246,0.08); border: 1px solid rgba(139,92,246,0.2); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <div style="display: flex; gap: 24px;">
              <div>
                <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: ${accent}; margin: 0 0 4px 0; font-weight: 600;">Tickets</p>
                <p style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0;">${ctx.ticket_count || 0}</p>
              </div>
              <div>
                <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: ${accent}; margin: 0 0 4px 0; font-weight: 600;">Revenue</p>
                <p style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0;">£${Number(ctx.order_total || 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
          <a href="${siteUrl}/rep/" style="display: inline-block; background: ${accent}; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none;">
            View Dashboard
          </a>
        `),
      };

    default:
      return { subject: "Entry Reps Update", html: "" };
  }
}

/**
 * Wrap email content in the branded layout.
 */
function wrapEmail(accent: string, orgName: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin: 0; padding: 0; background: #08080c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 560px; margin: 0 auto; padding: 40px 24px;">
    <!-- Header -->
    <div style="margin-bottom: 32px;">
      <span style="font-family: monospace; font-size: 13px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; background: linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
        ENTRY REPS
      </span>
      <span style="font-size: 11px; color: #71717a; margin-left: 8px;">
        × ${orgName}
      </span>
    </div>

    <!-- Body -->
    ${body}

    <!-- Footer -->
    <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #1e1e2a;">
      <p style="font-size: 11px; color: #52525b; margin: 0; line-height: 1.6;">
        Powered by <span style="color: ${accent}; font-weight: 600;">Entry</span> — The events platform.
      </p>
    </div>
  </div>
</body>
</html>`;
}
