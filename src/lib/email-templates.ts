import type {
  EmailSettings,
  EmailTemplateVars,
  OrderEmailData,
} from "@/types/email";
import { DEFAULT_EMAIL_SETTINGS } from "@/types/email";

/**
 * Replace {{variable}} placeholders in a template string.
 */
export function replaceTemplateVars(
  template: string,
  vars: EmailTemplateVars
): string {
  return template
    .replace(/\{\{customer_name\}\}/g, vars.customer_name)
    .replace(/\{\{event_name\}\}/g, vars.event_name)
    .replace(/\{\{venue_name\}\}/g, vars.venue_name)
    .replace(/\{\{event_date\}\}/g, vars.event_date)
    .replace(/\{\{order_number\}\}/g, vars.order_number)
    .replace(/\{\{ticket_count\}\}/g, vars.ticket_count);
}

/**
 * Build the HTML for an order confirmation email.
 *
 * Design:
 * - Light background for universal email client compatibility
 * - Org's accent color for header bar, buttons, ticket codes
 * - Table-based layout for Outlook/Gmail compatibility
 * - All styles inline (no CSS classes)
 * - Responsive via fluid widths
 */
/** Resolve relative URLs to absolute (email clients can't use relative URLs). */
function resolveUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http") || url.startsWith("data:") || url.startsWith("cid:")) return url;
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  ).replace(/\/$/, "");
  if (!siteUrl) return url;
  return `${siteUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Optional wallet pass URLs to include in the email */
export interface EmailWalletLinks {
  appleWalletUrl?: string;   // Direct download URL for .pkpass file
  googleWalletUrl?: string;  // Google Wallet "Save" URL
}

export function buildOrderConfirmationEmail(
  settings: EmailSettings,
  order: OrderEmailData,
  walletLinks?: EmailWalletLinks,
): { subject: string; html: string; text: string } {
  const s = { ...DEFAULT_EMAIL_SETTINGS, ...settings };
  const accent = s.accent_color || "#ff0033";
  const logoUrl = resolveUrl(s.logo_url);

  // Calculate exact logo dimensions (same approach as PDF generator)
  // This ensures the email renders at exactly the same size as the preview.
  const configuredH = Math.min(s.logo_height || 48, 100);
  let logoH = configuredH;
  let logoW: number | undefined;
  if (s.logo_aspect_ratio && logoUrl) {
    logoW = Math.round(configuredH * s.logo_aspect_ratio);
    if (logoW > 280) {
      logoW = 280;
      logoH = Math.round(280 / s.logo_aspect_ratio);
    }
  }

  const vars: EmailTemplateVars = {
    customer_name: order.customer_first_name,
    event_name: order.event_name,
    venue_name: order.venue_name,
    event_date: order.event_date,
    order_number: order.order_number,
    ticket_count: String(order.tickets.length),
  };

  const subject = replaceTemplateVars(s.order_confirmation_subject, vars);
  const heading = replaceTemplateVars(s.order_confirmation_heading, vars);
  const message = replaceTemplateVars(s.order_confirmation_message, vars);

  // Event details line
  const eventDetails = [order.event_date, order.venue_name]
    .filter(Boolean)
    .join(" · ");
  const doorsLine = order.doors_time ? `Doors ${order.doors_time}` : "";

  // Build ticket rows HTML
  const hasMerch = order.tickets.some((t) => t.merch_size);
  const ticketRowsHtml = order.tickets
    .map(
      (t) => `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0;">
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #666; margin-bottom: 2px;">
            ${escapeHtml(t.ticket_type)}${t.merch_size ? ` · Size ${escapeHtml(t.merch_size)}` : ""}
          </div>
          <div style="font-family: 'Courier New', monospace; font-size: 16px; font-weight: 700; color: ${accent}; letter-spacing: 1px;">
            ${escapeHtml(t.ticket_code)}
          </div>${t.merch_size ? `
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #999; margin-top: 4px;">
            Includes merch — present QR to collect
          </div>` : ""}
        </td>
      </tr>`
    )
    .join("");

  // Build ticket codes for plain text
  const ticketCodesText = order.tickets
    .map(
      (t) =>
        `  ${t.ticket_type}${t.merch_size ? ` (Size ${t.merch_size})` : ""}: ${t.ticket_code}`
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${escapeHtml(subject)}</title>
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

          <!-- Header (fixed 120px — logo scales inside, container never changes) -->
          <!-- Dark bg uses linear-gradient so dark mode engines treat it as an image and won't invert -->
          <tr>
            <td style="height: 120px; padding: 0 32px; text-align: center; vertical-align: middle;${logoUrl ? " background-color: #0e0e0e; background-image: linear-gradient(#0e0e0e, #0e0e0e);" : ""}">
              ${
                logoUrl
                  ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(s.from_name)}"${logoW ? ` width="${logoW}"` : ""} height="${logoH}" style="${logoW ? `width: ${logoW}px` : "width: auto"}; height: ${logoH}px; display: inline-block;">`
                  : `<div style="font-family: 'Courier New', monospace; font-size: 14px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #111;">${escapeHtml(s.from_name)}</div>`
              }
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding: 20px 32px 8px; text-align: center;">
              <h1 style="margin: 0; font-family: 'Courier New', monospace; font-size: 24px; font-weight: 700; color: #111; letter-spacing: 1px;">
                ${escapeHtml(heading)}
              </h1>
            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #555;">
                ${escapeHtml(message)}
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="height: 1px; background-color: #eee;"></div>
            </td>
          </tr>

          <!-- Event Details -->
          <tr>
            <td style="padding: 24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-family: 'Courier New', monospace; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #999; margin-bottom: 8px;">
                      EVENT
                    </div>
                    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 17px; font-weight: 600; color: #111; margin-bottom: 4px;">
                      ${escapeHtml(order.event_name)}
                    </div>
                    ${
                      eventDetails
                        ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #666; margin-bottom: 2px;">${escapeHtml(eventDetails)}</div>`
                        : ""
                    }
                    ${
                      doorsLine
                        ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #666;">${escapeHtml(doorsLine)}</div>`
                        : ""
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="height: 1px; background-color: #eee;"></div>
            </td>
          </tr>

          <!-- Order Info -->
          <tr>
            <td style="padding: 24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-family: 'Courier New', monospace; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #999; margin-bottom: 12px;">
                      ORDER DETAILS
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #666; padding: 4px 0;">
                          Order
                        </td>
                        <td style="font-family: 'Courier New', monospace; font-size: 14px; font-weight: 700; color: #111; text-align: right; padding: 4px 0;">
                          ${escapeHtml(order.order_number)}
                        </td>
                      </tr>
                      <tr>
                        <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #666; padding: 4px 0;">
                          Tickets
                        </td>
                        <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #111; text-align: right; padding: 4px 0;">
                          ${order.tickets.length}
                        </td>
                      </tr>
                      <tr>
                        <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #666; padding: 4px 0; border-top: 1px solid #eee; padding-top: 8px;">
                          Total
                        </td>
                        <td style="font-family: 'Courier New', monospace; font-size: 18px; font-weight: 700; color: #111; text-align: right; padding: 4px 0; border-top: 1px solid #eee; padding-top: 8px;">
                          ${escapeHtml(order.currency_symbol)}${escapeHtml(order.total)}
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
            <td style="padding: 0 32px;">
              <div style="height: 1px; background-color: #eee;"></div>
            </td>
          </tr>

          <!-- Tickets -->
          <tr>
            <td style="padding: 24px 32px 16px;">
              <div style="font-family: 'Courier New', monospace; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #999; margin-bottom: 12px;">
                YOUR TICKETS
              </div>
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #888; margin-bottom: 16px;">
                Your PDF tickets with QR codes are attached to this email.
              </div>
            </td>
          </tr>

          <!-- Ticket List -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #fafafa; border-radius: 6px; border: 1px solid #f0f0f0;">
                ${ticketRowsHtml}
              </table>
            </td>
          </tr>

          ${hasMerch ? `
          <!-- Merch collection note -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #888; background: #fafafa; border-radius: 6px; border: 1px solid #f0f0f0; padding: 12px 16px;">
                <strong style="color: #666;">Merch collection</strong> — Your order includes merch. Present the QR code on your ticket at the merch desk to collect your items.
              </div>
            </td>
          </tr>
          ` : ""}

          ${walletLinks?.appleWalletUrl || walletLinks?.googleWalletUrl ? `
          <!-- Wallet Passes -->
          <tr>
            <td style="padding: 0 32px 8px;">
              <div style="font-family: 'Courier New', monospace; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #999; margin-bottom: 12px;">
                ADD TO WALLET
              </div>
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #888; margin-bottom: 16px;">
                Save your ${order.tickets.length > 1 ? "tickets" : "ticket"} to your phone for quick access at the door.
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px; text-align: center;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  ${walletLinks.appleWalletUrl ? `
                  <td style="padding: 0 ${walletLinks.googleWalletUrl ? "6px" : "0"} 0 0;">
                    <a href="${escapeHtml(walletLinks.appleWalletUrl)}" style="display: inline-block; text-decoration: none;" target="_blank">
                      <table role="presentation" cellpadding="0" cellspacing="0" style="border-radius: 8px; overflow: hidden; background-color: #000000;">
                        <tr>
                          <td style="padding: 10px 20px; text-align: center;">
                            <div style="font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 10px; color: #ffffff; letter-spacing: 0.3px; line-height: 1;">Add to</div>
                            <div style="font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; font-weight: 600; color: #ffffff; line-height: 1.3; letter-spacing: -0.2px;">Apple Wallet</div>
                          </td>
                        </tr>
                      </table>
                    </a>
                  </td>
                  ` : ""}
                  ${walletLinks.googleWalletUrl ? `
                  <td style="padding: 0 0 0 ${walletLinks.appleWalletUrl ? "6px" : "0"};">
                    <a href="${escapeHtml(walletLinks.googleWalletUrl)}" style="display: inline-block; text-decoration: none;" target="_blank">
                      <table role="presentation" cellpadding="0" cellspacing="0" style="border-radius: 8px; overflow: hidden; background-color: #000000;">
                        <tr>
                          <td style="padding: 10px 20px; text-align: center;">
                            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; color: #ffffff; letter-spacing: 0.3px; line-height: 1;">Save to</div>
                            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 16px; font-weight: 600; color: #ffffff; line-height: 1.3; letter-spacing: -0.2px;">Google Wallet</div>
                          </td>
                        </tr>
                      </table>
                    </a>
                  </td>
                  ` : ""}
                </tr>
              </table>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="height: 1px; background-color: #eee;"></div>
            </td>
          </tr>
          ` : ""}

          <!-- CTA -->
          <tr>
            <td style="padding: ${walletLinks?.appleWalletUrl || walletLinks?.googleWalletUrl ? "16px" : "0"} 32px 32px; text-align: center;">
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #999; margin-bottom: 12px;">
                Present your QR code at the door for scanning.
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #fafafa; border-top: 1px solid #f0f0f0; text-align: center;">
              <div style="font-family: 'Courier New', monospace; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #aaa; margin-bottom: 4px;">
                ${escapeHtml(s.footer_text || s.from_name)}
              </div>
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #bbb;">
                This is an automated order confirmation. Please do not reply directly to this email.
              </div>
            </td>
          </tr>

        </table>
        <!-- /Container -->

      </td>
    </tr>
  </table>
  <!-- /Wrapper -->
</body>
</html>`;

  const walletTextSection = walletLinks?.appleWalletUrl || walletLinks?.googleWalletUrl
    ? `\nADD TO WALLET${walletLinks.appleWalletUrl ? `\nApple Wallet: ${walletLinks.appleWalletUrl}` : ""}${walletLinks.googleWalletUrl ? `\nGoogle Wallet: ${walletLinks.googleWalletUrl}` : ""}\n`
    : "";

  const text = `${heading}

${message}

---

EVENT
${order.event_name}
${eventDetails}${doorsLine ? `\n${doorsLine}` : ""}

ORDER DETAILS
Order: ${order.order_number}
Tickets: ${order.tickets.length}
Total: ${order.currency_symbol}${order.total}

YOUR TICKETS
${ticketCodesText}

Your PDF tickets with QR codes are attached to this email.
${hasMerch ? "\nMERCH COLLECTION: Your order includes merch. Present the QR code on your ticket at the merch desk to collect your items.\n" : ""}${walletTextSection}
Present your QR code at the door for scanning.

---
${s.footer_text || s.from_name}`;

  return { subject, html, text };
}

/** Escape HTML special characters to prevent XSS in email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
