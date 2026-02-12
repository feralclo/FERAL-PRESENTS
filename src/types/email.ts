/**
 * Email settings stored in site_settings table (key: feral_email).
 * Each org/promoter configures their own email branding and templates.
 * Designed for multi-tenant use — promoters customize this from their admin dashboard.
 */
export interface EmailSettings {
  // Master toggle
  order_confirmation_enabled: boolean;

  // Sender identity
  from_name: string;       // e.g. "FERAL PRESENTS"
  from_email: string;      // e.g. "tickets@feralpresents.com"
  reply_to?: string;       // Where customer replies go

  // Branding
  logo_url?: string;       // Logo for email header (URL)
  accent_color: string;    // Brand color (hex, e.g. "#ff0033")

  // Order confirmation template (supports {{variables}})
  order_confirmation_subject: string;  // e.g. "Your tickets for {{event_name}}"
  order_confirmation_heading: string;  // e.g. "You're in!"
  order_confirmation_message: string;  // Custom body paragraph

  // Footer
  footer_text: string;     // e.g. "FERAL PRESENTS"
  footer_url?: string;     // Link back to site
}

/** Template variables available in email subject/body */
export interface EmailTemplateVars {
  customer_name: string;
  event_name: string;
  venue_name: string;
  event_date: string;
  order_number: string;
  ticket_count: string;
}

/** Data passed to the order confirmation email builder */
export interface OrderEmailData {
  order_number: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  event_name: string;
  venue_name: string;
  event_date: string;
  doors_time?: string;
  currency_symbol: string;
  total: string;
  tickets: {
    ticket_code: string;
    ticket_type: string;
    merch_size?: string;
  }[];
}

/** Default email settings for new orgs */
export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  order_confirmation_enabled: true,
  from_name: "FERAL PRESENTS",
  from_email: "tickets@feralpresents.com",
  accent_color: "#ff0033",
  order_confirmation_subject: "Your tickets for {{event_name}}",
  order_confirmation_heading: "You're in.",
  order_confirmation_message:
    "Your order is confirmed and your tickets are attached to this email. Present your QR code at the door for entry.",
  footer_text: "FERAL PRESENTS",
};
