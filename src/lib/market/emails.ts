/**
 * Entry Market transactional emails.
 *
 * Two emails fire per claim lifecycle:
 *
 *   1. sendClaimConfirmation — fire-and-forget from the claim API
 *      immediately after claim_market_product_atomic + Shopify submit
 *      succeed. "We got your order, EP debited, here's what's next."
 *
 *   2. sendClaimDispatched — fire-and-forget from the supplier Shopify
 *      orders/fulfilled webhook. "Your order has shipped, here's tracking."
 *
 * Both use the platform Entry brand, NOT a tenant's branding — Entry
 * Market is a platform-only catalog and the customer relationship is
 * with Entry, not the rep's promoter.
 *
 * Idempotency: each helper writes its `*_email_sent_at` timestamp on
 * success and bails out early if already set. Webhook redeliveries are
 * safe.
 *
 * Resend key missing → graceful skip (logs, returns false). Never throws.
 *
 * Logo: rasterised by the existing /api/brand/logo-png edge route. We
 * embed it via cid: inline attachment so it renders even when the
 * recipient's client blocks remote images.
 */

import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

const ENTRY_ACCENT = "#8B5CF6";
const ENTRY_DARK = "#0e0e0e";
const ENTRY_FROM_EMAIL = "orders@mail.entry.events";
const ENTRY_FROM_NAME = "Entry";

const LOGO_FETCH_TIMEOUT_MS = 5_000;

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "") ||
    "https://admin.entry.events"
  ).replace(/\/$/, "");
}

/**
 * Fetch the rasterised Entry wordmark PNG (white-on-dark) for inline
 * CID embedding. 480×144 is large enough to look crisp at 240px wide
 * on retina, small enough to keep email size sub-50KB.
 */
