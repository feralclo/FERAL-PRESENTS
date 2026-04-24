import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listAttendedEventsOf, parseListPagination } from "@/lib/rep-social-lists";
import * as Sentry from "@sentry/nextjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const url = new URL(request.url);
    const { limit, offset } = parseListPagination(url);
    const envelope = await listAttendedEventsOf(db, id, limit, offset);

    return NextResponse.json(envelope);
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/reps/[id]/events] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
