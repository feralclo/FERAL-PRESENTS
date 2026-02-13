import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { requireAuth } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES } from "@/lib/constants";
import { buildOrderConfirmationEmail } from "@/lib/email-templates";
import type { EmailSettings, OrderEmailData } from "@/types/email";
import { DEFAULT_EMAIL_SETTINGS } from "@/types/email";

/**
 * POST /api/email/test
 *
 * Sends a test order confirmation email with sample data.
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

    // Fetch current email settings
    let settings: EmailSettings = DEFAULT_EMAIL_SETTINGS;
    try {
      const supabase = await getSupabaseServer();
      if (supabase) {
        const { data } = await supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", "feral_email")
          .single();
        if (data?.data && typeof data.data === "object") {
          settings = { ...DEFAULT_EMAIL_SETTINGS, ...(data.data as Partial<EmailSettings>) };
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
    if (settings.logo_url && !settings.logo_url.startsWith("http")) {
      const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
      if (siteUrl) {
        settings = {
          ...settings,
          logo_url: `${siteUrl}${settings.logo_url.startsWith("/") ? "" : "/"}${settings.logo_url}`,
        };
      }
    }

    const { subject, html, text } = buildOrderConfirmationEmail(settings, sampleOrder);

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: `${settings.from_name} <${settings.from_email}>`,
      to: [to],
      subject: `[TEST] ${subject}`,
      html,
      text,
      replyTo: settings.reply_to || undefined,
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
