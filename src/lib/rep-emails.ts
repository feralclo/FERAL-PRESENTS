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

/**
 * Resolve the tenant-facing base URL for an org.
 * Prefers the org's active primary domain, falls back to NEXT_PUBLIC_SITE_URL.
 */
async function resolveTenantUrl(orgId: string, supabase: Awaited<ReturnType<typeof getSupabaseAdmin>>): Promise<string> {
  if (supabase) {
    const { data: domain } = await supabase
      .from(TABLES.DOMAINS)
      .select("hostname")
      .eq("org_id", orgId)
      .eq("is_primary", true)
      .eq("status", "active")
      .single();

    if (domain?.hostname) {
      return `https://${domain.hostname}`;
    }
  }
  return (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
}

// ─── CID Logo Embedding ────────────────────────────────────────────────────

interface CidAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  contentId: string;
}

/**
 * Fetch logo base64 from site_settings for CID inline embedding.
 *
 * Handles both org-prefixed keys (e.g., media_feral_logo) and legacy keys
 * (e.g., media_email-logo) that predate the multi-tenant prefix convention.
 */
async function fetchLogoBase64(
  logoUrl: string | null,
  orgId: string,
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseAdmin>>>
): Promise<string | null> {
  if (!logoUrl) return null;

  const m = logoUrl.match(/\/api\/media\/(.+?)(?:\?.*)?$/);
  if (!m) return null;

  const mediaKey = m[1];

  // Try exact key first (handles both org-prefixed and legacy keys)
  try {
    const { data: row } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", `media_${mediaKey}`)
      .single();
    const d = row?.data as { image?: string } | null;
    if (d?.image) return d.image;
  } catch { /* not found */ }

  // If key doesn't have org prefix, try with it
  if (!mediaKey.startsWith(`${orgId}_`)) {
    try {
      const { data: row } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", `media_${orgId}_${mediaKey}`)
        .single();
      const d = row?.data as { image?: string } | null;
      if (d?.image) return d.image;
    } catch { /* not found */ }
  }

  return null;
}

/**
 * Parse a data-URL base64 string into a Resend CID attachment.
 */
function buildCidAttachment(base64: string): CidAttachment | null {
  const match = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    filename: "logo.png",
    content: Buffer.from(match[2], "base64"),
    contentType: match[1],
    contentId: "brand-logo",
  };
}

/**
 * Fetch the best available logo for email CID embedding.
 * Tries branding logo first, then falls back to email settings logo.
 */
