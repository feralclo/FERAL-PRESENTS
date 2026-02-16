import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, SETTINGS_KEYS } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import {
  buildAbandonedCartRecoveryEmail,
  type AbandonedCartEmailData,
} from "@/lib/email-templates";
import type { EmailSettings } from "@/types/email";
import { DEFAULT_EMAIL_SETTINGS } from "@/types/email";

/**
 * GET /api/abandoned-carts/preview-email — Render abandoned cart email preview
 *
 * Returns the rendered HTML for the abandoned cart recovery email using the
 * org's actual email settings + sample data, with step config overridable
 * via query params.
 *
 * Query params:
 *   subject        — Email subject line
 *   preview_text   — Preview text for inbox
 *   discount_code  — Optional discount code
 *   discount_percent — Optional discount percentage
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { searchParams } = request.nextUrl;
    const subject = searchParams.get("subject") || "You left something behind...";
    const previewText = searchParams.get("preview_text") || "Your tickets are still waiting";
    const discountCode = searchParams.get("discount_code") || "";
    const discountPercent = parseInt(searchParams.get("discount_percent") || "0", 10);

    // Load org email settings
    let emailSettings: EmailSettings = DEFAULT_EMAIL_SETTINGS;
    const supabase = await getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", SETTINGS_KEYS.EMAIL)
        .single();
      if (data?.data) {
        emailSettings = { ...DEFAULT_EMAIL_SETTINGS, ...data.data };
      }
    }

    // Sample cart data for preview
    const sampleCart: AbandonedCartEmailData = {
      customer_first_name: "Alex",
      event_name: "Midnight Rave — Vol. 3",
      venue_name: "The Warehouse, London",
      event_date: "Saturday 15 March 2026",
      doors_time: "10:00 PM",
      currency_symbol: "£",
      cart_items: [
        { name: "Early Bird Ticket", qty: 2, unit_price: 25 },
        { name: "VIP + Merch Bundle", qty: 1, unit_price: 55, merch_size: "M" },
      ],
      subtotal: "105.00",
      recovery_url: "#",
      unsubscribe_url: "#",
      discount_code: discountCode || undefined,
      discount_percent: discountPercent || undefined,
    };

    const { html } = buildAbandonedCartRecoveryEmail(emailSettings, sampleCart, {
      subject,
      preview_text: previewText,
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
