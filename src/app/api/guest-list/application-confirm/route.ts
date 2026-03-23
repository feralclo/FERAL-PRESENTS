import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getStripe } from "@/lib/stripe/server";
import { issueGuestListTicket } from "@/lib/guest-list";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/guest-list/application-confirm — Confirm payment and issue ticket
 * Body: { payment_intent_id, token }
 * Public — no auth required (token is the access control)
 */
export async function POST(request: NextRequest) {
  try {
    const { payment_intent_id, token } = await request.json();

    if (!payment_intent_id || !token) {
      return NextResponse.json({ error: "Missing payment_intent_id or token" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    // Find guest entry
    const { data: guest, error: gErr } = await supabase
      .from(TABLES.GUEST_LIST)
      .select("*, event:events(id, name, slug, currency, venue_name, date_start, doors_time, stripe_account_id)")
      .eq("invite_token", token)
      .single();

    if (gErr || !guest) return NextResponse.json({ error: "Invalid token" }, { status: 404 });

    // Already has a ticket
    if (guest.order_id) {
      return NextResponse.json({ success: true, message: "Ticket already issued." });
    }

    const orgId = guest.org_id as string;
    const event = guest.event as {
      id: string; name: string; slug?: string; currency?: string;
      venue_name?: string; date_start?: string; doors_time?: string;
      stripe_account_id?: string;
    };

    // Resolve Stripe account to verify payment
    let stripeAccountId = event.stripe_account_id || null;
    if (!stripeAccountId) {
      const { data: stripeRow } = await supabase.from(TABLES.SITE_SETTINGS)
        .select("data").eq("key", `${orgId}_stripe_account`).single();
      stripeAccountId = (stripeRow?.data as Record<string, string>)?.account_id || null;
    }

    // Verify payment
    const stripe = getStripe();
    const pi = stripeAccountId
      ? await stripe.paymentIntents.retrieve(payment_intent_id, undefined, { stripeAccount: stripeAccountId })
      : await stripe.paymentIntents.retrieve(payment_intent_id);

    if (pi.status !== "succeeded") {
      return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
    }

    // Issue ticket
    const result = await issueGuestListTicket(supabase, orgId, guest, event, "payment");

    return NextResponse.json({
      success: true,
      message: "Your ticket has been sent to your email.",
      orderId: result.orderId,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
