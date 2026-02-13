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
  logo_height: number;     // Logo height in pixels (24–80, default 48)
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

/**
 * PDF ticket design settings stored in site_settings (key: feral_pdf_ticket).
 * Controls the visual layout of A5 PDF tickets generated for customers.
 */
export interface PdfTicketSettings {
  brand_name: string;            // Text at top of ticket (e.g. "FERAL PRESENTS")
  logo_url?: string;             // Optional logo image URL (replaces brand_name text)
  logo_height: number;           // Logo height in mm on the PDF (8–40, default 12)
  accent_color: string;          // Accent bars + ticket code color (hex)
  bg_color: string;              // Background color (hex)
  text_color: string;            // Primary text color (hex)
  secondary_color: string;       // Secondary text (venue, date, etc.)
  qr_size: number;               // QR code size in mm (30–70, default 50)
  show_holder: boolean;          // Show ticket holder name
  show_order: boolean;           // Show order number
  show_disclaimer: boolean;      // Show disclaimer text at bottom
  disclaimer_line1: string;      // First disclaimer line
  disclaimer_line2: string;      // Second disclaimer line
}

/** Default PDF ticket settings */
export const DEFAULT_PDF_TICKET_SETTINGS: PdfTicketSettings = {
  brand_name: "FERAL PRESENTS",
  logo_height: 12,
  accent_color: "#ff0033",
  bg_color: "#0e0e0e",
  text_color: "#ffffff",
  secondary_color: "#969696",
  qr_size: 50,
  show_holder: true,
  show_order: true,
  show_disclaimer: true,
  disclaimer_line1: "THIS TICKET IS VALID FOR ONE ENTRY ONLY",
  disclaimer_line2: "PRESENT THIS QR CODE AT THE DOOR FOR SCANNING",
};

/** Default email settings for new orgs */
export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  order_confirmation_enabled: true,
  from_name: "FERAL PRESENTS",
  from_email: "tickets@feralpresents.com",
  logo_height: 48,
  accent_color: "#ff0033",
  order_confirmation_subject: "Your tickets for {{event_name}}",
  order_confirmation_heading: "You're in.",
  order_confirmation_message:
    "Your order is confirmed and your tickets are attached to this email. Present your QR code at the door for entry.",
  footer_text: "FERAL PRESENTS",
};
