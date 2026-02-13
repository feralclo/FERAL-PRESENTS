import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { requireAuth } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES } from "@/lib/constants";
import { buildOrderConfirmationEmail } from "@/lib/email-templates";
import { generateTicketsPDF, getSiteUrl, type TicketPDFData } from "@/lib/pdf";
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

    // Resolve relative logo URL to absolute — email clients need full URLs
    if (emailSettings.logo_url && !emailSettings.logo_url.startsWith("http")) {
      const siteUrl = getSiteUrl();
      if (siteUrl) {
        emailSettings = {
          ...emailSettings,
          logo_url: `${siteUrl}${emailSettings.logo_url.startsWith("/") ? "" : "/"}${emailSettings.logo_url}`,
        };
      }
    }

    const { subject, html, text } = buildOrderConfirmationEmail(emailSettings, sampleOrder);

    // Fetch PDF logo base64 directly from DB (avoids self-fetch on serverless)
    let logoDataUrl: string | null = null;
    if (pdfSettings.logo_url) {
      const supabase = await getSupabaseServer();
      const mediaMatch = pdfSettings.logo_url.match(/\/api\/media\/(.+)$/);
      if (mediaMatch && supabase) {
        try {
          const { data: mediaRow } = await supabase
            .from(TABLES.SITE_SETTINGS)
            .select("data")
            .eq("key", `media_${mediaMatch[1]}`)
            .single();
          const mediaData = mediaRow?.data as { image?: string } | null;
          if (mediaData?.image) logoDataUrl = mediaData.image;
        } catch { /* logo fetch failed */ }
      }
    }

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

    const pdfBuffer = await generateTicketsPDF(sampleTickets, pdfSettings, logoDataUrl);

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: `${emailSettings.from_name} <${emailSettings.from_email}>`,
      to: [to],
      subject: `[TEST] ${subject}`,
      html,
      text,
      replyTo: emailSettings.reply_to || undefined,
      attachments: [
        {
          filename: `${sampleOrder.order_number}-tickets.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
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
