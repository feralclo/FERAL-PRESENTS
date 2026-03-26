import crypto from "crypto";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, vatKey } from "@/lib/constants";
import { guestListSettingsKey } from "@/lib/constants";
import { createOrder } from "@/lib/orders";
import { calculateCheckoutVat, DEFAULT_VAT_SETTINGS } from "@/lib/vat";
import type { VatSettings } from "@/types/settings";
import type { AccessLevel, GuestListEntry } from "@/types/orders";
import type { EmailSettings } from "@/types/email";
import { DEFAULT_EMAIL_SETTINGS } from "@/types/email";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ACCESS_LEVELS: Record<
  AccessLevel,
  { label: string; shortLabel: string; ticketLabel: string }
> = {
  guest_list: { label: "Guest List", shortLabel: "Guest", ticketLabel: "Guest List — General" },
  vip: { label: "VIP", shortLabel: "VIP", ticketLabel: "Guest List — VIP" },
  backstage: { label: "Backstage", shortLabel: "Backstage", ticketLabel: "Guest List — Backstage" },
  aaa: { label: "AAA", shortLabel: "AAA", ticketLabel: "Guest List — AAA" },
  artist: { label: "Artist", shortLabel: "Artist", ticketLabel: "Guest List — Artist" },
};

export type { AccessLevel };

// ---------------------------------------------------------------------------
// CID Logo Embedding (same pattern as rep-emails.ts)
// ---------------------------------------------------------------------------

interface CidAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  contentId: string;
}

