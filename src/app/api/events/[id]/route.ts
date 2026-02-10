import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";

/**
 * GET /api/events/[id] — Get event detail with ticket types
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.EVENTS)
      .select("*, ticket_types(*)")
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PUT /api/events/[id] — Update event
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Separate ticket_types and deleted IDs from event fields
    const { ticket_types, deleted_ticket_type_ids, ...eventFields } = body;

    // Update event
    const { error: eventError } = await supabase
      .from(TABLES.EVENTS)
      .update({ ...eventFields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", ORG_ID);

    if (eventError) {
      return NextResponse.json(
        { error: eventError.message },
        { status: 500 }
      );
    }

    // Delete removed ticket types
    if (deleted_ticket_type_ids && Array.isArray(deleted_ticket_type_ids)) {
      for (const ttId of deleted_ticket_type_ids) {
        await supabase
          .from(TABLES.TICKET_TYPES)
          .delete()
          .eq("id", ttId)
          .eq("org_id", ORG_ID);
      }
    }

    // Update ticket types if provided
    if (ticket_types && Array.isArray(ticket_types)) {
      for (const tt of ticket_types) {
        if (tt.id) {
          // Update existing
          const { id: ttId, ...ttFields } = tt;
          await supabase
            .from(TABLES.TICKET_TYPES)
            .update({ ...ttFields, updated_at: new Date().toISOString() })
            .eq("id", ttId)
            .eq("org_id", ORG_ID);
        } else {
          // Insert new
          await supabase.from(TABLES.TICKET_TYPES).insert({
            org_id: ORG_ID,
            event_id: id,
            ...tt,
          });
        }
      }
    }

    // Return updated event
    const { data } = await supabase
      .from(TABLES.EVENTS)
      .select("*, ticket_types(*)")
      .eq("id", id)
      .single();

    // Bust Next.js page cache so public event pages reflect changes immediately
    if (data?.slug) {
      revalidatePath(`/event/${data.slug}`);
      revalidatePath(`/event/${data.slug}/checkout`);
    }
    revalidatePath("/admin/events");

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
