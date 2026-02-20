import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getCurrencySymbol } from "@/lib/stripe/config";
import { generateTicketsPDF, type TicketPDFData } from "@/lib/pdf";
import { buildOrderConfirmationEmail, buildAbandonedCartRecoveryEmail, type EmailWalletLinks, type AbandonedCartEmailData } from "@/lib/email-templates";
import type { EmailSettings, OrderEmailData, PdfTicketSettings, WalletPassSettings } from "@/types/email";
import { DEFAULT_EMAIL_SETTINGS, DEFAULT_PDF_TICKET_SETTINGS, DEFAULT_WALLET_PASS_SETTINGS } from "@/types/email";

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
    const supabase = await getSupabaseAdmin();
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
 * Fetch wallet pass settings for an org.
 */
async function getWalletPassSettings(orgId: string): Promise<WalletPassSettings> {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return DEFAULT_WALLET_PASS_SETTINGS;

    const { data } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", `${orgId}_wallet_passes`)
      .single();

    if (data?.data && typeof data.data === "object") {
      return { ...DEFAULT_WALLET_PASS_SETTINGS, ...(data.data as Partial<WalletPassSettings>) };
    }
  } catch {
    // Settings not found — use defaults (wallets disabled)
  }
  return DEFAULT_WALLET_PASS_SETTINGS;
}

/**
 * Fetch PDF ticket design settings for an org.
 */
async function getPdfTicketSettings(orgId: string): Promise<PdfTicketSettings> {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return DEFAULT_PDF_TICKET_SETTINGS;

    const { data } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", `${orgId}_pdf_ticket`)
      .single();

    if (data?.data && typeof data.data === "object") {
      return { ...DEFAULT_PDF_TICKET_SETTINGS, ...(data.data as Partial<PdfTicketSettings>) };
    }
  } catch {
    // Settings not found — use defaults
  }
  return DEFAULT_PDF_TICKET_SETTINGS;
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
 * Record email send status in the order's metadata JSONB field.
 * Used to populate the order timeline in admin.
 */
