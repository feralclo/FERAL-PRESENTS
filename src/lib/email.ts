import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, brandingKey } from "@/lib/constants";
import { getCurrencySymbol, isZeroDecimalCurrency } from "@/lib/stripe/config";
import { generateTicketsPDF, type TicketPDFData } from "@/lib/pdf";
import { buildOrderConfirmationEmail, buildAbandonedCartRecoveryEmail, buildAnnouncementEmail, type EmailWalletLinks, type AbandonedCartEmailData, type AnnouncementEmailOpts } from "@/lib/email-templates";
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
  // Dynamic defaults: use org_id as email prefix (e.g., feral@mail.entry.events)
  const orgDefaults = {
    ...DEFAULT_EMAIL_SETTINGS,
    from_email: `${orgId}@mail.entry.events`,
  };

  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return orgDefaults;

    const { data } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", `${orgId}_email`)
      .single();

    const emailSettings = data?.data && typeof data.data === "object"
      ? { ...orgDefaults, ...(data.data as Partial<EmailSettings>) }
      : orgDefaults;

    // Branding fallback: if email settings has no logo (and no override flag),
    // pull logo + accent color from the global branding settings
    if (!emailSettings.logo_url && !(data?.data as Record<string, unknown>)?.logo_override) {
      try {
        const { data: brandingRow } = await supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", brandingKey(orgId))
          .single();
        if (brandingRow?.data) {
          const branding = brandingRow.data as { logo_url?: string; accent_color?: string; logo_height?: number };
          if (branding.logo_url) emailSettings.logo_url = branding.logo_url;
          if (branding.accent_color) emailSettings.accent_color = branding.accent_color;
          if (branding.logo_height) emailSettings.logo_height = branding.logo_height;
        }
      } catch { /* branding not found */ }
    }

    return emailSettings;
  } catch {
    // Settings not found — use defaults
  }
  return orgDefaults;
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
 * Falls back to branding settings (logo, accent color, org name)
 * so tenants don't need to separately configure PDF tickets.
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

    const pdfSettings = data?.data && typeof data.data === "object"
      ? { ...DEFAULT_PDF_TICKET_SETTINGS, ...(data.data as Partial<PdfTicketSettings>) }
      : { ...DEFAULT_PDF_TICKET_SETTINGS };

    // Branding fallback: if PDF settings has no logo, pull from branding
    if (!pdfSettings.logo_url || pdfSettings.brand_name === DEFAULT_PDF_TICKET_SETTINGS.brand_name) {
      try {
        const { data: brandingRow } = await supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", brandingKey(orgId))
          .single();
        if (brandingRow?.data) {
          const branding = brandingRow.data as {
            logo_url?: string; accent_color?: string;
            org_name?: string; logo_height?: number;
          };
          if (!pdfSettings.logo_url && branding.logo_url) {
            pdfSettings.logo_url = branding.logo_url;
          }
          if (branding.accent_color) {
            // Only override accent if PDF settings weren't explicitly customized
            if (pdfSettings.accent_color === DEFAULT_PDF_TICKET_SETTINGS.accent_color) {
              pdfSettings.accent_color = branding.accent_color;
            }
          }
          if (branding.org_name && pdfSettings.brand_name === DEFAULT_PDF_TICKET_SETTINGS.brand_name) {
            pdfSettings.brand_name = branding.org_name;
          }
          if (branding.logo_height && pdfSettings.logo_height === DEFAULT_PDF_TICKET_SETTINGS.logo_height) {
            pdfSettings.logo_height = branding.logo_height;
          }
        }
      } catch { /* branding not found */ }
    }

    return pdfSettings;
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
  /** "merch_preorder" for shop-only merch orders */
  order_type?: string;
  /** Artist/person who added the guest (guest list orders). */
  invited_by?: string;
  /** Merch booth closing time formatted for display (e.g. "10pm"). */
  merchCollectionCutoff?: string;
  /** Whether this is a guest list order (requires ID matching). */
  isGuestList?: boolean;
  /** Cross-currency info (when buyer paid in a different currency than the event base). */
  crossCurrency?: {
    baseCurrency: string;
    baseTotal: number;
    exchangeRate: number;
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

    // Use order currency (presentment — what buyer paid) over event currency (base)
    const currency = params.order.currency || params.event.currency || "GBP";
    const symbol = getCurrencySymbol(currency);
    const zd = isZeroDecimalCurrency(currency);
    const fmtAmt = (n: number) => zd ? String(Math.round(n)) : n.toFixed(2);

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
      total: fmtAmt(params.order.total),
      order_type: params.order_type,
      merch_collection_cutoff: params.merchCollectionCutoff,
      is_guest_list: params.isGuestList,
      invited_by: params.invited_by,
      tickets: params.tickets.map((t) => ({
        ticket_code: t.ticket_code,
        ticket_type: t.ticket_type_name,
        merch_size: t.merch_size,
        merch_name: t.merch_name,
      })),
      ...(params.vat && params.vat.amount > 0
        ? {
            vat: {
              amount: fmtAmt(params.vat.amount),
              rate: params.vat.rate,
              inclusive: params.vat.inclusive,
              vat_number: params.vat.vat_number,
            },
          }
        : {}),
      ...(params.crossCurrency ? {
        cross_currency: {
          base_symbol: getCurrencySymbol(params.crossCurrency.baseCurrency),
          base_total: isZeroDecimalCurrency(params.crossCurrency.baseCurrency) ? String(Math.round(params.crossCurrency.baseTotal)) : params.crossCurrency.baseTotal.toFixed(2),
          base_currency_code: params.crossCurrency.baseCurrency.toUpperCase(),
          exchange_rate: params.crossCurrency.exchangeRate.toFixed(4),
        },
      } : {}),
    };

    let emailLogoBase64: string | null = null;
    let pdfLogoBase64: string | null = null;

    // Fetch email logo base64 from DB for CID inline embedding
    // Validate media key belongs to this org (keys are media_{orgId}_{name})
    try {
      const sb = await getSupabaseAdmin();
      if (sb && settings.logo_url) {
        const m = settings.logo_url.match(/\/api\/media\/(.+?)(?:\?.*)?$/);
        if (m && m[1].startsWith(`${params.orgId}_`)) {
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
      orderType: params.order_type,
      invitedBy: params.invited_by,
      merchCollectionCutoff: params.merchCollectionCutoff,
      isGuestList: params.isGuestList,
    }));

    const pdfSettings = await getPdfTicketSettings(params.orgId);

    // Fetch PDF logo from DB (may be different from email logo)
    // Validate media key belongs to this org (keys are media_{orgId}_{name})
    if (pdfSettings.logo_url) {
      const m = pdfSettings.logo_url.match(/\/api\/media\/(.+?)(?:\?.*)?$/);
      if (m && m[1].startsWith(`${params.orgId}_`)) {
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
        filename: `${params.order.order_number}-${params.order_type === "merch_preorder" ? "merch-collection" : "tickets"}.pdf`,
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
    discount_type?: string;
    discount_value?: number;
    cta_text?: string;
    discount_label?: string;
    greeting?: string;
    body_message?: string;
  };
  isOriginalDiscount?: boolean;
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
    // (works for both incentive discounts AND customer's original discount)
    const hasItems = params.items.length > 0;
    const discountParam = params.stepConfig.discount_code
      ? `&discount=${encodeURIComponent(params.stepConfig.discount_code)}`
      : "";
    // Empty carts (popup captures) → link to event page; carts with items → checkout restore
    const recoveryUrl = hasItems
      ? `${siteUrl}/event/${params.event.slug}/checkout?restore=${params.cartToken}${discountParam}`
      : `${siteUrl}/event/${params.event.slug}`;
    const unsubscribeUrl = `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(params.cartToken)}&type=cart_recovery`;

    const currency = params.currency || params.event.currency || "GBP";
    const symbol = getCurrencySymbol(currency);

    // Build email data — supports both percentage and fixed-amount discounts
    const discountType = params.stepConfig.discount_type || "percentage";
    const cartEmailData: AbandonedCartEmailData = {
      customer_first_name: params.firstName,
      event_name: params.event.name,
      venue_name: params.event.venue_name || "",
      event_date: formatEventDate(params.event.date_start),
      doors_time: params.event.doors_time,
      currency_symbol: symbol,
      currency_code: currency,
      cart_items: params.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        unit_price: item.price,
        merch_size: item.merch_size,
      })),
      subtotal: isZeroDecimalCurrency(currency) ? String(Math.round(params.subtotal)) : params.subtotal.toFixed(2),
      recovery_url: recoveryUrl,
      unsubscribe_url: unsubscribeUrl,
      ...(params.stepConfig.discount_code
        ? {
            discount_code: params.stepConfig.discount_code,
            discount_percent: discountType === "percentage" ? (params.stepConfig.discount_value ?? params.stepConfig.discount_percent ?? 0) : 0,
            discount_type: discountType,
            discount_fixed_amount: discountType === "fixed" ? (params.stepConfig.discount_value ?? 0) : 0,
            is_original_discount: params.isOriginalDiscount || false,
          }
        : {}),
    };

    let emailLogoBase64: string | null = null;

    // Fetch email logo base64 from DB for CID inline embedding
    // Validate media key belongs to this org (keys are media_{orgId}_{name})
    try {
      const sb = await getSupabaseAdmin();
      if (sb && settings.logo_url) {
        const m = settings.logo_url.match(/\/api\/media\/(.+?)(?:\?.*)?$/);
        if (m && m[1].startsWith(`${params.orgId}_`)) {
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

/**
 * Send announcement email (coming-soon sequence).
 *
 * Called by the signup route (step 1) and cron job (steps 2-4).
 * Fetches email settings + branding, builds HTML, sends via Resend with retry.
 * CID logo embedding (same pattern as abandoned cart).
 *
 * Never throws — failures are logged but don't block the caller.
 */
export async function sendAnnouncementEmail(params: {
  orgId: string;
  email: string;
  step: 1 | 2 | 3 | 4;
  firstName?: string;
  event: {
    name: string;
    slug: string;
    venue_name?: string;
    date_start?: string;
    tickets_live_at?: string;
  };
  unsubscribeToken: string;
  customSubject?: string;
  customHeading?: string;
  customBody?: string;
}): Promise<boolean> {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.log("[email] RESEND_API_KEY not configured — skipping announcement email");
      return false;
    }

    let settings = await getEmailSettings(params.orgId);

    // Build URLs
    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
    ).replace(/\/$/, "");
    const eventUrl = `${siteUrl}/event/${params.event.slug}`;
    const unsubscribeUrl = `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(params.unsubscribeToken)}&type=announcement`;

    // Load branding for accent color + org name
    let accentColor = settings.accent_color || "#8B5CF6";
    let orgName = settings.from_name || params.orgId;
    try {
      const sb = await getSupabaseAdmin();
      if (sb) {
        const { data: brandingData } = await sb
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", `${params.orgId}_branding`)
          .single();
        if (brandingData?.data) {
          const branding = brandingData.data as { accent_color?: string; org_name?: string };
          if (branding.accent_color) accentColor = branding.accent_color;
          if (branding.org_name) orgName = branding.org_name;
        }
      }
    } catch { /* branding not found — use defaults */ }

    // Format tickets_live_at for display
    let ticketsLiveAt = "TBC";
    if (params.event.tickets_live_at) {
      try {
        const d = new Date(params.event.tickets_live_at);
        const datePart = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        const timePart = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        ticketsLiveAt = `${datePart} at ${timePart}`;
      } catch {
        ticketsLiveAt = params.event.tickets_live_at;
      }
    }

    let emailLogoBase64: string | null = null;

    // Fetch email logo for CID inline embedding
    // Validate media key belongs to this org (keys are media_{orgId}_{name})
    try {
      const sb = await getSupabaseAdmin();
      if (sb && settings.logo_url) {
        const m = settings.logo_url.match(/\/api\/media\/(.+?)(?:\?.*)?$/);
        if (m && m[1].startsWith(`${params.orgId}_`)) {
          const { data: row } = await sb
            .from(TABLES.SITE_SETTINGS).select("data")
            .eq("key", `media_${m[1]}`).single();
          const d = row?.data as { image?: string } | null;
          if (d?.image) emailLogoBase64 = d.image;
        }
      }
    } catch { /* logo fetch failed */ }

    if (emailLogoBase64) {
      settings = { ...settings, logo_url: "cid:brand-logo" };
    }

    const announcementOpts: AnnouncementEmailOpts = {
      step: params.step,
      eventName: params.event.name,
      eventDate: formatEventDate(params.event.date_start),
      venue: params.event.venue_name || "",
      ticketsLiveAt,
      eventUrl,
      firstName: params.firstName,
      orgName,
      accentColor,
      logoUrl: settings.logo_url || undefined,
      unsubscribeUrl,
      customSubject: params.customSubject,
      customHeading: params.customHeading,
      customBody: params.customBody,
    };

    const { subject, html } = buildAnnouncementEmail(settings, announcementOpts);

    // Build attachments — logo only
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
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        ...(attachments.length > 0 ? { attachments } : {}),
      });

      if (!error) {
        console.log(
          `[email] Announcement step ${params.step} sent to ${params.email} for ${params.event.name}${attempt > 1 ? ` (attempt ${attempt})` : ""}`
        );
        return true;
      }

      lastError = error;
      const errMsg = typeof error === "object" && "message" in error ? error.message : String(error);
      console.warn(`[email] Announcement email attempt ${attempt}/${maxAttempts} failed:`, errMsg);

      if (typeof error === "object" && "name" in error && (error as { name: string }).name === "validation_error") {
        break;
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }

    const errMsg = lastError && typeof lastError === "object" && "message" in lastError
      ? (lastError as { message: string }).message
      : String(lastError);
    console.error(`[email] Announcement email failed for ${params.email}:`, errMsg);
    return false;
  } catch (err) {
    console.error(`[email] Failed to send announcement email for ${params.email}:`, err);
    return false;
  }
}

