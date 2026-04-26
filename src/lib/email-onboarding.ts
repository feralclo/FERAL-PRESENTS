/**
 * Onboarding-related transactional emails.
 *
 * Lighter-weight than the order confirmation pipeline — these are short,
 * branded notifications fired once per tenant. Kept separate from email.ts
 * so the order/cart/announcement flows aren't muddied with onboarding logic.
 */

import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, brandingKey } from "@/lib/constants";
import type { BrandingSettings } from "@/types/settings";
import { escapeHtml } from "@/lib/email-templates";

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

interface BrandSnapshot {
  org_name: string;
  accent: string;
  logo_url?: string;
}

async function fetchBrand(orgId: string): Promise<BrandSnapshot> {
  const fallback: BrandSnapshot = { org_name: orgId, accent: "#8B5CF6" };
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return fallback;
    const { data } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", brandingKey(orgId))
      .maybeSingle();
    const branding = (data?.data ?? {}) as BrandingSettings;
    return {
      org_name: branding.org_name || orgId,
      accent: branding.accent_color || "#8B5CF6",
      logo_url: branding.logo_url,
    };
  } catch {
    return fallback;
  }
}

interface FromAddress {
  from_email: string;
  from_name: string;
}

async function fetchFromAddress(orgId: string): Promise<FromAddress> {
  const fallback: FromAddress = {
    from_email: `${orgId}@mail.entry.events`,
    from_name: "Entry",
  };
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return fallback;
    const { data } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", `${orgId}_email`)
      .maybeSingle();
    const settings = (data?.data ?? {}) as { from_email?: string; from_name?: string };
    return {
      from_email: settings.from_email || fallback.from_email,
      from_name: settings.from_name || fallback.from_name,
    };
  } catch {
    return fallback;
  }
}

function shellHtml(opts: {
  brand: BrandSnapshot;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  preheader?: string;
}): string {
  const logoBlock = opts.brand.logo_url
    ? `<img src="${escapeHtml(opts.brand.logo_url)}" alt="${escapeHtml(opts.brand.org_name)}" style="max-height:48px;height:auto;width:auto;display:block;margin:0 auto 24px;"/>`
    : `<div style="font-family:'Space Mono',monospace;font-size:18px;font-weight:700;color:#fff;letter-spacing:0.06em;text-align:center;margin:0 auto 24px;">${escapeHtml(opts.brand.org_name.toUpperCase())}</div>`;

  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;color:transparent;">${escapeHtml(opts.preheader)}</div>`
    : "";

  const ctaBlock = opts.cta
    ? `<table role="presentation" style="margin:32px auto 0;"><tr><td style="background:${escapeHtml(opts.brand.accent)};border-radius:8px;"><a href="${escapeHtml(opts.cta.url)}" style="display:inline-block;padding:14px 28px;color:#fff;font-family:Inter,Helvetica,Arial,sans-serif;font-weight:600;font-size:15px;text-decoration:none;">${escapeHtml(opts.cta.label)}</a></td></tr></table>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:#0e0e0e;font-family:Inter,Helvetica,Arial,sans-serif;color:#ffffff;">
${preheader}
<table role="presentation" width="100%" style="background:#0e0e0e;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" width="560" style="max-width:560px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;padding:40px 32px;">
      <tr><td>
        ${logoBlock}
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;line-height:1.3;color:#ffffff;">${escapeHtml(opts.heading)}</h1>
        <div style="font-size:15px;line-height:1.6;color:rgba(255,255,255,0.78);">${opts.bodyHtml}</div>
        ${ctaBlock}
      </td></tr>
    </table>
    <div style="margin-top:24px;font-size:12px;color:rgba(255,255,255,0.4);">Sent by Entry · the platform behind ${escapeHtml(opts.brand.org_name)}</div>
  </td></tr>
</table>
</body></html>`;
}

/* ─────────────────────────────────────────────────────────────────────
   Domain verified — sent from the verify-poll cron when DNS flips green
   ───────────────────────────────────────────────────────────────────── */

export async function sendDomainVerifiedEmail(params: {
  orgId: string;
  toEmail: string;
  hostname: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const resend = getResendClient();
  if (!resend) return { sent: false, reason: "RESEND_API_KEY not configured" };

  const brand = await fetchBrand(params.orgId);
  const fromAddr = await fetchFromAddress(params.orgId);
  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://entry.events"}/admin/settings/domains/`;

  const html = shellHtml({
    brand,
    heading: "Your domain is live",
    bodyHtml: `
      <p style="margin:0 0 12px;"><strong style="color:#fff;">${escapeHtml(params.hostname)}</strong> is now connected to ${escapeHtml(brand.org_name)} on Entry.</p>
      <p style="margin:0 0 12px;">Visitors who type your domain will land on your storefront. Existing event links keep working too.</p>
      <p style="margin:0;">Nothing else to do — you're all set.</p>
    `,
    cta: { label: "Go to dashboard", url: dashboardUrl },
    preheader: `${params.hostname} is now connected to ${brand.org_name}`,
  });

  try {
    const { error } = await resend.emails.send({
      from: `${fromAddr.from_name} <${fromAddr.from_email}>`,
      to: [params.toEmail],
      subject: `${params.hostname} is live`,
      html,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "send failed" };
  }
}

/* ─────────────────────────────────────────────────────────────────────
   Welcome email — sent at the wizard's finish line
   ───────────────────────────────────────────────────────────────────── */

export interface WelcomeEmailContext {
  orgId: string;
  toEmail: string;
  /** First name to greet by — falls back to "there". */
  firstName?: string;
  /** Outstanding setup items to nudge in the email */
  outstanding?: {
    stripe?: boolean;
    domain?: boolean;
  };
}

export async function sendWelcomeEmail(ctx: WelcomeEmailContext): Promise<{ sent: boolean; reason?: string }> {
  const resend = getResendClient();
  if (!resend) return { sent: false, reason: "RESEND_API_KEY not configured" };

  const brand = await fetchBrand(ctx.orgId);
  const fromAddr = await fetchFromAddress(ctx.orgId);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://entry.events";
  const dashboardUrl = `${siteUrl}/admin/`;
  const greet = ctx.firstName ? escapeHtml(ctx.firstName) : "there";

  const nextSteps: string[] = [
    `<li>Open the dashboard to see your setup checklist — Stripe, your first event, your team</li>`,
  ];
  if (ctx.outstanding?.stripe) {
    nextSteps.unshift(
      `<li>Connect Stripe so you can take card payments — <a href="${siteUrl}/admin/payments/" style="color:${escapeHtml(brand.accent)};">set it up here</a></li>`
    );
  }
  if (ctx.outstanding?.domain) {
    nextSteps.push(
      `<li>We're checking your custom domain — we'll email you the moment it's live</li>`
    );
  }

  const html = shellHtml({
    brand,
    heading: `Welcome to Entry, ${greet}`,
    bodyHtml: `
      <p style="margin:0 0 12px;">${escapeHtml(brand.org_name)} is live on Entry.</p>
      <p style="margin:16px 0 8px;font-weight:600;color:#fff;">What to do next</p>
      <ul style="padding-left:20px;margin:0 0 12px;color:rgba(255,255,255,0.78);">${nextSteps.join("")}</ul>
    `,
    cta: { label: "Open dashboard", url: dashboardUrl },
    preheader: `${brand.org_name} is live on Entry`,
  });

  try {
    const { error } = await resend.emails.send({
      from: `${fromAddr.from_name} <${fromAddr.from_email}>`,
      to: [ctx.toEmail],
      subject: `Welcome to Entry, ${greet}`,
      html,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "send failed" };
  }
}