async function recordEmailStatus(
  orderId: string,
  emailMeta: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return;

    // Merge into existing metadata (don't overwrite other fields)
    const { data: existing } = await supabase
      .from(TABLES.ORDERS)
      .select("metadata")
      .eq("id", orderId)
      .single();

    const currentMeta = (existing?.metadata as Record<string, unknown>) || {};
    await supabase
      .from(TABLES.ORDERS)
      .update({ metadata: { ...currentMeta, ...emailMeta } })
      .eq("id", orderId);
  } catch {
    // Never throw — recording email status must not cause issues
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
    merch_name?: string;
  }[];
  vat?: {
    amount: number;
    rate: number;
    inclusive: boolean;
    vat_number?: string;
  };
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
        merch_name: t.merch_name,
      })),
      ...(params.vat && params.vat.amount > 0
        ? {
            vat: {
              amount: params.vat.amount.toFixed(2),
              rate: params.vat.rate,
              inclusive: params.vat.inclusive,
              vat_number: params.vat.vat_number,
            },
          }
        : {}),
    };

    let emailLogoBase64: string | null = null;
    let pdfLogoBase64: string | null = null;

    // Fetch email logo base64 from DB for CID inline embedding
    try {
      const sb = await getSupabaseAdmin();
      if (sb && settings.logo_url) {
        const m = settings.logo_url.match(/\/api\/media\/(.+)$/);
        if (m) {
          const { data: row } = await sb
            .from(TABLES.SITE_SETTINGS).select("data")
            .eq("key", `media_${m[1]}`).single();
          const d = row?.data as { image?: string } | null;
          if (d?.image) emailLogoBase64 = d.image;
        }
      }
    } catch { /* logo fetch failed — email will use text fallback */ }

    // Embed email logo as CID inline attachment.
    // Uses contentId (the correct Resend SDK property) which sets Content-ID +
    // Content-Disposition: inline. The image renders in the body and does NOT
    // appear in the attachment list.
    if (emailLogoBase64) {
      settings = { ...settings, logo_url: "cid:brand-logo" };
    }

    // Generate wallet pass links (if enabled) — needed before building email HTML
    let walletLinks: EmailWalletLinks | undefined;
    try {
      const walletSettings = await getWalletPassSettings(params.orgId);
      const siteUrl = (
        process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
      ).replace(/\/$/, "");

      if (siteUrl && (walletSettings.apple_wallet_enabled || walletSettings.google_wallet_enabled)) {
        walletLinks = {};

        // Apple Wallet — link to download endpoint (generates .pkpass on click)
        if (walletSettings.apple_wallet_enabled) {
          walletLinks.appleWalletUrl = `${siteUrl}/api/orders/${params.order.id}/wallet/apple`;
        }

        // Google Wallet — generate save URL inline (contains signed JWT)
        if (walletSettings.google_wallet_enabled) {
          try {
            const { generateGoogleWalletUrl } = await import("@/lib/wallet-passes");
            const walletTickets = params.tickets.map((t) => ({
              ticketCode: t.ticket_code,
              eventName: params.event.name,
              venueName: params.event.venue_name || "",
              eventDate: params.event.date_start || "",
              doorsTime: params.event.doors_time,
              ticketType: t.ticket_type_name,
              holderName: `${params.customer.first_name} ${params.customer.last_name}`,
              orderNumber: params.order.order_number,
              merchSize: t.merch_size,
            }));
            const googleUrl = generateGoogleWalletUrl(walletTickets, walletSettings);
            if (googleUrl) walletLinks.googleWalletUrl = googleUrl;
          } catch {
            // Google Wallet URL generation failed — proceed without it
          }
        }

        // Clear wallet links if both ended up empty
        if (!walletLinks.appleWalletUrl && !walletLinks.googleWalletUrl) {
          walletLinks = undefined;
        }
      }
    } catch {
      // Wallet link generation failed — proceed without wallet buttons
    }

    const { subject, html, text } = buildOrderConfirmationEmail(
      settings,
      orderEmailData,
      walletLinks,
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
      merchName: t.merch_name,
    }));

    const pdfSettings = await getPdfTicketSettings(params.orgId);

    // Fetch PDF logo from DB (may be different from email logo)
    if (pdfSettings.logo_url) {
      const m = pdfSettings.logo_url.match(/\/api\/media\/(.+)$/);
      if (m) {
        try {
          const sb = await getSupabaseAdmin();
          if (sb) {
            const { data: row } = await sb
              .from(TABLES.SITE_SETTINGS).select("data")
              .eq("key", `media_${m[1]}`).single();
            const d = row?.data as { image?: string } | null;
            if (d?.image) pdfLogoBase64 = d.image;
          }
        } catch { /* logo fetch failed */ }
      }
    }

    const pdfBuffer = await generateTicketsPDF(pdfData, pdfSettings, pdfLogoBase64);

    // Build attachments — PDF always included
    const attachments: { filename: string; content: Buffer; contentType?: string; contentId?: string }[] = [
      {
        filename: `${params.order.order_number}-tickets.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ];

    // Add logo as inline CID attachment (contentId = Content-Disposition: inline)
    if (emailLogoBase64) {
      const base64Match = emailLogoBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (base64Match) {
        attachments.push({
          filename: "logo.png",
          content: Buffer.from(base64Match[2], "base64"),
          contentType: base64Match[1],
          contentId: "brand-logo",
        });
      }
    }

    // Send via Resend — retry up to 2 times on transient failures
    let lastError: unknown = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { error } = await resend.emails.send({
        from: `${settings.from_name} <${settings.from_email}>`,
        replyTo: settings.reply_to || undefined,
        to: [params.customer.email],
        subject,
        html,
        text,
        attachments,
      });

      if (!error) {
        // Record success in order metadata
        await recordEmailStatus(params.order.id, {
          email_sent: true,
          email_sent_at: new Date().toISOString(),
          email_to: params.customer.email,
        });
        console.log(
          `[email] Order confirmation sent to ${params.customer.email} for ${params.order.order_number}${attempt > 1 ? ` (attempt ${attempt})` : ""}`
        );
        return;
      }

      lastError = error;
      const errMsg = typeof error === "object" && "message" in error ? error.message : String(error);
      console.warn(`[email] Resend attempt ${attempt}/${maxAttempts} failed:`, errMsg);

      // Don't retry on validation errors (wrong from address, etc.) — only on transient failures
      if (typeof error === "object" && "name" in error && (error as { name: string }).name === "validation_error") {
        break;
      }

      // Wait before retrying (1s, 2s)
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }

    // All attempts failed — record the error
    const errMsg = lastError && typeof lastError === "object" && "message" in lastError
      ? (lastError as { message: string }).message
      : String(lastError);
    console.error("[email] Resend error after all attempts:", errMsg);
    await recordEmailStatus(params.order.id, {
      email_sent: false,
      email_error: errMsg,
      email_attempted_at: new Date().toISOString(),
      email_to: params.customer.email,
    });
  } catch (err) {
    // Never throw — email failure must not block the order flow
    console.error("[email] Failed to send order confirmation:", err);
    // Record the failure so the timeline shows it (previously this was silent)
    try {
      await recordEmailStatus(params.order.id, {
        email_sent: false,
        email_error: err instanceof Error ? err.message : "Internal error during email generation",
        email_attempted_at: new Date().toISOString(),
        email_to: params.customer.email,
      });
    } catch {
      // Last-resort catch — don't let metadata recording break anything
    }
  }
}

/**
 * Send abandoned cart recovery email.
 *
 * Called by the abandoned cart automation cron job. Fetches email settings,
 * builds recovery URL from cart token, sends via Resend with retry, and
 * updates the cart's notification state on success.
 *
 * Never throws — failures are logged but don't block the cron.
 */
export async function sendAbandonedCartRecoveryEmail(params: {
  orgId: string;
  cartId: string;
  email: string;
  firstName?: string;
  event: {
    name: string;
    slug: string;
    venue_name?: string;
    date_start?: string;
    doors_time?: string;
    currency?: string;
  };
  items: {
    name: string;
    qty: number;
    price: number;
    merch_size?: string;
  }[];
  subtotal: number;
  currency: string;
  cartToken: string;
  stepConfig: {
    subject: string;
    preview_text: string;
    include_discount: boolean;
    discount_code?: string;
    discount_percent?: number;
    cta_text?: string;
    discount_label?: string;
    greeting?: string;
    body_message?: string;
  };
}): Promise<boolean> {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.log("[email] RESEND_API_KEY not configured — skipping abandoned cart recovery email");
      return false;
    }

    let settings = await getEmailSettings(params.orgId);

    // Build recovery URL
    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
    ).replace(/\/$/, "");
    // Build recovery URL — include discount code if present so checkout auto-applies it
    const hasItems = params.items.length > 0;
    const discountParam = params.stepConfig.include_discount && params.stepConfig.discount_code
      ? `&discount=${encodeURIComponent(params.stepConfig.discount_code)}`
      : "";
    // Empty carts (popup captures) → link to event page; carts with items → checkout restore
    const recoveryUrl = hasItems
      ? `${siteUrl}/event/${params.event.slug}/checkout?restore=${params.cartToken}${discountParam}`
      : `${siteUrl}/event/${params.event.slug}`;
    const unsubscribeUrl = `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(params.cartToken)}&type=cart_recovery`;

    const currency = params.currency || params.event.currency || "GBP";
    const symbol = getCurrencySymbol(currency);

    // Build email data
    const cartEmailData: AbandonedCartEmailData = {
      customer_first_name: params.firstName,
      event_name: params.event.name,
      venue_name: params.event.venue_name || "",
      event_date: formatEventDate(params.event.date_start),
      doors_time: params.event.doors_time,
      currency_symbol: symbol,
      cart_items: params.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        unit_price: item.price,
        merch_size: item.merch_size,
      })),
      subtotal: params.subtotal.toFixed(2),
      recovery_url: recoveryUrl,
      unsubscribe_url: unsubscribeUrl,
      ...(params.stepConfig.include_discount && params.stepConfig.discount_code
        ? {
            discount_code: params.stepConfig.discount_code,
            discount_percent: params.stepConfig.discount_percent || 0,
          }
        : {}),
    };

    let emailLogoBase64: string | null = null;

    // Fetch email logo base64 from DB for CID inline embedding
    try {
      const sb = await getSupabaseAdmin();
      if (sb && settings.logo_url) {
        const m = settings.logo_url.match(/\/api\/media\/(.+)$/);
        if (m) {
          const { data: row } = await sb
            .from(TABLES.SITE_SETTINGS).select("data")
            .eq("key", `media_${m[1]}`).single();
          const d = row?.data as { image?: string } | null;
          if (d?.image) emailLogoBase64 = d.image;
        }
      }
    } catch { /* logo fetch failed — email will use text fallback */ }

    // Embed logo as CID inline attachment
    if (emailLogoBase64) {
      settings = { ...settings, logo_url: "cid:brand-logo" };
    }

    const { subject, html, text } = buildAbandonedCartRecoveryEmail(
      settings,
      cartEmailData,
      {
        subject: params.stepConfig.subject,
        preview_text: params.stepConfig.preview_text,
        greeting: params.stepConfig.greeting,
        body_message: params.stepConfig.body_message,
        cta_text: params.stepConfig.cta_text,
        discount_label: params.stepConfig.discount_label,
      },
    );

    // Build attachments — logo only (no PDF for recovery emails)
    const attachments: { filename: string; content: Buffer; contentType?: string; contentId?: string }[] = [];

    if (emailLogoBase64) {
      const base64Match = emailLogoBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (base64Match) {
        attachments.push({
          filename: "logo.png",
          content: Buffer.from(base64Match[2], "base64"),
          contentType: base64Match[1],
          contentId: "brand-logo",
        });
      }
    }

    // Send via Resend — retry up to 2 times on transient failures
    let lastError: unknown = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { error } = await resend.emails.send({
        from: `${settings.from_name} <${settings.from_email}>`,
        replyTo: settings.reply_to || undefined,
        to: [params.email],
        subject,
        html,
        text,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        ...(attachments.length > 0 ? { attachments } : {}),
      });

      if (!error) {
        // Cart state (notified_at, notification_count) is updated atomically
        // by the cron job that calls this function — not here.
        console.log(
          `[email] Abandoned cart recovery sent to ${params.email} for cart ${params.cartId}${attempt > 1 ? ` (attempt ${attempt})` : ""}`
        );
        return true;
      }

      lastError = error;
      const errMsg = typeof error === "object" && "message" in error ? error.message : String(error);
      console.warn(`[email] Abandoned cart recovery attempt ${attempt}/${maxAttempts} failed:`, errMsg);

      // Don't retry on validation errors
      if (typeof error === "object" && "name" in error && (error as { name: string }).name === "validation_error") {
        break;
      }

      // Wait before retrying (1s, 2s)
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }

    // All attempts failed
    const errMsg = lastError && typeof lastError === "object" && "message" in lastError
      ? (lastError as { message: string }).message
      : String(lastError);
    console.error(`[email] Abandoned cart recovery failed for cart ${params.cartId}:`, errMsg);
    return false;
  } catch (err) {
    // Never throw — email failure must not block the cron
    console.error(`[email] Failed to send abandoned cart recovery for cart ${params.cartId}:`, err);
    return false;
  }
}