interface WaitlistEmailParams {
  orgId: string;
  email: string;
  firstName?: string;
  event: {
    name: string;
    slug: string;
    venue_name?: string | null;
    date_start?: string | null;
  };
  position?: number;
  customSubject?: string;
  customBody?: string;
}

interface WaitlistNotificationParams extends Omit<WaitlistEmailParams, "position"> {
  notificationUrl: string;
  tokenExpiresAt: string;
  customSubject?: string;
  customBody?: string;
}

function buildWaitlistConfirmationHtml(opts: {
  accentColor: string;
  logoUrl?: string;
  logoHeight: number;
  logoAspectRatio?: number;
  fromName: string;
  subject: string;
  eventName: string;
  eventDate: string;
  venue: string;
  position?: number;
  firstName?: string;
  bodyText: string;
  baseUrl: string;
  eventSlug: string;
}): string {
  const accent = opts.accentColor;
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : "You're on the list.";
  const eventDetails = [opts.eventDate, opts.venue].filter(Boolean).join(" · ");
  const logoHtml = opts.logoUrl
    ? `<img src="${opts.logoUrl}" alt="${opts.fromName}" height="${opts.logoHeight}" style="display:block;max-width:200px;">`
    : `<span style="font-family:monospace;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.15em;">${opts.fromName.toUpperCase()}</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${opts.subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;-webkit-font-smoothing:antialiased;color-scheme:light only;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.12);">
        <!-- DARK HERO -->
        <tr><td style="background-color:#0e0e0e;padding:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="height:4px;background-color:${accent};"></td></tr>
            <tr><td align="center" style="padding:32px 40px 24px;">${logoHtml}</td></tr>
            <tr><td align="center" style="padding:0 40px 8px;">
              <span style="display:inline-block;background-color:${accent};color:#ffffff;font-family:monospace;font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;padding:4px 12px;border-radius:4px;">WAITLIST</span>
            </td></tr>
            <tr><td align="center" style="padding:12px 40px 8px;">
              <h1 style="margin:0;font-family:monospace;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;line-height:1.2;">${greeting}</h1>
            </td></tr>
            ${opts.position !== undefined ? `<tr><td align="center" style="padding:6px 40px 16px;"><p style="margin:0;font-family:monospace;font-size:13px;color:rgba(255,255,255,0.5);letter-spacing:0.06em;">You are <strong style="color:${accent};">#${opts.position}</strong> on the waitlist</p></td></tr>` : `<tr><td style="height:16px;"></td></tr>`}
          </table>
        </td></tr>
        <!-- WHITE CONTENT -->
        <tr><td style="background-color:#ffffff;padding:32px 40px 28px;">
          <p style="margin:0 0 20px;font-family:system-ui,sans-serif;font-size:15px;color:#374151;line-height:1.6;">${opts.bodyText}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:24px;">
            <tr><td style="border-left:3px solid ${accent};padding:16px 20px;">
              <p style="margin:0 0 2px;font-family:monospace;font-size:10px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#9ca3af;">Event</p>
              <p style="margin:0;font-family:system-ui,sans-serif;font-size:15px;font-weight:600;color:#111827;">${opts.eventName}</p>
              ${eventDetails ? `<p style="margin:4px 0 0;font-family:system-ui,sans-serif;font-size:13px;color:#6b7280;">${eventDetails}</p>` : ""}
            </td></tr>
          </table>
          <p style="margin:0;font-family:system-ui,sans-serif;font-size:13px;color:#9ca3af;line-height:1.5;">We'll email you immediately if a space opens up. First come, first served.</p>
        </td></tr>
        <!-- FOOTER -->
        <tr><td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
          <p style="margin:0;font-family:system-ui,sans-serif;font-size:12px;color:#9ca3af;">Powered by Entry</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildWaitlistNotificationHtml(opts: {
  accentColor: string;
  logoUrl?: string;
  logoHeight: number;
  fromName: string;
  subject: string;
  eventName: string;
  eventDate: string;
  venue: string;
  firstName?: string;
  bodyText: string;
  notificationUrl: string;
  expiresDisplay: string;
}): string {
  const accent = opts.accentColor;
  const greeting = opts.firstName ? `Good news, ${opts.firstName}!` : "Good news!";
  const eventDetails = [opts.eventDate, opts.venue].filter(Boolean).join(" · ");
  const logoHtml = opts.logoUrl
    ? `<img src="${opts.logoUrl}" alt="${opts.fromName}" height="${opts.logoHeight}" style="display:block;max-width:200px;">`
    : `<span style="font-family:monospace;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.15em;">${opts.fromName.toUpperCase()}</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${opts.subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;-webkit-font-smoothing:antialiased;color-scheme:light only;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.12);">
        <!-- DARK HERO -->
        <tr><td style="background-color:#0e0e0e;padding:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="height:4px;background-color:${accent};"></td></tr>
            <tr><td align="center" style="padding:32px 40px 24px;">${logoHtml}</td></tr>
            <tr><td align="center" style="padding:0 40px 8px;">
              <span style="display:inline-block;background-color:${accent};color:#ffffff;font-family:monospace;font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;padding:4px 12px;border-radius:4px;">SPOT AVAILABLE</span>
            </td></tr>
            <tr><td align="center" style="padding:12px 40px 20px;">
              <h1 style="margin:0;font-family:monospace;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;line-height:1.2;">${greeting}</h1>
            </td></tr>
          </table>
        </td></tr>
        <!-- WHITE CONTENT -->
        <tr><td style="background-color:#ffffff;padding:32px 40px 28px;">
          <p style="margin:0 0 20px;font-family:system-ui,sans-serif;font-size:15px;color:#374151;line-height:1.6;">${opts.bodyText}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:24px;">
            <tr><td style="border-left:3px solid ${accent};padding:16px 20px;">
              <p style="margin:0 0 2px;font-family:monospace;font-size:10px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#9ca3af;">Event</p>
              <p style="margin:0;font-family:system-ui,sans-serif;font-size:15px;font-weight:600;color:#111827;">${opts.eventName}</p>
              ${eventDetails ? `<p style="margin:4px 0 0;font-family:system-ui,sans-serif;font-size:13px;color:#6b7280;">${eventDetails}</p>` : ""}
            </td></tr>
          </table>
          <!-- CTA BUTTON -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr><td align="center">
              <a href="${opts.notificationUrl}" style="display:inline-block;background-color:${accent};color:#ffffff;font-family:monospace;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 32px;border-radius:8px;">Get My Ticket</a>
            </td></tr>
          </table>
          <p style="margin:0;font-family:system-ui,sans-serif;font-size:12px;color:#9ca3af;text-align:center;line-height:1.5;">This offer expires ${opts.expiresDisplay}. First come, first served.</p>
        </td></tr>
        <!-- FOOTER -->
        <tr><td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
          <p style="margin:0;font-family:system-ui,sans-serif;font-size:12px;color:#9ca3af;">Powered by Entry</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendWaitlistConfirmationEmail(params: WaitlistEmailParams): Promise<boolean> {
  try {
    const resend = getResendClient();
    if (!resend) return false;

    const [settings] = await Promise.all([getEmailSettings(params.orgId)]);

    const accentColor = settings.accent_color || "#ff0033";
    const fromName = settings.from_name || params.orgId;
    const subject = params.customSubject
      ? params.customSubject
      : `You're on the waitlist — ${params.event.name}`;

    const bodyText = params.customBody
      || `A spot opened up or tickets became available, you'll be the first to know. We'll email you immediately — this is first come, first served, so make sure to act fast when you get the notification.`;

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://entry.events";

    let emailLogoBase64: string | null = null;
    const logoUrl = settings.logo_url;
    try {
      const sb = await getSupabaseAdmin();
      if (sb && logoUrl) {
        const m = logoUrl.match(/\/api\/media\/(.+?)(?:\?.*)?$/);
        if (m && m[1].startsWith(`${params.orgId}_`)) {
          const { data: row } = await sb.from(TABLES.SITE_SETTINGS).select("data").eq("key", `media_${m[1]}`).single();
          const d = row?.data as { image?: string } | null;
          if (d?.image) emailLogoBase64 = d.image;
        }
      }
    } catch { /* logo fetch failed */ }

    const resolvedLogoUrl = emailLogoBase64
      ? "cid:brand-logo"
      : logoUrl
        ? (logoUrl.startsWith("/") ? `${baseUrl}${logoUrl}` : logoUrl)
        : undefined;

    const html = buildWaitlistConfirmationHtml({
      accentColor,
      logoUrl: resolvedLogoUrl,
      logoHeight: Math.min(settings.logo_height || 48, 100),
      fromName,
      subject,
      eventName: params.event.name,
      eventDate: params.event.date_start ? formatEventDate(params.event.date_start) : "",
      venue: params.event.venue_name || "",
      position: params.position,
      firstName: params.firstName,
      bodyText,
      baseUrl,
      eventSlug: params.event.slug,
    });

    const attachments: { filename: string; content: Buffer; contentType?: string; contentId?: string }[] = [];
    if (emailLogoBase64) {
      const base64Match = emailLogoBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (base64Match) {
        attachments.push({ filename: "logo.png", content: Buffer.from(base64Match[2], "base64"), contentType: base64Match[1], contentId: "brand-logo" });
      }
    }

    const { error } = await resend.emails.send({
      from: `${settings.from_name} <${settings.from_email}>`,
      replyTo: settings.reply_to || undefined,
      to: [params.email],
      subject,
      html,
      ...(attachments.length > 0 ? { attachments } : {}),
    });

    if (error) {
      console.error(`[email] Waitlist confirmation failed for ${params.email}:`, error);
      return false;
    }

    console.log(`[email] Waitlist confirmation sent to ${params.email} for ${params.event.name}`);
    return true;
  } catch (err) {
    console.error(`[email] Failed to send waitlist confirmation to ${params.email}:`, err);
    return false;
  }
}

