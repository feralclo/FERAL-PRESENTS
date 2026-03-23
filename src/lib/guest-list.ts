import crypto from "crypto";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { guestListSettingsKey } from "@/lib/constants";
import { createOrder } from "@/lib/orders";
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
  guest_list: { label: "Guest List", shortLabel: "Guest", ticketLabel: "Guest List" },
  vip: { label: "VIP", shortLabel: "VIP", ticketLabel: "Guest List — VIP" },
  backstage: { label: "Backstage", shortLabel: "Backstage", ticketLabel: "Guest List — Backstage" },
  aaa: { label: "AAA", shortLabel: "AAA", ticketLabel: "Guest List — AAA" },
  artist: { label: "Artist", shortLabel: "Artist", ticketLabel: "Guest List — Artist" },
};

export type { AccessLevel };

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
}

const DEFAULT_GUEST_LIST_SETTINGS: GuestListSettings = {
  auto_approve: true,
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
    },
    sendEmail: true,
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

    const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(subject)}</title>
  <style>
    :root { color-scheme: light dark; }
    @media (prefers-color-scheme: dark) {
      .em-bg { background-color: #121218 !important; }
      .em-card { background-color: #1a1a22 !important; }
      .em-h { color: #f0f0f5 !important; }
      .em-p { color: #a0a0b0 !important; }
      .em-m { color: #707080 !important; }
      .em-divider { background-color: #2a2a35 !important; }
      .em-btn { background-color: ${accentColor} !important; }
      .em-footer { color: #606070 !important; }
      .em-footer-accent { color: ${accentColor} !important; }
      .em-detail-bg { background-color: #1e1e28 !important; }
      .em-detail-border { border-color: #2a2a35 !important; }
    }
  </style>
</head>
<body class="em-bg" style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-bg" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-card" style="max-width: 480px; background-color: #ffffff; border-radius: 12px; overflow: hidden;">

          <!-- Accent bar -->
          <tr>
            <td style="height: 3px; background-color: ${accentColor};"></td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 36px 32px 8px 32px;">
              <h1 class="em-h" style="font-size: 24px; font-weight: 700; color: #18181b; margin: 0 0 20px 0; line-height: 1.3;">You're on the list.</h1>
              <p class="em-p" style="font-size: 15px; color: #3f3f46; margin: 0 0 24px 0; line-height: 1.6;">${escapeHtml(firstName)}, you've been added to the guest list for <strong>${eventName}</strong>.</p>
            </td>
          </tr>

          <!-- Event details card -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-detail-bg em-detail-border" style="background-color: #f9f9fb; border: 1px solid #e4e4e7; border-radius: 10px;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <p class="em-h" style="font-size: 16px; font-weight: 700; color: #18181b; margin: 0 0 8px 0;">${eventName}</p>
                    ${venueLine ? `<p class="em-p" style="font-size: 14px; color: #52525b; margin: 0 0 4px 0;">${venueLine}</p>` : ""}
                    ${dateLine ? `<p class="em-p" style="font-size: 14px; color: #52525b; margin: 0 0 4px 0;">${dateLine}${timeLine ? ` · ${timeLine}` : ""}</p>` : ""}
                    ${showAccessLevel ? `<p style="font-size: 13px; font-weight: 600; color: ${accentColor}; margin: 8px 0 0 0; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(accessLabel)}</p>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Instruction -->
          <tr>
            <td style="padding: 0 32px 8px 32px;">
              <p class="em-p" style="font-size: 15px; color: #3f3f46; margin: 0 0 24px 0; line-height: 1.6;">Confirm your attendance and we'll send your ticket with a QR code for entry.</p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td class="em-btn" style="background-color: ${accentColor}; border-radius: 8px;">
                    <a href="${rsvpUrl}" style="display: inline-block; padding: 14px 36px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; letter-spacing: 0.3px;">Confirm attendance</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <div class="em-divider" style="height: 1px; background-color: #e4e4e7;"></div>
            </td>
          </tr>

          <!-- Fine print -->
          <tr>
            <td style="padding: 20px 32px 28px 32px;">
              <p class="em-m" style="font-size: 12px; color: #a1a1aa; margin: 0; line-height: 1.5;">If you didn't expect this, you can safely ignore it.</p>
            </td>
          </tr>

        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px;">
          <tr>
            <td style="padding: 20px 32px 0 32px; text-align: center;">
              <p class="em-footer" style="font-size: 11px; color: #a1a1aa; margin: 0;">Sent by <span class="em-footer-accent" style="color: ${accentColor}; font-weight: 600;">${orgName}</span></p>
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
