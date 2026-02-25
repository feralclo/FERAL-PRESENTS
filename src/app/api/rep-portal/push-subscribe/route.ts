import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { savePushSubscription, removePushSubscription } from "@/lib/web-push";

/**
 * POST /api/rep-portal/push-subscribe
 * Save a push subscription for the authenticated rep.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRepAuth();
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { subscription } = body;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json(
        { error: "Invalid subscription: missing endpoint or keys" },
        { status: 400 }
      );
    }

    await savePushSubscription(
      auth.rep.id,
      subscription,
      req.headers.get("user-agent") || undefined,
      auth.rep.org_id
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to save subscription" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/rep-portal/push-subscribe
 * Remove a push subscription for the authenticated rep.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireRepAuth();
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }

    await removePushSubscription(auth.rep.id, endpoint, auth.rep.org_id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to remove subscription" },
      { status: 500 }
    );
  }
}
