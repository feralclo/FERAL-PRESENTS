import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_ACCOUNT_TYPE } from "@/lib/stripe/config";
import { requireAuth } from "@/lib/auth";
import { TABLES, stripeAccountKey } from "@/lib/constants";

/**
 * POST /api/stripe/connect/my-account — Create a Stripe Connect account for the tenant.
 *
 * Uses requireAuth() so any admin can set up payments for their own org.
 * Scoped to auth.orgId — a tenant can only create one account per org.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const stripe = getStripe();
    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Check if this org already has a connected account
    const { data: existing } = await db
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", stripeAccountKey(auth.orgId))
      .single();

    if (existing?.data?.account_id) {
      // Verify the existing account is still accessible
      try {
        const acc = await stripe.accounts.retrieve(existing.data.account_id);
        return NextResponse.json({
          account_id: acc.id,
          already_exists: true,
          charges_enabled: acc.charges_enabled,
          payouts_enabled: acc.payouts_enabled,
          details_submitted: acc.details_submitted,
        });
      } catch {
        // Account no longer accessible — allow creating a new one
      }
    }

    const body = await request.json();
    const {
      email,
      business_name,
      country = "GB",
      account_type = DEFAULT_ACCOUNT_TYPE,
      business_type = "individual",
    } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (account_type !== "custom") {
      return NextResponse.json(
        { error: "Only custom accounts are supported" },
        { status: 400 }
      );
    }

    const validBusinessTypes = ["individual", "company", "non_profit"] as const;
    type BusinessType = (typeof validBusinessTypes)[number];
    if (!validBusinessTypes.includes(business_type as BusinessType)) {
      return NextResponse.json(
        { error: "Invalid business type" },
        { status: 400 }
      );
    }

    // Resolve the tenant's domain for the business profile URL
    const { data: domainRow } = await db
      .from(TABLES.DOMAINS)
      .select("hostname")
      .eq("org_id", auth.orgId)
      .eq("status", "active")
      .eq("is_primary", true)
      .single();

    const businessUrl = domainRow?.hostname
      ? `https://${domainRow.hostname}`
      : process.env.NEXT_PUBLIC_SITE_URL || "https://entry.events";

    const account = await stripe.accounts.create({
      type: "custom",
      country,
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: business_type as BusinessType,
      business_profile: {
        name: business_name || undefined,
        mcc: "7922", // Theatrical Producers and Ticket Agencies
        url: businessUrl,
      },
      settings: {
        payouts: {
          schedule: {
            interval: "manual",
          },
        },
      },
    });

    // Save to site_settings so payment-intent route auto-detects it
    await db.from(TABLES.SITE_SETTINGS).upsert(
      {
        key: stripeAccountKey(auth.orgId),
        data: { account_id: account.id },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    return NextResponse.json({
      account_id: account.id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    });
  } catch (err) {
    console.error("[my-account] Stripe Connect creation error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to create account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/stripe/connect/my-account — Get the tenant's own account status.
 *
 * Reads the account_id from site_settings scoped to auth.orgId,
 * then fetches the full account details from Stripe.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const stripe = getStripe();
    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Read account_id from site_settings for this org
    const { data: setting } = await db
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", stripeAccountKey(auth.orgId))
      .single();

    const accountId = setting?.data?.account_id;
    if (!accountId) {
      return NextResponse.json({ connected: false });
    }

    // Retrieve the full account from Stripe
    try {
      const account = await stripe.accounts.retrieve(accountId);

      return NextResponse.json({
        connected: true,
        account_id: account.id,
        email: account.email,
        business_name: account.business_profile?.name || null,
        country: account.country,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        requirements: {
          currently_due: account.requirements?.currently_due || [],
          eventually_due: account.requirements?.eventually_due || [],
          past_due: account.requirements?.past_due || [],
          disabled_reason: account.requirements?.disabled_reason || null,
        },
        capabilities: {
          card_payments: account.capabilities?.card_payments || "inactive",
          transfers: account.capabilities?.transfers || "inactive",
        },
      });
    } catch {
      // Account no longer accessible — clear the stored reference
      return NextResponse.json({
        connected: false,
        stale_account: true,
      });
    }
  } catch (err) {
    console.error("[my-account] Stripe Connect status error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to check account status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
