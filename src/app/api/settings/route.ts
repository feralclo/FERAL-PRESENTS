import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";

/**
 * GET /api/settings?key=feral_event_liverpool
 * Server-side settings fetch — avoids exposing anon key in client requests.
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "Missing key parameter" }, { status: 400 });
  }

  try {
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }
    const { data, error } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", key)
      .single();

    if (error || !data) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({ data: data.data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/settings
 * Save settings to Supabase. Used by admin dashboard.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, data } = body;

    if (!key || !data) {
      return NextResponse.json(
        { error: "Missing key or data" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }
    const { error } = await supabase.from(TABLES.SITE_SETTINGS).upsert(
      {
        key,
        data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Bust Next.js page cache — settings changes should reflect immediately
    // The key format is like "feral_event_liverpool" or "feral_event_<slug>"
    const slugMatch = key.match(/^feral_event_(.+)$/);
    if (slugMatch) {
      revalidatePath(`/event/${slugMatch[1]}`);
      revalidatePath(`/event/${slugMatch[1]}/checkout`);
    }
    // Also revalidate well-known event slugs mapped to this key
    if (key === "feral_event_liverpool") {
      revalidatePath("/event/liverpool-27-march");
    }
    if (key === "feral_event_kompass") {
      revalidatePath("/event/kompass-klub-7-march");
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
