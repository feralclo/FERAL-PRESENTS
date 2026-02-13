import { Resend } from "resend";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES } from "@/lib/constants";
import { getCurrencySymbol } from "@/lib/stripe/config";
import { generateTicketsPDF, type TicketPDFData } from "@/lib/pdf";
import { buildOrderConfirmationEmail } from "@/lib/email-templates";
import type { EmailSettings, OrderEmailData } from "@/types/email";
import { DEFAULT_EMAIL_SETTINGS } from "@/types/email";

/**
 * Lazy-initialized Resend client.
 * Returns null if RESEND_API_KEY is not configured (graceful degradation).
 */
function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

/**
 * Fetch email settings for an org from site_settings.
 * Falls back to defaults if not configured — new orgs get sane defaults out of the box.
 */
async function getEmailSettings(orgId: string): Promise<EmailSettings> {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) return DEFAULT_EMAIL_SETTINGS;

    const { data } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", `${orgId}_email`)
      .single();

    if (data?.data && typeof data.data === "object") {
      return { ...DEFAULT_EMAIL_SETTINGS, ...(data.data as Partial<EmailSettings>) };
    }
  } catch {
    // Settings not found — use defaults
  }
  return DEFAULT_EMAIL_SETTINGS;
}

/**
 * Format event date for email display.
 */
function formatEventDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Send order confirmation email with PDF tickets attached.
 *
 * This is called fire-and-forget from the order creation flow.
 * It should never throw — failures are logged but don't block the order response.
 *
 * Multi-tenant: fetches email settings for the org, uses their branding.
 */
export async function sendOrderConfirmationEmail(params: {
  orgId: string;
  order: {
    id: string;
    order_number: string;
    total: number;
    currency: string;
  };
  customer: {
    first_name: string;
    last_name: string;
    email: string;
  };
  event: {
    name: string;
    slug?: string;
    venue_name?: string;
    date_start?: string;
    doors_time?: string;
    currency?: string;
  };
  tickets: {
    ticket_code: string;
    ticket_type_name: string;
    merch_size?: string;
  }[];
}): Promise<void> {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.log("[email] RESEND_API_KEY not configured — skipping order confirmation email");
      return;
    }

    let settings = await getEmailSettings(params.orgId);

    if (!settings.order_confirmation_enabled) {
      console.log("[email] Order confirmation emails disabled for org:", params.orgId);
      return;
    }

    const currency = params.event.currency || params.order.currency || "GBP";
    const symbol = getCurrencySymbol(currency);

    // Build email data
    const orderEmailData: OrderEmailData = {
      order_number: params.order.order_number,
      customer_first_name: params.customer.first_name,
      customer_last_name: params.customer.last_name,
      customer_email: params.customer.email,
      event_name: params.event.name,
      venue_name: params.event.venue_name || "",
      event_date: formatEventDate(params.event.date_start),
      doors_time: params.event.doors_time,
      currency_symbol: symbol,
      total: params.order.total.toFixed(2),
      tickets: params.tickets.map((t) => ({
        ticket_code: t.ticket_code,
        ticket_type: t.ticket_type_name,
        merch_size: t.merch_size,
      })),
    };

    // Resolve relative logo URL to absolute (emails need full URLs to render images)
    if (settings.logo_url && !settings.logo_url.startsWith("http")) {
      const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
      if (siteUrl) {
        settings = {
          ...settings,
          logo_url: `${siteUrl}${settings.logo_url.startsWith("/") ? "" : "/"}${settings.logo_url}`,
        };
      }
    }

    // Build email HTML + subject + plain text
    const { subject, html, text } = buildOrderConfirmationEmail(
      settings,
      orderEmailData
    );

    // Generate PDF tickets for attachment
    const pdfData: TicketPDFData[] = params.tickets.map((t) => ({
      ticketCode: t.ticket_code,
      eventName: params.event.name,
      eventDate: formatEventDate(params.event.date_start),
      venueName: params.event.venue_name || "",
      ticketType: t.ticket_type_name,
      holderName: `${params.customer.first_name} ${params.customer.last_name}`,
      orderNumber: params.order.order_number,
      merchSize: t.merch_size,
    }));

    const pdfBuffer = await generateTicketsPDF(pdfData);

    // Send via Resend
    const { error } = await resend.emails.send({
      from: `${settings.from_name} <${settings.from_email}>`,
      replyTo: settings.reply_to || undefined,
      to: [params.customer.email],
      subject,
      html,
      text,
      attachments: [
        {
          filename: `${params.order.order_number}-tickets.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    if (error) {
      console.error("[email] Resend error:", error);
      return;
    }

    console.log(
      `[email] Order confirmation sent to ${params.customer.email} for ${params.order.order_number}`
    );
  } catch (err) {
    // Never throw — email failure must not block the order flow
    console.error("[email] Failed to send order confirmation:", err);
  }
}
