import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendAbandonedCartRecoveryEmail } from "@/lib/email";
import { requireAuth } from "@/lib/auth";
import { TABLES } from "@/lib/constants";

/**
 * POST /api/abandoned-carts/send-test
 *
 * Sends a real abandoned cart recovery email using data from the most recent
 * abandoned cart, but delivers it to a test email address (not the customer).
 *
 * Admin-only. Used for previewing the actual email in a real inbox.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const orgId = auth.orgId;

  try {
    const body = await request.json();
    const { test_email, step_config } = body;

    if (!test_email || !step_config) {
      return NextResponse.json(
        { error: "test_email and step_config are required" },
        { status: 400 },
      );
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 },
      );
    }

    // Find the most recent abandoned cart with real data
    const { data: cart, error: cartErr } = await supabase
      .from(TABLES.ABANDONED_CARTS)
      .select(`
        id, email, first_name, items, subtotal, currency, cart_token,
        events:event_id ( id, name, slug, venue_name, date_start, doors_time, currency )
      `)
      .eq("org_id", orgId)
      .eq("status", "abandoned")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (cartErr || !cart) {
      return NextResponse.json(
        { error: "No abandoned carts found to use as test data" },
        { status: 404 },
      );
    }

    const event = cart.events as unknown as {
      id: string;
      name: string;
      slug: string;
      venue_name?: string;
      date_start?: string;
      doors_time?: string;
      currency?: string;
    } | null;

    if (!event || !event.slug) {
      return NextResponse.json(
        { error: "Most recent abandoned cart has no event data" },
        { status: 404 },
      );
    }

    const items = (cart.items as { name: string; qty: number; price: number; merch_size?: string }[]) || [];

    // Send the email to the TEST address, not the customer
    const sent = await sendAbandonedCartRecoveryEmail({
      orgId,
      cartId: cart.id,
      email: test_email.toLowerCase().trim(),
      firstName: cart.first_name || undefined,
      event: {
        name: event.name,
        slug: event.slug,
        venue_name: event.venue_name,
        date_start: event.date_start,
        doors_time: event.doors_time,
        currency: event.currency,
      },
      items,
      subtotal: cart.subtotal,
      currency: cart.currency || event.currency || "GBP",
      cartToken: cart.cart_token || "test-preview",
      stepConfig: {
        subject: step_config.subject || "Test: Abandoned Cart Recovery",
        preview_text: step_config.preview_text || "",
        include_discount: step_config.include_discount || false,
        discount_code: step_config.discount_code || undefined,
        discount_percent: step_config.discount_percent || undefined,
        cta_text: step_config.cta_text || undefined,
        discount_label: step_config.discount_label || undefined,
        greeting: step_config.greeting || undefined,
        body_message: step_config.body_message || undefined,
      },
    });

    if (!sent) {
      return NextResponse.json(
        { error: "Failed to send email — check Resend configuration" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      sent_to: test_email,
      used_cart: {
        email: cart.email,
        event_name: event.name,
        items_count: items.length,
      },
    });
  } catch (err) {
    console.error("[send-test] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