export async function sendWaitlistNotificationEmail(params: WaitlistNotificationParams): Promise<boolean> {
  try {
    const resend = getResendClient();
    if (!resend) return false;

    const settings = await getEmailSettings(params.orgId);

    const accentColor = settings.accent_color || "#ff0033";
    const subject = params.customSubject
      ? params.customSubject
      : `A spot has opened — ${params.event.name}`;

    const bodyText = params.customBody
      || `A space has opened up for ${params.event.name}. Use the button below to secure your ticket — this offer is available for a limited time, and it's first come, first served.`;

    let expiresDisplay = "in 48 hours";
    try {
      const d = new Date(params.tokenExpiresAt);
      const datePart = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      const timePart = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      expiresDisplay = `on ${datePart} at ${timePart}`;
    } catch { /* use fallback */ }

    let emailLogoBase64: string | null = null;
    const logoUrl = settings.logo_url;
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://entry.events";
    try {
      const sb = await getSupabaseAdmin();
      if (sb && logoUrl) {
        const m = logoUrl.match(/\/api\/media\/(.+?)(?:\?.*)?$/);
        if (m && m[1].startsWith(`${params.orgId}_`)) {
          const { data: row } = await sb.from(TABLES.SITE_SETTINGS).select("data").eq("key", `media_${m[1]}`).single();
          const d = row?.data as { image?: string } | null;
          if (d?.image) emailLogoBase64 = d.image;
        }
      }
    } catch { /* logo fetch failed */ }

    const resolvedLogoUrl = emailLogoBase64
      ? "cid:brand-logo"
      : logoUrl
        ? (logoUrl.startsWith("/") ? `${baseUrl}${logoUrl}` : logoUrl)
        : undefined;

    const html = buildWaitlistNotificationHtml({
      accentColor,
      logoUrl: resolvedLogoUrl,
      logoHeight: Math.min(settings.logo_height || 48, 100),
      fromName: settings.from_name || params.orgId,
      subject,
      eventName: params.event.name,
      eventDate: params.event.date_start ? formatEventDate(params.event.date_start) : "",
      venue: params.event.venue_name || "",
      firstName: params.firstName,
      bodyText,
      notificationUrl: params.notificationUrl,
      expiresDisplay,
    });

    const attachments: { filename: string; content: Buffer; contentType?: string; contentId?: string }[] = [];
    if (emailLogoBase64) {
      const base64Match = emailLogoBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (base64Match) {
        attachments.push({ filename: "logo.png", content: Buffer.from(base64Match[2], "base64"), contentType: base64Match[1], contentId: "brand-logo" });
      }
    }

    const { error } = await resend.emails.send({
      from: `${settings.from_name} <${settings.from_email}>`,
      replyTo: settings.reply_to || undefined,
      to: [params.email],
      subject,
      html,
      ...(attachments.length > 0 ? { attachments } : {}),
    });

    if (error) {
      console.error(`[email] Waitlist notification failed for ${params.email}:`, error);
      return false;
    }

    console.log(`[email] Waitlist notification sent to ${params.email} for ${params.event.name}`);
    return true;
  } catch (err) {
    console.error(`[email] Failed to send waitlist notification to ${params.email}:`, err);
    return false;
  }
}