async function resolveLogoCid(
  brandingLogoUrl: string | null,
  orgId: string,
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseAdmin>>>
): Promise<CidAttachment | null> {
  // Try branding logo first
  let base64 = await fetchLogoBase64(brandingLogoUrl, orgId, supabase);

  // Fallback: try email settings logo (used by order confirmation emails)
  if (!base64) {
    try {
      const { data: emailRow } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", `${orgId}_email`)
        .single();
      const emailSettings = (emailRow?.data as Record<string, string>) || {};
      if (emailSettings.logo_url && emailSettings.logo_url !== brandingLogoUrl) {
        base64 = await fetchLogoBase64(emailSettings.logo_url, orgId, supabase);
      }
    } catch { /* no email settings */ }
  }

  if (!base64) return null;
  return buildCidAttachment(base64);
}

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Senders ────────────────────────────────────────────────────────────────

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
    const logoUrl = branding.logo_url || null;

    // Get program settings for sender email address
    const settings = await getRepSettings(params.orgId);
    const siteUrl = await resolveTenantUrl(params.orgId, supabase);

    if (!siteUrl) {
      console.warn("[rep-email] No tenant domain or NEXT_PUBLIC_SITE_URL — email links will be broken");
    }

    // Resolve logo for CID inline embedding
    const logoCid = await resolveLogoCid(logoUrl, params.orgId, supabase);

    const { subject, html } = buildEmail(params.type, {
      rep,
      orgName,
      accentColor,
      hasLogo: !!logoCid,
      siteUrl,
      settings,
      ...params.data,
    });

    await resend.emails.send({
      from: `${orgName} <${settings.email_from_address}>`,
      to: [rep.email],
      subject,
      html,
      ...(logoCid ? { attachments: [logoCid] } : {}),
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
    const orgName = branding.org_name || params.orgId.toUpperCase();
    const accentColor = branding.accent_color || "#8B5CF6";
    const logoUrl = branding.logo_url || null;
    const siteUrl = await resolveTenantUrl(params.orgId, supabase);
    if (!siteUrl) {
      console.warn("[rep-email] No tenant domain or NEXT_PUBLIC_SITE_URL — invite link will be broken");
    }
    const settings = await getRepSettings(params.orgId);
    const inviteUrl = `${siteUrl}/rep/invite/${encodeURIComponent(params.inviteToken)}`;

    // Resolve logo for CID inline embedding
    const logoCid = await resolveLogoCid(logoUrl, params.orgId, supabase);
    const hasLogo = !!logoCid;
    const safeOrgName = escapeHtml(orgName);

    const subject = `You've been selected as a ${safeOrgName} Rep`;
    const html = wrapEmail(accentColor, safeOrgName, hasLogo, `
          <tr>
            <td style="padding: 0 32px 8px; text-align: center;">
              <h1 style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 700; color: #111; letter-spacing: 1px;">
                You've been selected.
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #555;">
                Hey ${escapeHtml(params.firstName)}, the team at <strong style="color: #111;">${safeOrgName}</strong> wants you on board as an official rep.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f3ff; border: 1px solid #e0d8f8; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px; text-align: center;">
                    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: ${accentColor}; margin-bottom: 8px;">
                      YOUR DISCOUNT CODE
                    </div>
                    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 700; color: #111; letter-spacing: 3px;">
                      ${escapeHtml(params.discountCode || "Awaiting activation")}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #555;">
                Share your code with your network. Every ticket sold earns you points, unlocks rewards, and climbs you up the leaderboard.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px; text-align: center;">
              <a href="${inviteUrl}" style="display: inline-block; background-color: ${accentColor}; color: #ffffff; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; padding: 14px 36px; border-radius: 6px; text-decoration: none; letter-spacing: 0.5px;">
                Accept Invite
              </a>
            </td>
          </tr>
    `);

    await resend.emails.send({
      from: `${orgName} <${settings.email_from_address}>`,
      to: [params.email],
      subject,
      html,
      ...(logoCid ? { attachments: [logoCid] } : {}),
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
  const hasLogo = ctx.hasLogo as boolean;
  const siteUrl = ctx.siteUrl as string;
  const firstName = escapeHtml((rep.first_name as string) || "there");
  const wrap = (body: string) => wrapEmail(accent, orgName, hasLogo, body);

  switch (type) {
    case "email_verification": {
      const verifyUrl = `${siteUrl}/rep/verify-email?token=${encodeURIComponent(String(ctx.verification_token || ""))}`;
      return {
        subject: `Verify your email — ${orgName} Reps`,
        html: wrap(`
          <tr>
            <td style="padding: 0 32px 8px; text-align: center;">
              <h1 style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 700; color: #111; letter-spacing: 1px;">
                Verify your email
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #555;">
                Hey ${firstName}, tap the button below to confirm your email and activate your rep account.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <a href="${verifyUrl}" style="display: inline-block; background-color: ${accent}; color: #ffffff; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; padding: 14px 36px; border-radius: 6px; text-decoration: none; letter-spacing: 0.5px;">
                Verify Email
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; line-height: 1.6; color: #999;">
                If you didn\u2019t sign up for ${orgName} Reps, you can ignore this email.
              </p>
            </td>
          </tr>
        `),
      };
    }

    case "welcome":
      return {
        subject: `Welcome to the team, ${firstName}!`,
        html: wrapWelcomeEmail(orgName, hasLogo, `
          <tr>
            <td style="padding: 0 32px 8px; text-align: center;">
              <h1 style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 28px; font-weight: 800; color: #111; letter-spacing: -0.5px;">
                Welcome to the team.
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #555;">
                You're officially a <strong style="color: #111;">${orgName}</strong> rep. Your dashboard is live — start sharing, earning, and climbing.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f3ff; border: 1px solid #e0d8f8; border-radius: 10px;">
                <tr>
                  <td style="padding: 24px;">
                    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #8B5CF6; margin-bottom: 10px;">
                      HOW IT WORKS
                    </div>
                    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #374151; line-height: 1.8;">
                      <strong style="color: #111;">1.</strong> Share your unique discount code<br>
                      <strong style="color: #111;">2.</strong> Complete quests to earn bonus XP<br>
                      <strong style="color: #111;">3.</strong> Climb the leaderboard &amp; unlock rewards
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px; text-align: center;">
              <a href="${siteUrl}/rep" style="display: inline-block; background-color: #8B5CF6; color: #ffffff; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; font-weight: 700; padding: 16px 40px; border-radius: 10px; text-decoration: none; letter-spacing: 0.3px;">
                Open Dashboard
              </a>
            </td>
          </tr>
        `),
      };

    case "quest_notification":
      return {
        subject: `New Quest: ${escapeHtml(String(ctx.quest_title || "Complete it for points!"))}`,
        html: wrap(`
          <tr>
            <td style="padding: 0 32px 8px; text-align: center;">
              <h1 style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 700; color: #111; letter-spacing: 1px;">
                New Quest Available
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 16px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #555;">
                Hey ${firstName}, there's a new quest waiting for you.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f3ff; border: 1px solid #e0d8f8; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px;">
                    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 17px; font-weight: 700; color: #111; margin-bottom: 8px;">
                      ${escapeHtml(String(ctx.quest_title || "New Quest"))}
                    </div>
                    ${ctx.quest_description ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #555; margin-bottom: 12px; line-height: 1.5;">${escapeHtml(String(ctx.quest_description))}</div>` : ""}
                    <div style="display: inline-block; background-color: ${accent}; color: #fff; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 4px; letter-spacing: 1px;">
                      +${ctx.points_reward || 0} PTS
                    </div>
                    ${ctx.expires_at ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #999; margin-top: 10px;">Expires: ${escapeHtml(String(ctx.expires_at))}</div>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px; text-align: center;">
              <a href="${siteUrl}/rep/quests" style="display: inline-block; background-color: ${accent}; color: #ffffff; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; padding: 14px 36px; border-radius: 6px; text-decoration: none;">
                View Quest
              </a>
            </td>
          </tr>
        `),
      };

    case "reward_unlocked":
      return {
        subject: "You've unlocked a reward!",
        html: wrap(`
          <tr>
            <td style="padding: 0 32px 8px; text-align: center;">
              <h1 style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 700; color: #111; letter-spacing: 1px;">
                Reward Unlocked
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #555;">
                ${firstName}, you've hit a milestone and unlocked a reward.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f3ff; border: 1px solid #e0d8f8; border-radius: 8px;">
                <tr>
                  <td style="padding: 24px; text-align: center;">
                    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 20px; font-weight: 700; color: #111; margin-bottom: 4px;">
                      ${escapeHtml(String(ctx.reward_name || "Reward"))}
                    </div>
                    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #555;">
                      ${escapeHtml(String(ctx.milestone_title || "Milestone achieved"))}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px; text-align: center;">
              <a href="${siteUrl}/rep/rewards" style="display: inline-block; background-color: ${accent}; color: #ffffff; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; padding: 14px 36px; border-radius: 6px; text-decoration: none;">
                Claim Reward
              </a>
            </td>
          </tr>
        `),
      };

    case "reward_fulfilled": {
      const rewardName = escapeHtml(String(ctx.reward_name || "Your reward"));
      const productDetails = ctx.product_name ? escapeHtml(String(ctx.product_name)) : null;
      const customValue = ctx.custom_value ? escapeHtml(String(ctx.custom_value)) : null;
      const fulfilmentNotes = ctx.notes ? escapeHtml(String(ctx.notes)) : null;
      return {
        subject: `Your reward is ready — ${rewardName}`,
        html: wrap(`
          <tr>
            <td style="padding: 0 32px 8px; text-align: center;">
              <h1 style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 700; color: #111; letter-spacing: 1px;">
                Reward Fulfilled
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #555;">
                ${firstName}, your reward has been processed and is ready for you.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px;">
                <tr>
                  <td style="padding: 24px; text-align: center;">
                    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 20px; font-weight: 700; color: #111; margin-bottom: 8px;">
                      ${rewardName}
                    </div>
                    ${productDetails ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #059669; margin-bottom: 4px;">Product: ${productDetails}</div>` : ""}
                    ${customValue ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #555; margin-bottom: 4px;">${customValue}</div>` : ""}
                    ${fulfilmentNotes ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #6b7280; margin-top: 8px; font-style: italic;">&ldquo;${fulfilmentNotes}&rdquo;</div>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px; text-align: center;">
              <a href="${siteUrl}/rep/rewards" style="display: inline-block; background-color: ${accent}; color: #ffffff; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; padding: 14px 36px; border-radius: 6px; text-decoration: none;">
                View Rewards
              </a>
            </td>
          </tr>
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
        html: wrap(`
          <tr>
            <td style="padding: 0 32px 8px; text-align: center;">
              <h1 style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 700; color: #111; letter-spacing: 1px;">
                Level Up
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #555;">
                ${firstName}, you've been promoted.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f3ff; border: 1px solid #e0d8f8; border-radius: 8px;">
                <tr>
                  <td style="padding: 24px; text-align: center;">
                    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #999; text-decoration: line-through; margin-bottom: 8px;">
                      Level ${oldLevel} &mdash; ${oldLevelName}
                    </div>
                    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 28px; font-weight: 800; color: ${accent}; letter-spacing: 1px;">
                      Level ${newLevel} &mdash; ${newLevelName}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px; text-align: center;">
              <a href="${siteUrl}/rep" style="display: inline-block; background-color: ${accent}; color: #ffffff; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; padding: 14px 36px; border-radius: 6px; text-decoration: none;">
                View Dashboard
              </a>
            </td>
          </tr>
        `),
      };
    }

    case "application_rejected":
      return {
        subject: `Update on your ${orgName} application`,
        html: wrap(`
          <tr>
            <td style="padding: 0 32px 8px; text-align: center;">
              <h1 style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 700; color: #111; letter-spacing: 1px;">
                Application Update
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 16px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #555;">
                Hey ${firstName}, thanks for your interest in joining the ${orgName} rep team.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 16px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #555;">
                After careful review, we&rsquo;re unable to bring you on board at this time. This doesn&rsquo;t mean the door is closed &mdash; we run new campaigns regularly and encourage you to apply again in the future.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #555;">
                Keep pushing. Keep creating.
              </p>
            </td>
          </tr>
        `),
      };

    case "sale_notification":
      return {
        subject: "Someone used your code!",
        html: wrap(`
          <tr>
            <td style="padding: 0 32px 8px; text-align: center;">
              <h1 style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 700; color: #111; letter-spacing: 1px;">
                Sale incoming!
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #555;">
                ${firstName}, someone just used your discount code to buy tickets.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f3ff; border: 1px solid #e0d8f8; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px;" width="50%" align="center">
                    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: ${accent}; margin-bottom: 6px;">
                      TICKETS
                    </div>
                    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 28px; font-weight: 700; color: #111;">
                      ${ctx.ticket_count || 0}
                    </div>
                  </td>
                  <td style="padding: 20px;" width="50%" align="center">
                    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: ${accent}; margin-bottom: 6px;">
                      REVENUE
                    </div>
                    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 28px; font-weight: 700; color: #111;">
                      &pound;${Number(ctx.order_total || 0).toFixed(2)}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px; text-align: center;">
              <a href="${siteUrl}/rep/" style="display: inline-block; background-color: ${accent}; color: #ffffff; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; padding: 14px 36px; border-radius: 6px; text-decoration: none;">
                View Dashboard
              </a>
            </td>
          </tr>
        `),
      };

    default:
      return { subject: `${orgName} Reps Update`, html: "" };
  }
}

// ─── Welcome Email Wrapper ──────────────────────────────────────────────────
// Special wrapper for the welcome email — "{ORG} PRESENTS" header, ENTRY purple
// branding, prominent "powered by ENTRY" footer.

function wrapWelcomeEmail(orgName: string, hasLogo: boolean, body: string): string {
  const headerHtml = hasLogo
    ? `<img src="cid:brand-logo" alt="${orgName}" height="36" style="height: 36px; width: auto; display: inline-block; margin-bottom: 12px;">
       <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: rgba(255,255,255,0.5);">PRESENTS</div>`
    : `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 20px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #fff;">${orgName}</div>
       <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-top: 4px;">PRESENTS</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; -webkit-font-smoothing: antialiased; color-scheme: light only;">
  <!-- Wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <!-- Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

          <!-- Purple Gradient Header -->
          <tr>
            <td style="height: 140px; padding: 0 32px; text-align: center; vertical-align: middle; background: linear-gradient(135deg, #7C3AED 0%, #8B5CF6 50%, #A78BFA 100%);">
              ${headerHtml}
            </td>
          </tr>

          <!-- Spacer -->
          <tr>
            <td style="height: 28px;"></td>
          </tr>

          <!-- Content -->
          ${body}

        </table>

        <!-- ENTRY Branded Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">
          <tr>
            <td style="padding: 24px 0 8px; text-align: center;">
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: #9ca3af; margin-bottom: 6px;">
                POWERED BY
              </div>
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 18px; font-weight: 800; letter-spacing: 4px; text-transform: uppercase;">
                <span style="color: #8B5CF6;">EN</span><span style="color: #A78BFA;">TRY</span>
              </div>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Email Wrapper ──────────────────────────────────────────────────────────

/**
 * Wrap email body in the branded layout.
 *
 * Matches the order confirmation email structure:
 * - Table-based layout for Outlook/Gmail compatibility
 * - Accent bar at top
 * - Dark header with CID-embedded logo (linear-gradient dark mode trick)
 * - Clean white content area
 * - "Powered by Entry" footer
 * - All styles inline
 *
 * Body content should be <tr>...</tr> rows (inserted into the content table).
 */
function wrapEmail(accent: string, orgName: string, hasLogo: boolean, body: string): string {
  const logoHtml = hasLogo
    ? `<img src="cid:brand-logo" alt="${orgName}" height="48" style="height: 48px; width: auto; display: inline-block;">`
    : `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #fff;">${orgName}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; -webkit-font-smoothing: antialiased; color-scheme: light only;">
  <!-- Wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <!-- Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <!-- Accent Bar -->
          <tr>
            <td style="height: 4px; background-color: ${accent};"></td>
          </tr>

          <!-- Dark Header — linear-gradient prevents dark mode inversion -->
          <tr>
            <td style="height: 120px; padding: 0 32px; text-align: center; vertical-align: middle; background-color: #0e0e0e; background-image: linear-gradient(#0e0e0e, #0e0e0e);">
              ${logoHtml}
            </td>
          </tr>

          <!-- Spacer -->
          <tr>
            <td style="height: 24px;"></td>
          </tr>

          <!-- Content -->
          ${body}

        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">
          <tr>
            <td style="padding: 16px 0; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #9ca3af; line-height: 1.6;">
                Powered by <span style="font-weight: 600; color: #6b7280;">Entry</span>
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}
