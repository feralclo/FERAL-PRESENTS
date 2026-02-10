import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { DEFAULT_ACCOUNT_TYPE } from "@/lib/stripe/config";

/**
 * POST /api/stripe/connect — Create a new Stripe Connect account.
 *
 * Creates a Custom connected account (fully white-labeled, promoter never sees Stripe).
 * The account_type field is stored for future flexibility if we want to support
 * Express accounts (promoter connects their own Stripe) later.
 */
export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    const body = await request.json();

    const {
      email,
      business_name,
      country = "GB",
      account_type = DEFAULT_ACCOUNT_TYPE,
    } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Create the connected account based on type
    if (account_type === "custom") {
      // Custom account: fully white-labeled, we control everything
      const account = await stripe.accounts.create({
        type: "custom",
        country,
        email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "company",
        business_profile: {
          name: business_name || undefined,
          mcc: "7922", // Theatrical Producers and Ticket Agencies
          url: "https://feralpresents.com",
        },
        settings: {
          payouts: {
            schedule: {
              interval: "manual",
            },
          },
        },
      });

      return NextResponse.json({
        account_id: account.id,
        account_type: "custom",
        details_submitted: account.details_submitted,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
      });
    }

    if (account_type === "express") {
      // Express account: Stripe-hosted onboarding, some Stripe branding
      // Future option — kept here for flexibility
      const account = await stripe.accounts.create({
        type: "express",
        country,
        email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "company",
        business_profile: {
          name: business_name || undefined,
          mcc: "7922",
        },
      });

      return NextResponse.json({
        account_id: account.id,
        account_type: "express",
        details_submitted: account.details_submitted,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
      });
    }

    return NextResponse.json(
      { error: `Unsupported account type: ${account_type}` },
      { status: 400 }
    );
  } catch (err) {
    console.error("Stripe Connect account creation error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to create account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/stripe/connect — List connected accounts (for admin).
 */
export async function GET() {
  try {
    const stripe = getStripe();

    const accounts = await stripe.accounts.list({ limit: 100 });

    const simplified = accounts.data.map((acc) => ({
      account_id: acc.id,
      email: acc.email,
      business_name: acc.business_profile?.name || null,
      country: acc.country,
      charges_enabled: acc.charges_enabled,
      payouts_enabled: acc.payouts_enabled,
      details_submitted: acc.details_submitted,
      type: acc.type,
      created: acc.created,
    }));

    return NextResponse.json({ data: simplified });
  } catch (err) {
    console.error("Stripe Connect list error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to list accounts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
