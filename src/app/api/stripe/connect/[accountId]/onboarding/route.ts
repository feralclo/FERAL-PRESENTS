import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { requirePlatformOwner } from "@/lib/auth";

/**
 * POST /api/stripe/connect/[accountId]/onboarding
 *
 * Creates an Account Session for embedded onboarding components.
 * The frontend uses Stripe's ConnectJS to render the embedded onboarding form
 * styled to match the platform's branding.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const auth = await requirePlatformOwner();
    if (auth.error) return auth.error;

    const { accountId } = await params;
    const stripe = getStripe();

    // Create an Account Session for embedded components
    const accountSession = await stripe.accountSessions.create({
      account: accountId,
      components: {
        account_onboarding: {
          enabled: true,
          features: {
            external_account_collection: true,
          },
        },
      },
    });

    return NextResponse.json({
      client_secret: accountSession.client_secret,
    });
  } catch (err) {
    console.error("Stripe Connect onboarding session error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to create onboarding session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/stripe/connect/[accountId]/onboarding
 *
 * Creates an Account Link for hosted onboarding (fallback if embedded doesn't work).
 * Redirects the promoter to Stripe's onboarding flow and back to our platform.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const auth = await requirePlatformOwner();
    if (auth.error) return auth.error;

    const { accountId } = await params;
    const stripe = getStripe();

    const origin = request.nextUrl.origin;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/admin/connect?refresh=true`,
      return_url: `${origin}/admin/connect?onboarding=complete`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    console.error("Stripe Connect account link error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to create account link";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
