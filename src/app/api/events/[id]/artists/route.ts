import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/events/[id]/artists — Get ordered artists for an event (admin only)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { id } = await params;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.EVENT_ARTISTS)
      .select("*, artist:artists(*)")
      .eq("event_id", id)
      .eq("org_id", orgId)
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PUT /api/events/[id]/artists — Set the artist lineup for an event (admin only)
 * Body: { artists: [{ artist_id: string, sort_order: number }] }
 * Replaces all existing event_artists for this event.
 * Also syncs events.lineup string[] for backward compatibility.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { id } = await params;
    const body = await request.json();
    const artists: { artist_id: string; sort_order: number }[] =
      body.artists || [];

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Delete existing event_artists for this event
    await supabase
      .from(TABLES.EVENT_ARTISTS)
      .delete()
      .eq("event_id", id)
      .eq("org_id", orgId);

    // Insert new ones
    if (artists.length > 0) {
      const rows = artists.map((a) => ({
        event_id: id,
        artist_id: a.artist_id,
        sort_order: a.sort_order,
        org_id: orgId,
      }));

      const { error: insertError } = await supabase
        .from(TABLES.EVENT_ARTISTS)
        .insert(rows);

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        );
      }
    }

    // Sync events.lineup for backward compatibility
    // Fetch the artist names in sort order
    if (artists.length > 0) {
      const artistIds = artists
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((a) => a.artist_id);

      const { data: artistRows } = await supabase
        .from(TABLES.ARTISTS)
        .select("id, name")
        .in("id", artistIds);

      if (artistRows) {
        const nameMap = new Map(artistRows.map((a) => [a.id, a.name]));
        const lineup = artistIds
          .map((id) => nameMap.get(id))
          .filter(Boolean) as string[];

        await supabase
          .from(TABLES.EVENTS)
          .update({ lineup, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("org_id", orgId);
      }
    } else {
      // Clear lineup if no artists
      await supabase
        .from(TABLES.EVENTS)
        .update({ lineup: null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("org_id", orgId);
    }

    // Return the updated list
    const { data } = await supabase
      .from(TABLES.EVENT_ARTISTS)
      .select("*, artist:artists(*)")
      .eq("event_id", id)
      .eq("org_id", orgId)
      .order("sort_order", { ascending: true });

    return NextResponse.json({ data: data || [] });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
