import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { requireAuth } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES } from "@/lib/constants";
import { buildOrderConfirmationEmail } from "@/lib/email-templates";
import { generateTicketsPDF, type TicketPDFData } from "@/lib/pdf";
import type { EmailSettings, OrderEmailData, PdfTicketSettings } from "@/types/email";
import { DEFAULT_EMAIL_SETTINGS, DEFAULT_PDF_TICKET_SETTINGS } from "@/types/email";

/**
 * POST /api/email/test
 *
 * Sends a test order confirmation email with sample data and a demo PDF ticket.
 * Requires admin auth and a valid Resend API key.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = await request.json();
    const to = body.to;

    if (!to || typeof to !== "string" || !to.includes("@")) {
      return NextResponse.json({ error: "Valid email address required" }, { status: 400 });
    }

    // Check Resend is configured
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY not configured" },
        { status: 503 }
      );
    }

    // Fetch email + PDF ticket settings in parallel
    let emailSettings: EmailSettings = DEFAULT_EMAIL_SETTINGS;
    let pdfSettings: PdfTicketSettings = DEFAULT_PDF_TICKET_SETTINGS;

    try {
      const supabase = await getSupabaseServer();
      if (supabase) {
        const [emailResult, pdfResult] = await Promise.all([
          supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", "feral_email").single(),
          supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", "feral_pdf_ticket").single(),
        ]);

        if (emailResult.data?.data && typeof emailResult.data.data === "object") {
          emailSettings = { ...DEFAULT_EMAIL_SETTINGS, ...(emailResult.data.data as Partial<EmailSettings>) };
        }
        if (pdfResult.data?.data && typeof pdfResult.data.data === "object") {
          pdfSettings = { ...DEFAULT_PDF_TICKET_SETTINGS, ...(pdfResult.data.data as Partial<PdfTicketSettings>) };
        }
      }
    } catch {
      // Use defaults
    }

    // Sample order data for the test email
    const sampleOrder: OrderEmailData = {
      order_number: "FERAL-00042",
      customer_first_name: "Alex",
      customer_last_name: "Test",
      customer_email: to,
      event_name: "FERAL Liverpool",
      venue_name: "Invisible Wind Factory",
      event_date: "Thursday 27 March 2026",
      doors_time: "9:30PM — 4:00AM",
      currency_symbol: "£",
      total: "52.92",
      tickets: [
        { ticket_code: "FERAL-A1B2C3D4", ticket_type: "General Release" },
        { ticket_code: "FERAL-E5F6G7H8", ticket_type: "General Release" },
      ],
    };

    // Fetch logo base64 from DB for both email CID and PDF embedding
    let emailLogoBase64: string | null = null;
    let pdfLogoBase64: string | null = null;

    try {
      const supabase = await getSupabaseServer();
      if (supabase) {
        // Email logo
        if (emailSettings.logo_url) {
          const m = emailSettings.logo_url.match(/\/api\/media\/(.+)$/);
          if (m) {
            const { data: row } = await supabase
              .from(TABLES.SITE_SETTINGS).select("data")
              .eq("key", `media_${m[1]}`).single();
            const d = row?.data as { image?: string } | null;
            if (d?.image) emailLogoBase64 = d.image;
          }
        }
        // PDF logo (may be same or different key)
        if (pdfSettings.logo_url) {
          const m = pdfSettings.logo_url.match(/\/api\/media\/(.+)$/);
          if (m) {
            const { data: row } = await supabase
              .from(TABLES.SITE_SETTINGS).select("data")
              .eq("key", `media_${m[1]}`).single();
            const d = row?.data as { image?: string } | null;
            if (d?.image) pdfLogoBase64 = d.image;
          }
        }
      }
    } catch { /* logo fetch failed, emails will use text fallback */ }

    // Use CID (Content-ID) for email logo — works in all email clients
    if (emailLogoBase64) {
      emailSettings = { ...emailSettings, logo_url: "cid:brand-logo" };
    }

    const { subject, html, text } = buildOrderConfirmationEmail(emailSettings, sampleOrder);

    // Generate demo PDF ticket with sample data + real QR codes
    const sampleTickets: TicketPDFData[] = sampleOrder.tickets.map((t) => ({
      ticketCode: t.ticket_code,
      eventName: sampleOrder.event_name,
      eventDate: sampleOrder.event_date,
      venueName: sampleOrder.venue_name,
      ticketType: t.ticket_type,
      holderName: `${sampleOrder.customer_first_name} ${sampleOrder.customer_last_name}`,
      orderNumber: sampleOrder.order_number,
    }));

    const pdfBuffer = await generateTicketsPDF(sampleTickets, pdfSettings, pdfLogoBase64);

    // Build attachments
    const attachments: { filename: string; content: Buffer | string; contentType?: string; cid?: string }[] = [
      {
        filename: `${sampleOrder.order_number}-tickets.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ];

    // Add logo as inline CID attachment if available
    if (emailLogoBase64) {
      const base64Match = emailLogoBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (base64Match) {
        attachments.push({
          filename: "logo.png",
          content: Buffer.from(base64Match[2], "base64"),
          contentType: base64Match[1],
          cid: "brand-logo",
        });
      }
    }

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: `${emailSettings.from_name} <${emailSettings.from_email}>`,
      to: [to],
      subject: `[TEST] ${subject}`,
      html,
      text,
      replyTo: emailSettings.reply_to || undefined,
      attachments,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to send email" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