async function fetchLogoBase64(
  logoUrl: string | null,
  orgId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<string | null> {
  if (!logoUrl) return null;
  const m = logoUrl.match(/\/api\/media\/(.+?)(?:\?.*)?$/);
  if (!m) return null;
  const mediaKey = m[1];

  try {
    const { data: row } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", `media_${mediaKey}`)
      .single();
    const d = row?.data as { image?: string } | null;
    if (d?.image) return d.image;
  } catch { /* not found */ }

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

async function resolveLogoCid(
  brandingLogoUrl: string | null,
  orgId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<CidAttachment | null> {
  let base64 = await fetchLogoBase64(brandingLogoUrl, orgId, supabase);

  // Fallback: try email settings logo
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * Resolve the tenant-facing base URL for an org.
 * Prefers the org's active primary domain, falls back to NEXT_PUBLIC_SITE_URL.
 */
async function resolveTenantUrl(
  orgId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<string> {
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

/**
 * Split a full name into first and last name.
 * If only one word, last name is empty string.
 */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  const lastName = parts.pop()!;
  return { firstName: parts.join(" "), lastName };
}

/** Format a date for display in emails. */
function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/** Resolve relative URL to absolute (for email logo). */
function resolveLogoUrl(url: string): string {
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  ).replace(/\/$/, "");
  return `${siteUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Format time for display. */
function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Guest list settings
// ---------------------------------------------------------------------------

export interface GuestListSettings {
  auto_approve: boolean;
  auto_approve_submissions: boolean;
}

const DEFAULT_GUEST_LIST_SETTINGS: GuestListSettings = {
  auto_approve: true,
  auto_approve_submissions: false,
};

export async function getGuestListSettings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string
): Promise<GuestListSettings> {
  const { data } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("data")
    .eq("key", guestListSettingsKey(orgId))
    .single();

  return {
    ...DEFAULT_GUEST_LIST_SETTINGS,
    ...((data?.data as Partial<GuestListSettings>) || {}),
  };
}

// ---------------------------------------------------------------------------
// Ensure hidden ticket type for guest list access level
// ---------------------------------------------------------------------------

/**
 * Ensure a hidden "Guest List" (or "Guest List — VIP" etc.) ticket type
 * exists for the given event. Returns the ticket type ID.
 *
 * Follows the same pattern as ensureMerchPassTicketType() in merch-orders.ts.
 */
export async function ensureGuestListTicketType(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  eventId: string,
  accessLevel: AccessLevel
): Promise<string> {
  const ticketTypeName = ACCESS_LEVELS[accessLevel].ticketLabel;

  // Check if one already exists
  const { data: existing } = await supabase
    .from(TABLES.TICKET_TYPES)
    .select("id, status")
    .eq("org_id", orgId)
    .eq("event_id", eventId)
    .eq("name", ticketTypeName)
    .limit(1)
    .single();

  if (existing) {
    // If it was accidentally un-hidden, restore it
    if (existing.status !== "hidden") {
      await supabase
        .from(TABLES.TICKET_TYPES)
        .update({ status: "hidden", sort_order: 9998, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
    return existing.id;
  }

  // Create the hidden ticket type
  const { data: created, error } = await supabase
    .from(TABLES.TICKET_TYPES)
    .insert({
      org_id: orgId,
      event_id: eventId,
      name: ticketTypeName,
      price: 0,
      capacity: null, // Unlimited
      sold: 0,
      status: "hidden",
      sort_order: 9998,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`Failed to create guest list ticket type: ${error?.message}`);
  }

  return created.id;
}

// ---------------------------------------------------------------------------
// Issue ticket for approved guest
// ---------------------------------------------------------------------------

interface IssueTicketEvent {
  id: string;
  name: string;
  slug?: string;
  currency?: string;
  venue_name?: string;
  date_start?: string;
  doors_time?: string;
}

/**
 * Issue a real ticket for an approved guest list entry.
 * Creates an order + tickets via createOrder(), sends confirmation email.
 */
export async function issueGuestListTicket(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  guest: GuestListEntry,
  event: IssueTicketEvent,
  approvedBy: string = "admin"
): Promise<{ orderId: string; ticketIds: string[] }> {
  if (!guest.email) {
    throw new Error("Cannot issue ticket: guest has no email address");
  }

  // Get or create hidden ticket type for this access level
  const ticketTypeId = await ensureGuestListTicketType(
    supabase,
    orgId,
    event.id,
    guest.access_level
  );

  const { firstName, lastName } = splitName(guest.name);

  // Create order via shared createOrder() — this generates tickets, sends email
  // For paid applications, pass the actual payment amount so the order total
  // reflects what was charged (hidden ticket types have price=0).
  const totalCharged = guest.payment_amount && guest.payment_amount > 0
    ? guest.payment_amount / 100 // Convert from pence to pounds (major currency units)
    : undefined;

  // Calculate VAT for paid guest list applications (same logic as payment-intent route)
  let vatInfo: { amount: number; rate: number; inclusive: boolean; vat_number?: string } | undefined;
  if (totalCharged != null && totalCharged > 0) {
    try {
      // Check event-level VAT override first, then fall back to org-level
      const eventRow = await supabase
        .from(TABLES.EVENTS)
        .select("vat_registered, vat_rate, vat_prices_include, vat_number")
        .eq("id", event.id)
        .single();
      const evt = eventRow.data;

      let vatSettings: VatSettings | null = null;
      if (evt?.vat_registered === true) {
        vatSettings = {
          vat_registered: true,
          vat_number: evt.vat_number || "",
          vat_rate: evt.vat_rate ?? 20,
          prices_include_vat: evt.vat_prices_include ?? true,
        };
      } else if (evt?.vat_registered == null) {
        // Fall back to org-level
        const { data: vatRow } = await supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", vatKey(orgId))
          .single();
        if (vatRow?.data) {
          vatSettings = { ...DEFAULT_VAT_SETTINGS, ...(vatRow.data as Partial<VatSettings>) };
        }
      }

      if (vatSettings?.vat_registered) {
        const breakdown = calculateCheckoutVat(totalCharged, vatSettings);
        if (breakdown && breakdown.vat > 0) {
          vatInfo = {
            amount: breakdown.vat,
            rate: vatSettings.vat_rate,
            inclusive: vatSettings.prices_include_vat,
            vat_number: vatSettings.vat_number || undefined,
          };
        }
      }
    } catch { /* VAT is non-critical — order still creates without it */ }
  }

  const result = await createOrder({
    supabase,
    orgId,
    event,
    items: [{ ticket_type_id: ticketTypeId, qty: guest.qty }],
    customer: {
      email: guest.email!,
      first_name: firstName,
      last_name: lastName,
      phone: guest.phone || undefined,
    },
    payment: {
      method: "guest_list",
      ref: `GUEST-LIST-${guest.id}`,
      ...(totalCharged != null ? { totalCharged } : {}),
    },
    vat: vatInfo,
    sendEmail: true,
    extraMetadata: guest.submitted_by ? { invited_by: guest.submitted_by } : undefined,
  });

  // Update guest list entry with order reference
  // Note: ticket_id is left null — we use order_id as the reference.
  // The order → tickets relationship provides the full chain.
  await supabase
    .from(TABLES.GUEST_LIST)
    .update({
      order_id: result.order.id,
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
    })
    .eq("id", guest.id)
    .eq("org_id", orgId);

  return {
    orderId: result.order.id,
    ticketIds: result.tickets.map((t) => t.ticket_code),
  };
}

// ---------------------------------------------------------------------------
// Guest list invitation email
// ---------------------------------------------------------------------------

/**
 * Send a guest list invitation email. Fire-and-forget — never throws.
 *
 * Tenant-branded: uses org branding (logo, accent color, name).
 * Copy: nonchalant, professional — "You're on the list".
 */
export async function sendGuestListInviteEmail(params: {
  orgId: string;
  guestName: string;
  guestEmail: string;
  inviteToken: string;
  eventName: string;
  eventDate?: string;
  eventTime?: string;
  venueName?: string;
  accessLevel: AccessLevel;
  addedBy?: string;
}): Promise<void> {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.log("[guest-list-email] RESEND_API_KEY not configured — skipping");
      return;
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) return;

    // Fetch branding + email settings
    const [{ data: brandingRow }, { data: emailRow }] = await Promise.all([
      supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", `${params.orgId}_branding`)
        .single(),
      supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", `${params.orgId}_email`)
        .single(),
    ]);

    const emailSettings: EmailSettings = {
      ...DEFAULT_EMAIL_SETTINGS,
      from_email: `${params.orgId}@mail.entry.events`,
      ...((emailRow?.data as Partial<EmailSettings>) || {}),
    };

    const branding = (brandingRow?.data as Record<string, string>) || {};
    const orgName = escapeHtml(branding.org_name || params.orgId.toUpperCase());
    const accentColor = branding.accent_color || "#7C3AED";

    // Resolve logo URL (same approach as order confirmation — direct URL, not CID)
    const emailLogo = (emailRow?.data as Record<string, string>)?.logo_url || branding.logo_url || null;
    const logoUrl = emailLogo ? resolveLogoUrl(emailLogo) : null;

    // Email settings for logo dimensions
    const logoHeight = Math.min(
      ((emailRow?.data as Record<string, number>)?.logo_height || 48),
      100
    );

    // Resolve tenant URL for RSVP link
    const tenantUrl = await resolveTenantUrl(params.orgId, supabase);
    const rsvpUrl = `${tenantUrl}/guest-list/rsvp/${encodeURIComponent(params.inviteToken)}`;

    const firstName = params.guestName.split(/\s+/)[0];
    const eventName = escapeHtml(params.eventName);
    const venueLine = params.venueName ? escapeHtml(params.venueName) : "";
    const dateLine = params.eventDate ? formatDate(params.eventDate) : "";
    const timeLine = params.eventTime ? formatTime(params.eventTime) : "";

    const accessLabel = ACCESS_LEVELS[params.accessLevel].label;
    const showAccessLevel = params.accessLevel !== "guest_list";

    // Nonchalant, professional subject
    const subject = `You're on the list — ${params.eventName}`;

    // Event details line (same format as order confirmation)
    const eventDetailsLine = [dateLine, venueLine].filter(Boolean).join(" · ");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; -webkit-font-smoothing: antialiased; color-scheme: light only;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <!-- Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <!-- Accent Bar -->
          <tr>
            <td style="height: 4px; background-color: ${accentColor};"></td>
          </tr>

          <!-- Header (dark bg with logo — matches order confirmation) -->
          <tr>
            <td style="height: 120px; padding: 0 32px; text-align: center; vertical-align: middle;${logoUrl ? " background-color: #0e0e0e; background-image: linear-gradient(#0e0e0e, #0e0e0e);" : ""}">
              ${
                logoUrl
                  ? `<img src="${escapeHtml(logoUrl)}" alt="${orgName}" height="${logoHeight}" style="width: auto; height: ${logoHeight}px; display: inline-block;">`
                  : `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #111;">${orgName}</div>`
              }
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding: 20px 32px 8px; text-align: center;">
              <h1 style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 24px; font-weight: 700; color: #111;">
                You're on the list.
              </h1>
            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #555;">
                ${params.addedBy && params.addedBy !== "admin"
                  ? `${escapeHtml(params.addedBy)} has added you to the guest list for ${eventName}.`
                  : `${escapeHtml(firstName)}, you've been added to the guest list for ${eventName}.`}
                <br>Your spot has been reserved — confirm below to receive your ticket. Unconfirmed spots may be released.
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;"><div style="height: 1px; background-color: #eee;"></div></td>
          </tr>

          <!-- Event Details -->
          <tr>
            <td style="padding: 24px 32px;">
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #999; margin-bottom: 8px;">EVENT</div>
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 17px; font-weight: 600; color: #111; margin-bottom: 4px;">${eventName}</div>
              ${eventDetailsLine ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #555;">${escapeHtml(eventDetailsLine)}</div>` : ""}
              ${timeLine ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #888; margin-top: 2px;">Doors ${timeLine}</div>` : ""}
              ${showAccessLevel ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: ${accentColor}; margin-top: 10px;">${escapeHtml(accessLabel)}</div>` : ""}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;"><div style="height: 1px; background-color: #eee;"></div></td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding: 28px 32px; text-align: center;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="background-color: ${accentColor}; border-radius: 6px;">
                    <a href="${rsvpUrl}" style="display: inline-block; padding: 14px 40px; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; letter-spacing: 0.3px;">Confirm attendance</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Fine print -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <p style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #aaa; margin: 0; text-align: center;">
                If you didn't expect this, you can safely ignore it.
              </p>
            </td>
          </tr>

        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">
          <tr>
            <td style="padding: 16px 32px 0; text-align: center;">
              <p style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #aaa; margin: 0;">Sent by <span style="color: ${accentColor}; font-weight: 600;">${orgName}</span></p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

    await resend.emails.send({
      from: `${branding.org_name || "Entry"} <${emailSettings.from_email}>`,
      to: [params.guestEmail],
      subject,
      html,
    });

    console.log(`[guest-list-email] Invite sent to ${params.guestEmail} for ${params.eventName}`);
  } catch (err) {
    console.error("[guest-list-email] Failed to send invite:", err);
  }
}

// ---------------------------------------------------------------------------
// Submission token
// ---------------------------------------------------------------------------

/** Generate a crypto-random URL-safe token for DJ submission links. */
export function generateSubmissionToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

// ---------------------------------------------------------------------------
// Submission link email (sent to artist/DJ)
// ---------------------------------------------------------------------------

/**
 * Send a submission link email to an artist. Fire-and-forget — never throws.
 * Same branded design as the guest list invitation email.
 */
export async function sendSubmissionLinkEmail(params: {
  orgId: string;
  artistName: string;
  artistEmail: string;
  submissionUrl: string;
  eventName: string;
  eventDate?: string;
  eventTime?: string;
  venueName?: string;
  quotas?: Partial<Record<AccessLevel, number | null>>;
}): Promise<void> {
  try {
    const resend = getResendClient();
    if (!resend) return;

    const supabase = await getSupabaseAdmin();
    if (!supabase) return;

    const [{ data: brandingRow }, { data: emailRow }] = await Promise.all([
      supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", `${params.orgId}_branding`).single(),
      supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", `${params.orgId}_email`).single(),
    ]);

    const emailSettings: EmailSettings = {
      ...DEFAULT_EMAIL_SETTINGS,
      from_email: `${params.orgId}@mail.entry.events`,
      ...((emailRow?.data as Partial<EmailSettings>) || {}),
    };

    const branding = (brandingRow?.data as Record<string, string>) || {};
    const orgName = escapeHtml(branding.org_name || params.orgId.toUpperCase());
    const accentColor = branding.accent_color || "#7C3AED";
    const emailLogo = (emailRow?.data as Record<string, string>)?.logo_url || branding.logo_url || null;
    const logoUrl = emailLogo ? resolveLogoUrl(emailLogo) : null;
    const logoHeight = Math.min(((emailRow?.data as Record<string, number>)?.logo_height || 48), 100);

    const firstName = params.artistName.split(/\s+/)[0];
    const eventName = escapeHtml(params.eventName);
    const dateLine = params.eventDate ? formatDate(params.eventDate) : "";
    const timeLine = params.eventTime ? formatTime(params.eventTime) : "";
    const venueLine = params.venueName ? escapeHtml(params.venueName) : "";
    const eventDetailsLine = [dateLine, venueLine].filter(Boolean).join(" · ");

    const subject = `Submit your guest list — ${params.eventName}`;

    // Build quota allocation rows (only for quotas that are set and > 0)
    const quotaLabels: Record<AccessLevel, string> = {
      guest_list: "Guest List",
      vip: "VIP",
      backstage: "Backstage",
      aaa: "AAA",
      artist: "Artist",
    };
    const quotaEntries: { label: string; count: number }[] = [];
    if (params.quotas) {
      for (const [level, count] of Object.entries(params.quotas)) {
        if (count != null && count > 0) {
          quotaEntries.push({ label: quotaLabels[level as AccessLevel] || level, count });
        }
      }
    }

    const totalSpots = quotaEntries.reduce((sum, q) => sum + q.count, 0);

    // Build quota HTML block
    const quotaHtml = quotaEntries.length > 0
      ? `<!-- Allocation -->
          <tr>
            <td style="padding: 24px 32px 0;">
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #999; margin-bottom: 12px;">YOUR ALLOCATION</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${quotaEntries.map((q) => `<tr>
                  <td style="padding: 6px 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9f9fb; border-radius: 8px;">
                      <tr>
                        <td style="padding: 12px 16px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; color: #111;">${q.label}</td>
                              <td align="right" style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 700; color: ${accentColor};">${q.count} ${q.count === 1 ? "spot" : "spots"}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`).join("")}
                ${totalSpots > 0 ? `<tr>
                  <td style="padding: 8px 0 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #999;">Total</td>
                        <td align="right" style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 600; color: #555;">${totalSpots} ${totalSpots === 1 ? "guest" : "guests"}</td>
                      </tr>
                    </table>
                  </td>
                </tr>` : ""}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px 0;"><div style="height: 1px; background-color: #eee;"></div></td>
          </tr>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; -webkit-font-smoothing: antialiased; color-scheme: light only;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <!-- Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <!-- Accent Bar -->
          <tr>
            <td style="height: 4px; background-color: ${accentColor};"></td>
          </tr>

          <!-- Header (dark bg with logo) -->
          <tr>
            <td style="height: 120px; padding: 0 32px; text-align: center; vertical-align: middle;${logoUrl ? " background-color: #0e0e0e; background-image: linear-gradient(#0e0e0e, #0e0e0e);" : ""}">
              ${
                logoUrl
                  ? `<img src="${escapeHtml(logoUrl)}" alt="${orgName}" height="${logoHeight}" style="width: auto; height: ${logoHeight}px; display: inline-block;">`
                  : `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #111;">${orgName}</div>`
              }
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding: 24px 32px 8px; text-align: center;">
              <h1 style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 24px; font-weight: 700; color: #111;">
                Submit your guest list.
              </h1>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="padding: 0 32px 20px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #555;">
                ${escapeHtml(firstName)}, you've been allocated guest list spots for <strong style="color: #111;">${eventName}</strong>. Submit the names of your guests using the link below — the promoter will review and confirm each one.
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;"><div style="height: 1px; background-color: #eee;"></div></td>
          </tr>

          <!-- Event Details -->
          <tr>
            <td style="padding: 20px 32px 0;">
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #999; margin-bottom: 8px;">EVENT</div>
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 17px; font-weight: 600; color: #111; margin-bottom: 4px;">${eventName}</div>
              ${eventDetailsLine ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #555;">${escapeHtml(eventDetailsLine)}</div>` : ""}
              ${timeLine ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #888; margin-top: 2px;">Doors ${timeLine}</div>` : ""}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 20px 32px 0;"><div style="height: 1px; background-color: #eee;"></div></td>
          </tr>

          ${quotaHtml}

          <!-- How it works -->
          <tr>
            <td style="padding: 24px 32px 0;">
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #999; margin-bottom: 14px;">HOW IT WORKS</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 0 0 12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width: 28px; vertical-align: top;">
                          <div style="width: 22px; height: 22px; border-radius: 50%; background-color: ${accentColor}; text-align: center; line-height: 22px; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 700; color: #fff;">1</div>
                        </td>
                        <td style="padding-left: 8px; vertical-align: top;">
                          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; color: #111; line-height: 22px;">Click the link below</div>
                          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #888; margin-top: 2px;">Opens a form where you can add names and emails.</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 0 12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width: 28px; vertical-align: top;">
                          <div style="width: 22px; height: 22px; border-radius: 50%; background-color: ${accentColor}; text-align: center; line-height: 22px; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 700; color: #fff;">2</div>
                        </td>
                        <td style="padding-left: 8px; vertical-align: top;">
                          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; color: #111; line-height: 22px;">Add your guests</div>
                          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #888; margin-top: 2px;">Enter each person's name and select their access level.</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width: 28px; vertical-align: top;">
                          <div style="width: 22px; height: 22px; border-radius: 50%; background-color: ${accentColor}; text-align: center; line-height: 22px; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 700; color: #fff;">3</div>
                        </td>
                        <td style="padding-left: 8px; vertical-align: top;">
                          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; color: #111; line-height: 22px;">We'll handle the rest</div>
                          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #888; margin-top: 2px;">Each guest is reviewed and sent their own ticket with a QR code.</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 24px 32px 0;"><div style="height: 1px; background-color: #eee;"></div></td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding: 28px 32px 0; text-align: center;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="background-color: ${accentColor}; border-radius: 6px;">
                    <a href="${escapeHtml(params.submissionUrl)}" style="display: inline-block; padding: 14px 48px; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; letter-spacing: 0.3px;">Submit guest list</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Artist access note -->
          <tr>
            <td style="padding: 24px 32px 24px;">
              <div style="background-color: #f9f9fb; border-radius: 8px; padding: 14px 16px;">
                <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #888; text-align: center;">
                  <strong style="color: #666;">Note:</strong> This is for your personal guests only. Your own artist access and crew credentials are arranged separately by your artist liaison.
                </p>
              </div>
            </td>
          </tr>

        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">
          <tr>
            <td style="padding: 16px 32px 0; text-align: center;">
              <p style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #aaa; margin: 0;">Sent by <span style="color: ${accentColor}; font-weight: 600;">${orgName}</span></p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

    await resend.emails.send({
      from: `${branding.org_name || "Entry"} <${emailSettings.from_email}>`,
      to: [params.artistEmail],
      subject,
      html,
    });

    console.log(`[guest-list-email] Submission link sent to ${params.artistEmail}`);
  } catch (err) {
    console.error("[guest-list-email] Failed to send submission link:", err);
  }
}

// ---------------------------------------------------------------------------
// Application acceptance email
// ---------------------------------------------------------------------------

/**
 * Send an acceptance email to an applicant. Fire-and-forget — never throws.
 * Free: "Confirm your spot" → /guest-list/accept/[token]
 * Paid: "Pay £X & confirm" → same link (page handles payment)
 */
export async function sendApplicationAcceptanceEmail(params: {
  orgId: string;
  guestName: string;
  guestEmail: string;
  inviteToken: string;
  eventName: string;
  eventDate?: string;
  eventTime?: string;
  venueName?: string;
  accessLevel: AccessLevel;
  paymentAmount: number;
  currency: string;
}): Promise<void> {
  try {
    const resend = getResendClient();
    if (!resend) return;

    const supabase = await getSupabaseAdmin();
    if (!supabase) return;

    const [{ data: brandingRow }, { data: emailRow }] = await Promise.all([
      supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", `${params.orgId}_branding`).single(),
      supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", `${params.orgId}_email`).single(),
    ]);

    const emailSettings: EmailSettings = {
      ...DEFAULT_EMAIL_SETTINGS,
      from_email: `${params.orgId}@mail.entry.events`,
      ...((emailRow?.data as Partial<EmailSettings>) || {}),
    };

    const branding = (brandingRow?.data as Record<string, string>) || {};
    const orgName = escapeHtml(branding.org_name || params.orgId.toUpperCase());
    const accentColor = branding.accent_color || "#7C3AED";
    const emailLogo = (emailRow?.data as Record<string, string>)?.logo_url || branding.logo_url || null;
    const logoUrl = emailLogo ? resolveLogoUrl(emailLogo) : null;
    const logoHeight = Math.min(((emailRow?.data as Record<string, number>)?.logo_height || 48), 100);

    const tenantUrl = await resolveTenantUrl(params.orgId, supabase);
    const acceptUrl = `${tenantUrl}/guest-list/accept/${encodeURIComponent(params.inviteToken)}`;

    const firstName = escapeHtml(params.guestName.split(/\s+/)[0]);
    const eventName = escapeHtml(params.eventName);
    const dateLine = params.eventDate ? formatDate(params.eventDate) : "";
    const venueLine = params.venueName ? escapeHtml(params.venueName) : "";
    const eventDetailsLine = [dateLine, venueLine].filter(Boolean).join(" · ");

    const isPaid = params.paymentAmount > 0;
    const { getCurrencySymbol } = await import("@/lib/stripe/config");
    const symbol = getCurrencySymbol(params.currency);
    const priceDisplay = isPaid ? `${symbol}${(params.paymentAmount / 100).toFixed(2)}` : "";

    const subject = `You've been accepted — ${params.eventName}`;
    const ctaText = "Confirm your spot";
    const bodyText = `${firstName}, you've been accepted to the guest list for ${eventName}. Your spot has been reserved — complete your booking to secure your ticket. Unconfirmed spots may be released.`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          <tr><td style="height: 4px; background-color: ${accentColor};"></td></tr>
          <tr>
            <td style="height: 120px; padding: 0 32px; text-align: center; vertical-align: middle;${logoUrl ? " background-color: #0e0e0e; background-image: linear-gradient(#0e0e0e, #0e0e0e);" : ""}">
              ${logoUrl
                ? `<img src="${escapeHtml(logoUrl)}" alt="${orgName}" height="${logoHeight}" style="width: auto; height: ${logoHeight}px; display: inline-block;">`
                : `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #111;">${orgName}</div>`
              }
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px 8px; text-align: center;">
              <h1 style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 24px; font-weight: 700; color: #111;">You've been accepted.</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #555;">
                ${bodyText}
              </p>
            </td>
          </tr>
          <tr><td style="padding: 0 32px;"><div style="height: 1px; background-color: #eee;"></div></td></tr>
          <tr>
            <td style="padding: 24px 32px;">
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #999; margin-bottom: 8px;">EVENT</div>
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 17px; font-weight: 600; color: #111; margin-bottom: 4px;">${eventName}</div>
              ${eventDetailsLine ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #555;">${escapeHtml(eventDetailsLine)}</div>` : ""}
            </td>
          </tr>
          <tr><td style="padding: 0 32px;"><div style="height: 1px; background-color: #eee;"></div></td></tr>
          <tr>
            <td style="padding: 28px 32px; text-align: center;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="background-color: ${accentColor}; border-radius: 6px;">
                    <a href="${acceptUrl}" style="display: inline-block; padding: 14px 40px; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none;">${ctaText}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px;">
              <p style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #aaa; margin: 0; text-align: center;">If you didn't expect this, you can safely ignore it.</p>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">
          <tr>
            <td style="padding: 16px 32px 0; text-align: center;">
              <p style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #aaa; margin: 0;">Sent by <span style="color: ${accentColor}; font-weight: 600;">${orgName}</span></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await resend.emails.send({
      from: `${branding.org_name || "Entry"} <${emailSettings.from_email}>`,
      to: [params.guestEmail],
      subject,
      html,
    });

    console.log(`[guest-list-email] Acceptance sent to ${params.guestEmail} (${isPaid ? `paid ${priceDisplay}` : "free"})`);
  } catch (err) {
    console.error("[guest-list-email] Failed to send acceptance:", err);
  }
}

// ---------------------------------------------------------------------------
// Guest list reminder email (sent 48h after invitation if not accepted)
// ---------------------------------------------------------------------------

/**
 * Send a reminder email for an unredeemed guest list invitation.
 * Fire-and-forget — never throws. Same branded design as invite email.
 *
 * For direct/artist invites: links to RSVP page.
 * For application acceptances: links to accept page.
 */
export async function sendGuestListReminderEmail(params: {
  orgId: string;
  guestName: string;
  guestEmail: string;
  inviteToken: string;
  eventName: string;
  eventDate?: string;
  eventTime?: string;
  venueName?: string;
  accessLevel: AccessLevel;
  source: "direct" | "artist" | "application";
}): Promise<void> {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.log("[guest-list-reminder] RESEND_API_KEY not configured — skipping");
      return;
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) return;

    const [{ data: brandingRow }, { data: emailRow }] = await Promise.all([
      supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", `${params.orgId}_branding`).single(),
      supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", `${params.orgId}_email`).single(),
    ]);

    const emailSettings: EmailSettings = {
      ...DEFAULT_EMAIL_SETTINGS,
      from_email: `${params.orgId}@mail.entry.events`,
      ...((emailRow?.data as Partial<EmailSettings>) || {}),
    };

    const branding = (brandingRow?.data as Record<string, string>) || {};
    const orgName = escapeHtml(branding.org_name || params.orgId.toUpperCase());
    const accentColor = branding.accent_color || "#7C3AED";
    const emailLogo = (emailRow?.data as Record<string, string>)?.logo_url || branding.logo_url || null;
    const logoUrl = emailLogo ? resolveLogoUrl(emailLogo) : null;
    const logoHeight = Math.min(((emailRow?.data as Record<string, number>)?.logo_height || 48), 100);

    const tenantUrl = await resolveTenantUrl(params.orgId, supabase);

    // Application acceptances go to /accept/, everything else to /rsvp/
    const actionPath = params.source === "application" ? "accept" : "rsvp";
    const actionUrl = `${tenantUrl}/guest-list/${actionPath}/${encodeURIComponent(params.inviteToken)}`;

    const eventName = escapeHtml(params.eventName);
    const venueLine = params.venueName ? escapeHtml(params.venueName) : "";
    const dateLine = params.eventDate ? formatDate(params.eventDate) : "";
    const timeLine = params.eventTime ? formatTime(params.eventTime) : "";
    const eventDetailsLine = [dateLine, venueLine].filter(Boolean).join(" · ");

    const subject = `Your guest list spot is expiring soon — ${params.eventName}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; -webkit-font-smoothing: antialiased; color-scheme: light only;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <!-- Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <!-- Accent Bar -->
          <tr>
            <td style="height: 4px; background-color: ${accentColor};"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="height: 120px; padding: 0 32px; text-align: center; vertical-align: middle;${logoUrl ? " background-color: #0e0e0e; background-image: linear-gradient(#0e0e0e, #0e0e0e);" : ""}">
              ${
                logoUrl
                  ? `<img src="${escapeHtml(logoUrl)}" alt="${orgName}" height="${logoHeight}" style="width: auto; height: ${logoHeight}px; display: inline-block;">`
                  : `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #111;">${orgName}</div>`
              }
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding: 20px 32px 8px; text-align: center;">
              <h1 style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 24px; font-weight: 700; color: #111;">
                Your spot is expiring soon.
              </h1>
            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #555;">
                You were added to the guest list for ${eventName}. This invitation is only valid for a limited time.
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;"><div style="height: 1px; background-color: #eee;"></div></td>
          </tr>

          <!-- Event Details -->
          <tr>
            <td style="padding: 24px 32px;">
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #999; margin-bottom: 8px;">EVENT</div>
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 17px; font-weight: 600; color: #111; margin-bottom: 4px;">${eventName}</div>
              ${eventDetailsLine ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #555;">${escapeHtml(eventDetailsLine)}</div>` : ""}
              ${timeLine ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #888; margin-top: 2px;">Doors ${timeLine}</div>` : ""}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;"><div style="height: 1px; background-color: #eee;"></div></td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding: 28px 32px; text-align: center;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="background-color: ${accentColor}; border-radius: 6px;">
                    <a href="${actionUrl}" style="display: inline-block; padding: 14px 40px; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; letter-spacing: 0.3px;">Accept your invitation</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Fine print -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <p style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #aaa; margin: 0; text-align: center;">
                If we don't hear from you, your spot will be released.
              </p>
            </td>
          </tr>

        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">
          <tr>
            <td style="padding: 16px 32px 0; text-align: center;">
              <p style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #aaa; margin: 0;">Sent by <span style="color: ${accentColor}; font-weight: 600;">${orgName}</span></p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

    await resend.emails.send({
      from: `${branding.org_name || "Entry"} <${emailSettings.from_email}>`,
      to: [params.guestEmail],
      subject,
      html,
    });

    console.log(`[guest-list-reminder] Reminder sent to ${params.guestEmail} for ${params.eventName}`);
  } catch (err) {
    console.error("[guest-list-reminder] Failed to send reminder:", err);
  }
}

// ---------------------------------------------------------------------------
// Upgrade guest access level
// ---------------------------------------------------------------------------

/**
 * Upgrade a guest's access level while keeping the same QR code / ticket_code.
 *
 * Updates: guest_list.access_level, tickets.ticket_type_id, order_items.ticket_type_id.
 * The ticket_code (QR code) stays the same — only the ticket type reference changes.
 *
 * Requires the guest to already have a ticket issued (order_id present).
 */
export async function upgradeGuestAccessLevel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  guestId: string,
  newAccessLevel: AccessLevel,
  upgradedBy: string = "admin"
): Promise<{ guest: GuestListEntry; previousLevel: AccessLevel }> {
  // 1. Fetch guest entry
  const { data: guest, error: guestErr } = await supabase
    .from(TABLES.GUEST_LIST)
    .select("*")
    .eq("id", guestId)
    .eq("org_id", orgId)
    .single();

  if (guestErr || !guest) {
    throw new Error("Guest not found");
  }

  const previousLevel: AccessLevel = guest.access_level || "guest_list";

  if (previousLevel === newAccessLevel) {
    throw new Error("Guest already has this access level");
  }

  if (!guest.order_id) {
    throw new Error("Guest does not have a ticket issued yet — cannot upgrade");
  }

  // 2. Ensure hidden ticket type exists for the NEW access level
  const newTicketTypeId = await ensureGuestListTicketType(
    supabase,
    orgId,
    guest.event_id,
    newAccessLevel
  );

  // 3. Get old hidden ticket type ID
  const oldTicketTypeName = ACCESS_LEVELS[previousLevel].ticketLabel;
  const { data: oldTicketType } = await supabase
    .from(TABLES.TICKET_TYPES)
    .select("id")
    .eq("org_id", orgId)
    .eq("event_id", guest.event_id)
    .eq("name", oldTicketTypeName)
    .limit(1)
    .single();

  // 4. Update tickets → new ticket_type_id (QR code / ticket_code stays the same)
  if (oldTicketType) {
    await supabase
      .from(TABLES.TICKETS)
      .update({ ticket_type_id: newTicketTypeId })
      .eq("order_id", guest.order_id)
      .eq("ticket_type_id", oldTicketType.id);
  }

  // 5. Update order_items → new ticket_type_id
  if (oldTicketType) {
    await supabase
      .from(TABLES.ORDER_ITEMS)
      .update({ ticket_type_id: newTicketTypeId })
      .eq("order_id", guest.order_id)
      .eq("ticket_type_id", oldTicketType.id);
  }

  // 6. Update guest_list entry
  const { error: updateErr } = await supabase
    .from(TABLES.GUEST_LIST)
    .update({
      access_level: newAccessLevel,
      notes: guest.notes
        ? `${guest.notes}\nUpgraded from ${ACCESS_LEVELS[previousLevel].label} to ${ACCESS_LEVELS[newAccessLevel].label} by ${upgradedBy} on ${new Date().toISOString().slice(0, 10)}`
        : `Upgraded from ${ACCESS_LEVELS[previousLevel].label} to ${ACCESS_LEVELS[newAccessLevel].label} by ${upgradedBy} on ${new Date().toISOString().slice(0, 10)}`,
    })
    .eq("id", guestId)
    .eq("org_id", orgId);

  if (updateErr) {
    throw new Error(`Failed to update guest entry: ${updateErr.message}`);
  }

  return {
    guest: { ...guest, access_level: newAccessLevel } as GuestListEntry,
    previousLevel,
  };
}

// ---------------------------------------------------------------------------
// Guest list upgrade notification email
// ---------------------------------------------------------------------------

/**
 * Send a polished upgrade notification email. Fire-and-forget — never throws.
 *
 * Tenant-branded. Informs the guest their access has been upgraded.
 * Their existing ticket (same QR code) is still valid — now with the new access level.
 */
export async function sendGuestListUpgradeEmail(params: {
  orgId: string;
  guestName: string;
  guestEmail: string;
  eventName: string;
  eventDate?: string;
  eventTime?: string;
  venueName?: string;
  previousLevel: AccessLevel;
  newLevel: AccessLevel;
}): Promise<void> {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.log("[guest-list-upgrade] RESEND_API_KEY not configured — skipping");
      return;
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) return;

    const [{ data: brandingRow }, { data: emailRow }] = await Promise.all([
      supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", `${params.orgId}_branding`).single(),
      supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", `${params.orgId}_email`).single(),
    ]);

    const emailSettings: EmailSettings = {
      ...DEFAULT_EMAIL_SETTINGS,
      from_email: `${params.orgId}@mail.entry.events`,
      ...((emailRow?.data as Partial<EmailSettings>) || {}),
    };

    const branding = (brandingRow?.data as Record<string, string>) || {};
    const orgName = escapeHtml(branding.org_name || params.orgId.toUpperCase());
    const accentColor = branding.accent_color || "#7C3AED";
    const emailLogo = (emailRow?.data as Record<string, string>)?.logo_url || branding.logo_url || null;
    const logoUrl = emailLogo ? resolveLogoUrl(emailLogo) : null;
    const logoHeight = Math.min(((emailRow?.data as Record<string, number>)?.logo_height || 48), 100);

    const firstName = params.guestName.split(/\s+/)[0];
    const eventName = escapeHtml(params.eventName);
    const newLevelLabel = ACCESS_LEVELS[params.newLevel].label;
    const venueLine = params.venueName ? escapeHtml(params.venueName) : "";
    const dateLine = params.eventDate ? formatDate(params.eventDate) : "";
    const timeLine = params.eventTime ? formatTime(params.eventTime) : "";
    const eventDetailsLine = [dateLine, venueLine].filter(Boolean).join(" · ");

    const subject = `Your access has been upgraded — ${params.eventName}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; -webkit-font-smoothing: antialiased; color-scheme: light only;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <!-- Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <!-- Accent Bar -->
          <tr>
            <td style="height: 4px; background-color: ${accentColor};"></td>
          </tr>

          <!-- Header (dark bg with logo) -->
          <tr>
            <td style="height: 120px; padding: 0 32px; text-align: center; vertical-align: middle;${logoUrl ? " background-color: #0e0e0e; background-image: linear-gradient(#0e0e0e, #0e0e0e);" : ""}">
              ${
                logoUrl
                  ? `<img src="${escapeHtml(logoUrl)}" alt="${orgName}" height="${logoHeight}" style="width: auto; height: ${logoHeight}px; display: inline-block;">`
                  : `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #111;">${orgName}</div>`
              }
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding: 20px 32px 8px; text-align: center;">
              <h1 style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 24px; font-weight: 700; color: #111;">
                You've been upgraded.
              </h1>
            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #555;">
                ${escapeHtml(firstName)}, your access for ${eventName} has been upgraded to <strong style="color: #111;">${escapeHtml(newLevelLabel)}</strong>. No action needed — your existing ticket is already updated and ready to go.
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;"><div style="height: 1px; background-color: #eee;"></div></td>
          </tr>

          <!-- New Access Level Badge -->
          <tr>
            <td style="padding: 24px 32px 0; text-align: center;">
              <div style="display: inline-block; padding: 8px 24px; background-color: ${accentColor}; border-radius: 20px;">
                <span style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #ffffff;">${escapeHtml(newLevelLabel)}</span>
              </div>
            </td>
          </tr>

          <!-- Event Details -->
          <tr>
            <td style="padding: 20px 32px;">
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #999; margin-bottom: 8px;">EVENT</div>
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 17px; font-weight: 600; color: #111; margin-bottom: 4px;">${eventName}</div>
              ${eventDetailsLine ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #555;">${escapeHtml(eventDetailsLine)}</div>` : ""}
              ${timeLine ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #888; margin-top: 2px;">Doors ${timeLine}</div>` : ""}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;"><div style="height: 1px; background-color: #eee;"></div></td>
          </tr>

          <!-- Info Note -->
          <tr>
            <td style="padding: 24px 32px;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #888; text-align: center;">
                Use the same ticket you already have — your QR code is unchanged and will reflect your new access level at the door.
              </p>
            </td>
          </tr>

        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px;">
          <tr>
            <td style="padding: 16px 32px 0; text-align: center;">
              <p style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #aaa; margin: 0;">Sent by <span style="color: ${accentColor}; font-weight: 600;">${orgName}</span></p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

    await resend.emails.send({
      from: `${branding.org_name || "Entry"} <${emailSettings.from_email}>`,
      to: [params.guestEmail],
      subject,
      html,
    });

    console.log(`[guest-list-upgrade] Upgrade email sent to ${params.guestEmail} (${params.previousLevel} → ${params.newLevel})`);
  } catch (err) {
    console.error("[guest-list-upgrade] Failed to send upgrade email:", err);
  }
}