async function fetchEntryLogoPng(): Promise<Buffer | null> {
  try {
    const url = `${getBaseUrl()}/api/brand/logo-png?variant=white&width=480&height=144`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOGO_FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Format a shipping address into a multi-line string, skipping empties.
 */
function formatAddress(addr: {
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postcode: string;
  country: string;
}): string {
  return [addr.line1, addr.line2, addr.city, addr.region, addr.postcode, addr.country]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join(", ");
}

interface EmailShellOpts {
  preheader: string;
  badge: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Optional metric-card block (highlighted figure + sub-label). */
  metric?: { label: string; value: string; sublabel?: string };
  /** Optional small detail rows beneath the body. */
  details?: { label: string; value: string }[];
  /** Optional final paragraph after metric/details (e.g. "We'll email you again when…"). */
  footnote?: string;
  /** Inline-CID logo reference. Falls back to a text wordmark if absent. */
  hasLogoAttachment: boolean;
}

/**
 * Shared dark-hero / white-content email shell. Mobile-first, system
 * fonts only, 520px max width. Tested against Apple Mail, Gmail web/iOS,
 * Outlook desktop/web — all render the table layout cleanly.
 */
function renderShell(opts: EmailShellOpts): string {
  const logoBlock = opts.hasLogoAttachment
    ? `<img src="cid:entry-logo" alt="entry" height="36" style="display:block;height:36px;width:auto;border:0;">`
    : `<span style="font-family:Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.04em;color:#ffffff;">entry</span>`;

  const metricBlock = opts.metric
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;margin:0 0 24px;">
            <tr><td style="border-left:3px solid ${ENTRY_ACCENT};padding:18px 20px;">
              <p style="margin:0 0 4px;font-family:'SF Mono',ui-monospace,'Roboto Mono',monospace;font-size:10px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#9ca3af;">${escapeHtml(opts.metric.label)}</p>
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:24px;font-weight:700;color:#111827;line-height:1.2;">${escapeHtml(opts.metric.value)}</p>
              ${opts.metric.sublabel ? `<p style="margin:6px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#6b7280;line-height:1.4;">${escapeHtml(opts.metric.sublabel)}</p>` : ""}
            </td></tr>
          </table>`
    : "";

  const detailsBlock = opts.details && opts.details.length > 0
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            ${opts.details.map((d) => `<tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#6b7280;width:35%;">${escapeHtml(d.label)}</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#111827;font-weight:600;text-align:right;">${escapeHtml(d.value)}</td>
            </tr>`).join("")}
          </table>`
    : "";

  const ctaBlock = opts.ctaLabel && opts.ctaUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr><td align="center">
              <a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background:${ENTRY_ACCENT};color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;letter-spacing:0.02em;text-decoration:none;padding:14px 32px;border-radius:8px;">${escapeHtml(opts.ctaLabel)}</a>
            </td></tr>
          </table>`
    : "";

  const footnoteBlock = opts.footnote
    ? `<p style="margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#9ca3af;line-height:1.5;">${escapeHtml(opts.footnote)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${escapeHtml(opts.heading)}</title>
  <style>@media (max-width:540px){.container{width:100%!important}.padded{padding:24px!important}}</style>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;color-scheme:light only;-webkit-font-smoothing:antialiased;">
  <div style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" class="container" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.04),0 8px 32px rgba(0,0,0,0.08);">
        <!-- DARK HERO -->
        <tr><td style="background:${ENTRY_DARK};padding:0;">
          <div style="height:3px;background:${ENTRY_ACCENT};"></div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:32px 32px 8px;">${logoBlock}</td></tr>
            <tr><td align="center" style="padding:18px 32px 0;">
              <span style="display:inline-block;background:rgba(139,92,246,0.18);color:#c4b5fd;font-family:'SF Mono',ui-monospace,'Roboto Mono',monospace;font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;padding:5px 12px;border-radius:999px;">${escapeHtml(opts.badge)}</span>
            </td></tr>
            <tr><td align="center" style="padding:14px 32px 32px;">
              <h1 style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;line-height:1.25;">${escapeHtml(opts.heading)}</h1>
            </td></tr>
          </table>
        </td></tr>
        <!-- WHITE CONTENT -->
        <tr><td class="padded" style="padding:32px;">
          <p style="margin:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;color:#374151;line-height:1.65;">${opts.body}</p>
          ${metricBlock}
          ${ctaBlock}
          ${detailsBlock}
          ${footnoteBlock}
        </td></tr>
        <!-- FOOTER -->
        <tr><td style="background:#fafafa;border-top:1px solid #f3f4f6;padding:20px 32px;text-align:center;">
          <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#6b7280;">Entry — the white-label events platform.</p>
          <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#9ca3af;">Need help? Reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ───────────────────────────── Confirmation ─────────────────────────────── */

export interface ClaimConfirmationParams {
  claimId: string;
  recipientEmail: string;
  recipientName: string;
  productTitle: string;
  variantTitle?: string | null;
  epSpent: number;
  shippingAddress: {
    line1: string;
    line2?: string | null;
    city: string;
    region?: string | null;
    postcode: string;
    country: string;
  };
  orderNumber?: string | null;
}

/**
 * Send the immediate post-claim "we got your order" email. Idempotent:
 * checks confirmation_email_sent_at and bails if already set.
 */
export async function sendClaimConfirmation(
  params: ClaimConfirmationParams,
): Promise<boolean> {
  const resend = getResendClient();
  if (!resend) {
    console.log("[market/email] RESEND_API_KEY not set — skipping confirmation");
    return false;
  }

  const db = await getSupabaseAdmin();
  if (!db) return false;

  const { data: existing } = await db
    .from("platform_market_claims")
    .select("confirmation_email_sent_at")
    .eq("id", params.claimId)
    .maybeSingle();
  if (existing?.confirmation_email_sent_at) {
    return false;
  }

  const subject = `Order confirmed — ${params.productTitle}`;
  const variantSuffix = params.variantTitle ? ` (${params.variantTitle})` : "";

  const details: { label: string; value: string }[] = [
    { label: "Item", value: `${params.productTitle}${variantSuffix}` },
    { label: "Paid with", value: `${params.epSpent.toLocaleString("en-GB")} EP` },
    { label: "Shipping to", value: formatAddress(params.shippingAddress) },
  ];
  if (params.orderNumber) {
    details.push({ label: "Order ref", value: params.orderNumber });
  }

  const logoPng = await fetchEntryLogoPng();

  const html = renderShell({
    preheader: `Your Entry Market order has been confirmed and is being prepared for dispatch.`,
    badge: "Order confirmed",
    heading: "We've got your order.",
    body: `Hi ${escapeHtml(params.recipientName.split(" ")[0] ?? params.recipientName)}, thanks for your order. Your <strong>${escapeHtml(params.productTitle)}</strong> is now being prepared for dispatch — we'll send tracking the moment it leaves the warehouse.`,
    metric: {
      label: "Paid",
      value: `${params.epSpent.toLocaleString("en-GB")} EP`,
      sublabel: "From your Entry rep balance",
    },
    details,
    footnote: "We'll email you again with tracking once your order has shipped. If anything looks off, reply to this email and we'll sort it.",
    hasLogoAttachment: Boolean(logoPng),
  });

  const text = [
    `Hi ${params.recipientName.split(" ")[0] ?? params.recipientName},`,
    "",
    `Thanks for your order. Your ${params.productTitle}${variantSuffix} is being prepared for dispatch.`,
    "",
    `Paid: ${params.epSpent.toLocaleString("en-GB")} EP`,
    `Shipping to: ${formatAddress(params.shippingAddress)}`,
    params.orderNumber ? `Order ref: ${params.orderNumber}` : "",
    "",
    "We'll email you again with tracking once your order has shipped.",
    "",
    "— Entry",
  ]
    .filter(Boolean)
    .join("\n");

  const attachments = logoPng
    ? [{ filename: "entry.png", content: logoPng, contentType: "image/png", contentId: "entry-logo" }]
    : undefined;

  try {
    const { error } = await resend.emails.send({
      from: `${ENTRY_FROM_NAME} <${ENTRY_FROM_EMAIL}>`,
      to: [params.recipientEmail],
      subject,
      html,
      text,
      ...(attachments ? { attachments } : {}),
    });
    if (error) {
      console.warn("[market/email] confirmation send failed:", error);
      Sentry.captureMessage("Market claim confirmation email failed", {
        level: "warning",
        extra: { claimId: params.claimId, error: JSON.stringify(error) },
      });
      return false;
    }

    await db
      .from("platform_market_claims")
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq("id", params.claimId);
    console.log(`[market/email] confirmation sent for claim ${params.claimId}`);
    return true;
  } catch (err) {
    console.error("[market/email] confirmation exception:", err);
    Sentry.captureException(err, { extra: { claimId: params.claimId, step: "confirmation" } });
    return false;
  }
}

/* ───────────────────────────── Dispatch ────────────────────────────────── */

export interface ClaimDispatchParams {
  claimId: string;
  recipientEmail: string;
  recipientName: string;
  productTitle: string;
  variantTitle?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  trackingCompany?: string | null;
  shippingAddress: {
    line1: string;
    line2?: string | null;
    city: string;
    region?: string | null;
    postcode: string;
    country: string;
  };
}

/**
 * Send the "your order has shipped" email. Idempotent — only sends once
 * per claim, even on webhook redeliveries.
 */
export async function sendClaimDispatched(
  params: ClaimDispatchParams,
): Promise<boolean> {
  const resend = getResendClient();
  if (!resend) {
    console.log("[market/email] RESEND_API_KEY not set — skipping dispatch");
    return false;
  }

  const db = await getSupabaseAdmin();
  if (!db) return false;

  const { data: existing } = await db
    .from("platform_market_claims")
    .select("dispatch_email_sent_at")
    .eq("id", params.claimId)
    .maybeSingle();
  if (existing?.dispatch_email_sent_at) {
    return false;
  }

  const subject = `On its way — ${params.productTitle}`;
  const variantSuffix = params.variantTitle ? ` (${params.variantTitle})` : "";

  const details: { label: string; value: string }[] = [
    { label: "Item", value: `${params.productTitle}${variantSuffix}` },
    { label: "Shipping to", value: formatAddress(params.shippingAddress) },
  ];
  if (params.trackingCompany) {
    details.push({ label: "Carrier", value: params.trackingCompany });
  }
  if (params.trackingNumber) {
    details.push({ label: "Tracking #", value: params.trackingNumber });
  }

  const logoPng = await fetchEntryLogoPng();

  const html = renderShell({
    preheader: params.trackingNumber
      ? `Tracking ${params.trackingNumber} — your Entry Market order has shipped.`
      : `Your Entry Market order has shipped.`,
    badge: "Dispatched",
    heading: "It's on its way.",
    body: `Hi ${escapeHtml(params.recipientName.split(" ")[0] ?? params.recipientName)}, your <strong>${escapeHtml(params.productTitle)}</strong> has just left the warehouse.`,
    ctaLabel: params.trackingUrl ? "Track your order" : undefined,
    ctaUrl: params.trackingUrl ?? undefined,
    details,
    footnote: "Delivery times depend on your carrier and location. If your order hasn't arrived within 10 working days, reply to this email and we'll chase it for you.",
    hasLogoAttachment: Boolean(logoPng),
  });

  const text = [
    `Hi ${params.recipientName.split(" ")[0] ?? params.recipientName},`,
    "",
    `Your ${params.productTitle}${variantSuffix} has shipped.`,
    "",
    params.trackingCompany ? `Carrier: ${params.trackingCompany}` : "",
    params.trackingNumber ? `Tracking number: ${params.trackingNumber}` : "",
    params.trackingUrl ? `Track here: ${params.trackingUrl}` : "",
    "",
    "Shipping to:",
    formatAddress(params.shippingAddress),
    "",
    "— Entry",
  ]
    .filter(Boolean)
    .join("\n");

  const attachments = logoPng
    ? [{ filename: "entry.png", content: logoPng, contentType: "image/png", contentId: "entry-logo" }]
    : undefined;

  try {
    const { error } = await resend.emails.send({
      from: `${ENTRY_FROM_NAME} <${ENTRY_FROM_EMAIL}>`,
      to: [params.recipientEmail],
      subject,
      html,
      text,
      ...(attachments ? { attachments } : {}),
    });
    if (error) {
      console.warn("[market/email] dispatch send failed:", error);
      Sentry.captureMessage("Market claim dispatch email failed", {
        level: "warning",
        extra: { claimId: params.claimId, error: JSON.stringify(error) },
      });
      return false;
    }

    await db
      .from("platform_market_claims")
      .update({ dispatch_email_sent_at: new Date().toISOString() })
      .eq("id", params.claimId);
    console.log(`[market/email] dispatch sent for claim ${params.claimId}`);
    return true;
  } catch (err) {
    console.error("[market/email] dispatch exception:", err);
    Sentry.captureException(err, { extra: { claimId: params.claimId, step: "dispatch" } });
    return false;
  }
}
