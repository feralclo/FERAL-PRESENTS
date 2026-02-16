import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";

/**
 * PUT /api/rep-portal/notifications/read — Mark notifications as read
 *
 * Body: { ids: string[] } to mark specific notifications, or { all: true } to mark all.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const repId = auth.rep.id;
    const body = await request.json();

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    if (body.all === true) {
      // Mark all unread notifications as read
      const { error } = await supabase
        .from(TABLES.REP_NOTIFICATIONS)
        .update({ read: true })
        .eq("rep_id", repId)
        .eq("org_id", ORG_ID)
        .eq("read", false);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (Array.isArray(body.ids) && body.ids.length > 0) {
      // Mark specific notifications as read
      const { error } = await supabase
        .from(TABLES.REP_NOTIFICATIONS)
        .update({ read: true })
        .in("id", body.ids)
        .eq("rep_id", repId)
        .eq("org_id", ORG_ID);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      return NextResponse.json(
        { error: "Provide { ids: [...] } or { all: true }" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
