import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
    const includeMerch = body.includeMerch === true;

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
    let emailLogoBase64: string | null = null;
    let pdfLogoBase64: string | null = null;

    try {
      const supabase = getSupabaseAdmin();
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

        // Fetch email logo base64 directly from DB (avoids serverless self-fetch + URL dependency)
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

        // Fetch PDF logo base64 directly from DB
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
    } catch {
      // Use defaults
    }

    // Embed email logo as CID inline attachment.
    //
    // WHY CID: Hosted URLs require NEXT_PUBLIC_SITE_URL or VERCEL_URL to be set,
    // and the email client must be able to fetch the URL. CID embeds the image
    // directly in the email — zero external dependencies, works everywhere.
    //
    // WHY contentId (not cid): Resend SDK uses `contentId` property (camelCase).
    // When set, Resend marks the attachment as Content-Disposition: inline with a
    // Content-ID header. Email clients render it inline and do NOT show it in the
    // attachment list. This is the standard MIME mechanism for inline images.
    if (emailLogoBase64) {
      emailSettings = { ...emailSettings, logo_url: "cid:brand-logo" };
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
      tickets: includeMerch
        ? [
            { ticket_code: "FERAL-A1B2C3D4", ticket_type: "GA + Tee", merch_size: "M", merch_name: "FERAL Tee" },
            { ticket_code: "FERAL-E5F6G7H8", ticket_type: "General Release" },
          ]
        : [
            { ticket_code: "FERAL-A1B2C3D4", ticket_type: "General Release" },
            { ticket_code: "FERAL-E5F6G7H8", ticket_type: "General Release" },
          ],
    };

    const { subject, html, text } = buildOrderConfirmationEmail(emailSettings, sampleOrder);

    // Generate demo PDF ticket
    const sampleTickets: TicketPDFData[] = sampleOrder.tickets.map((t) => ({
      ticketCode: t.ticket_code,
      eventName: sampleOrder.event_name,
      eventDate: sampleOrder.event_date,
      venueName: sampleOrder.venue_name,
      ticketType: t.ticket_type,
      holderName: `${sampleOrder.customer_first_name} ${sampleOrder.customer_last_name}`,
      orderNumber: sampleOrder.order_number,
      merchSize: t.merch_size,
      merchName: t.merch_name,
    }));

    const pdfBuffer = await generateTicketsPDF(sampleTickets, pdfSettings, pdfLogoBase64);

    // Build attachments
    const attachments: { filename: string; content: Buffer; contentType?: string; contentId?: string }[] = [
      {
        filename: `${sampleOrder.order_number}-tickets.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ];

    // Add logo as inline CID attachment — contentId tells Resend to set
    // Content-Disposition: inline so it renders in the body, not the attachment list
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
