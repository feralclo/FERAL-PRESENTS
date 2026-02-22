import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { requirePlatformOwner } from "@/lib/auth";

/**
 * GET /api/stripe/connect/[accountId] — Get connected account details.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const auth = await requirePlatformOwner();
    if (auth.error) return auth.error;

    const { accountId } = await params;
    const stripe = getStripe();

    const account = await stripe.accounts.retrieve(accountId);

    return NextResponse.json({
      account_id: account.id,
      email: account.email,
      business_name: account.business_profile?.name || null,
      country: account.country,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      type: account.type,
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
      created: account.created,
    });
  } catch (err) {
    console.error("Stripe Connect account retrieve error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to retrieve account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/stripe/connect/[accountId] — Delete a connected account.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const auth = await requirePlatformOwner();
    if (auth.error) return auth.error;

    const { accountId } = await params;
    const stripe = getStripe();

    await stripe.accounts.del(accountId);

    return NextResponse.json({ deleted: true, account_id: accountId });
  } catch (err) {
    console.error("Stripe Connect account delete error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to delete account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
