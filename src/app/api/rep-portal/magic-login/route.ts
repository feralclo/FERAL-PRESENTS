import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Rep portal magic login — platform owner only. For testing.
 *
 * GET  /api/rep-portal/magic-login?email=tester@feral.com
 *   → Generates token and immediately redirects to the rep portal (one click).
 *   → If no email param, uses first active rep in your org.
 *
 * POST /api/rep-portal/magic-login  { rep_id?, email? }
 *   → Returns JSON { url, email, rep_name } for programmatic use.
 */

async function generateMagicLink(
  orgId: string,
  options: { rep_id?: string; email?: string },
  origin: string
) {
  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return { error: "Database not configured", status: 503 };
  }

  const { rep_id, email } = options;

  // Find the rep
  let query = supabase
    .from("reps")
    .select("id, email, first_name, last_name, status, auth_user_id, org_id");

  if (rep_id) {
    query = query.eq("id", rep_id);
  } else if (email) {
    query = query.eq("email", email);
  } else {
    query = query.eq("org_id", orgId).eq("status", "active").limit(1);
  }

  const { data: rep, error: repErr } = await query.limit(1).single();

  if (repErr || !rep) {
    return {
      error:
        "Rep not found. Provide ?email= or ensure an active rep exists in your org.",
      status: 404,
    };
  }

  if (rep.status !== "active") {
    return { error: `Rep is ${rep.status}, not active`, status: 400 };
  }

  if (!rep.auth_user_id) {
    return {
      error: "Rep has no auth user linked. They need to sign up first.",
      status: 400,
    };
  }

  // Generate a magic link token
  const { data: linkData, error: linkErr } =
    await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: rep.email,
    });

  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error("[rep-magic-login] Failed to generate magic link:", linkErr);
    return { error: "Failed to generate login link", status: 500 };
  }

  const callbackUrl = `${origin}/api/rep-portal/magic-login/callback?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}`;

  return {
    url: callbackUrl,
    email: rep.email,
    rep_name: `${rep.first_name} ${rep.last_name}`.trim(),
    rep_id: rep.id,
    org_id: rep.org_id,
  };
}

/** GET — visit in browser while logged into admin → instant redirect to rep portal */
export async function GET(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const email = request.nextUrl.searchParams.get("email") || undefined;
  const rep_id = request.nextUrl.searchParams.get("rep_id") || undefined;
  const { origin } = request.nextUrl;

  const result = await generateMagicLink(auth.orgId, { rep_id, email }, origin);

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  // Redirect straight to the callback — one-click login
  return NextResponse.redirect(result.url);
}

/** POST — returns JSON with the magic link URL for programmatic use */
export async function POST(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const { rep_id, email } = body as { rep_id?: string; email?: string };
  const { origin } = request.nextUrl;

  const result = await generateMagicLink(auth.orgId, { rep_id, email }, origin);

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json(result);
}
