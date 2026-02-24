import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";

export const dynamic = "force-dynamic";

/**
 * GET /api/unsubscribe?token={cart_token}&type=cart_recovery
 *
 * One-click unsubscribe from abandoned cart recovery emails.
 * Looks up the cart by token, then marks ALL carts for that email as unsubscribed
 * so no further recovery emails are sent (including for future carts).
 *
 * Returns a simple HTML page confirming the unsubscribe.
 */
export async function GET(request: NextRequest) {
  const orgId = getOrgIdFromRequest(request);
  const { searchParams } = request.nextUrl;
  const token = searchParams.get("token");
  const type = searchParams.get("type");

  if (!token || !type || !["cart_recovery", "announcement"].includes(type)) {
    return new NextResponse(buildPage("Invalid Link", "This unsubscribe link is invalid or has expired."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return new NextResponse(buildPage("Error", "Service temporarily unavailable. Please try again later."), {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // ── Announcement unsubscribe ──
  if (type === "announcement") {
    const { data: signup, error: signupErr } = await supabase
      .from(TABLES.EVENT_INTEREST_SIGNUPS)
      .select("id, email, org_id")
      .eq("unsubscribe_token", token)
      .single();

    if (signupErr || !signup) {
      return new NextResponse(buildPage("Invalid Link", "This unsubscribe link is invalid or has expired."), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Mark ALL announcement signups for this email + org as unsubscribed
    const now = new Date().toISOString();
    await supabase
      .from(TABLES.EVENT_INTEREST_SIGNUPS)
      .update({ unsubscribed_at: now })
      .eq("org_id", signup.org_id)
      .eq("email", signup.email)
      .is("unsubscribed_at", null);

    // Clear marketing consent on customer record
    await supabase
      .from(TABLES.CUSTOMERS)
      .update({
        marketing_consent: false,
        marketing_consent_at: now,
      })
      .eq("org_id", signup.org_id)
      .eq("email", signup.email);

    console.log(`[unsubscribe] ${signup.email} unsubscribed from announcement emails`);

    return new NextResponse(
      buildPage(
        "Unsubscribed",
        "You\u2019ve been unsubscribed from event announcement emails. You won\u2019t receive any more updates about upcoming ticket releases.",
      ),
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }

  // ── Cart recovery unsubscribe ──
  // Look up the cart by token to get the email
  const { data: cart, error } = await supabase
    .from(TABLES.ABANDONED_CARTS)
    .select("id, email, org_id")
    .eq("cart_token", token)
    .eq("org_id", orgId)
    .single();

  if (error || !cart) {
    return new NextResponse(buildPage("Invalid Link", "This unsubscribe link is invalid or has expired."), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Mark ALL abandoned carts for this email as unsubscribed
  // This prevents future emails for existing AND new carts from this email
  const now = new Date().toISOString();

  try {
    await supabase
      .from(TABLES.ABANDONED_CARTS)
      .update({
        unsubscribed_at: now,
        updated_at: now,
      })
      .eq("org_id", orgId)
      .eq("email", cart.email)
      .eq("status", "abandoned");
  } catch {
    // If unsubscribed_at column doesn't exist yet, expire the carts as fallback
    await supabase
      .from(TABLES.ABANDONED_CARTS)
      .update({
        status: "expired",
        updated_at: now,
      })
      .eq("org_id", orgId)
      .eq("email", cart.email)
      .eq("status", "abandoned");
  }

  // Clear marketing consent on customer record
  await supabase
    .from(TABLES.CUSTOMERS)
    .update({
      marketing_consent: false,
      marketing_consent_at: now,
    })
    .eq("org_id", orgId)
    .eq("email", cart.email);

  console.log(`[unsubscribe] ${cart.email} unsubscribed from cart recovery emails`);

  return new NextResponse(
    buildPage(
      "Unsubscribed",
      "You\u2019ve been unsubscribed from cart recovery emails. You won\u2019t receive any more reminders about abandoned carts.",
    ),
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

/** Minimal branded HTML page for unsubscribe confirmation */
function buildPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0e0e0e;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      max-width: 480px;
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 48px 32px;
      text-align: center;
    }
    h1 {
      font-family: 'Courier New', monospace;
      font-size: 24px;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    p {
      color: #888;
      font-size: 15px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
