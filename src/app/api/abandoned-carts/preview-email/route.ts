import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, SETTINGS_KEYS, ORG_ID } from "@/lib/constants";
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
 * org's actual email settings + real event data when available.
 *
 * Query params:
 *   subject         — Email subject line
 *   preview_text    — Preview text for inbox
 *   greeting        — Custom greeting (supports {{name}} placeholder)
 *   body_message    — Custom body message
 *   discount_code   — Optional discount code
 *   discount_percent — Optional discount percentage
 *   use_real_event  — "1" to fetch a real event for preview data
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { searchParams } = request.nextUrl;
    const subject = searchParams.get("subject") || "You left something behind...";
    const previewText = searchParams.get("preview_text") || "Your tickets are still waiting";
    const greeting = searchParams.get("greeting") || "";
    const bodyMessage = searchParams.get("body_message") || "";
    const ctaText = searchParams.get("cta_text") || "";
    const discountCode = searchParams.get("discount_code") || "";
    const discountPercent = parseInt(searchParams.get("discount_percent") || "0", 10);
    const discountLabel = searchParams.get("discount_label") || "";
    const discountType = searchParams.get("discount_type") || "percentage";
    const discountFixedAmount = parseFloat(searchParams.get("discount_fixed_amount") || "0");
    const isOriginalDiscount = searchParams.get("is_original_discount") === "1";
    const useRealEvent = searchParams.get("use_real_event") === "1";

    // Load org email settings
    let emailSettings: EmailSettings = DEFAULT_EMAIL_SETTINGS;
    const supabase = await getSupabaseAdmin();

    // Fetch email settings + optional real event data
    let realEventData: AbandonedCartEmailData | null = null;

    if (supabase) {
      const { data: settingsData } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", SETTINGS_KEYS.EMAIL)
        .single();

      if (settingsData?.data) {
        emailSettings = { ...DEFAULT_EMAIL_SETTINGS, ...settingsData.data } as EmailSettings;
      }

      // Optionally fetch a real event for authentic preview data
      if (useRealEvent) {
        const { data: ev } = await supabase
          .from(TABLES.EVENTS)
          .select("name, venue_name, venue_city, date_start, doors_time, currency, slug")
          .eq("org_id", ORG_ID)
          .in("status", ["published", "active"])
          .order("date_start", { ascending: false })
          .limit(1)
          .single();

        if (ev) {
          const { data: tickets } = await supabase
            .from(TABLES.TICKET_TYPES)
            .select("name, price, includes_merch, merch_sizes, merch_name")
            .eq("event_id", ev.slug)
            .eq("status", "active")
            .order("price", { ascending: true })
            .limit(3);

          const currencySymbol = ev.currency === "EUR" ? "€" : ev.currency === "USD" ? "$" : "£";
          const venue = [ev.venue_name, ev.venue_city].filter(Boolean).join(", ");
          const eventDate = ev.date_start
            ? new Date(ev.date_start).toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : "TBC";

          const cartItems = tickets && tickets.length > 0
            ? tickets.map((t: { name: string; price: number; includes_merch: boolean; merch_sizes: string[] | null; merch_name: string | null }) => ({
                name: t.name,
                qty: t.includes_merch ? 1 : 2,
                unit_price: t.price / 100,
                merch_size: t.includes_merch && t.merch_sizes?.length ? t.merch_sizes[0] : undefined,
              }))
            : [{ name: "General Admission", qty: 2, unit_price: 25 }];

          const subtotal = cartItems.reduce((sum: number, item: { unit_price: number; qty: number }) => sum + item.unit_price * item.qty, 0);

          realEventData = {
            customer_first_name: "Alex",
            event_name: ev.name,
            venue_name: venue,
            event_date: eventDate,
            doors_time: ev.doors_time || undefined,
            currency_symbol: currencySymbol,
            cart_items: cartItems,
            subtotal: subtotal.toFixed(2),
            recovery_url: "#",
            unsubscribe_url: "#",
            discount_code: discountCode || undefined,
            discount_percent: discountPercent || undefined,
            discount_type: discountType,
            discount_fixed_amount: discountFixedAmount || undefined,
            is_original_discount: isOriginalDiscount,
          };
        }
      }
    }

    // Ensure logo_url is absolute using the request's own origin
    if (
      emailSettings.logo_url &&
      !emailSettings.logo_url.startsWith("http") &&
      !emailSettings.logo_url.startsWith("data:")
    ) {
      const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
      emailSettings = {
        ...emailSettings,
        logo_url: `${origin}${emailSettings.logo_url.startsWith("/") ? "" : "/"}${emailSettings.logo_url}`,
      };
    }

    // Fallback sample cart data
    const sampleCart: AbandonedCartEmailData = realEventData || {
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
      discount_type: discountType,
      discount_fixed_amount: discountFixedAmount || undefined,
      is_original_discount: isOriginalDiscount,
    };

    const { html } = buildAbandonedCartRecoveryEmail(emailSettings, sampleCart, {
      subject,
      preview_text: previewText,
      greeting: greeting || undefined,
      body_message: bodyMessage || undefined,
      cta_text: ctaText || undefined,
      discount_label: discountLabel || undefined,
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
