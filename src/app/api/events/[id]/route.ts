import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/events/[id] — Get event detail with ticket types
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.EVENTS)
      .select("*, ticket_types(*, product:products(*))")
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
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const body = await request.json();

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Separate ticket_types and deleted IDs from event fields
    const { ticket_types, deleted_ticket_type_ids, ...eventFields } = body;

    // Log image size for debugging
    if (eventFields.cover_image) {
      console.log(`[events/${id}] cover_image size: ${Math.round(eventFields.cover_image.length / 1024)}KB (base64 string)`);
    }

    // Update event
    const { error: eventError } = await supabase
      .from(TABLES.EVENTS)
      .update({ ...eventFields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", ORG_ID);

    if (eventError) {
      console.error(`[events/${id}] Update error:`, eventError.message);
      return NextResponse.json(
        { error: eventError.message },
        { status: 500 }
      );
    }

    // Delete removed ticket types (parallel)
    if (deleted_ticket_type_ids && Array.isArray(deleted_ticket_type_ids)) {
      await Promise.all(
        deleted_ticket_type_ids.map((ttId: string) =>
          supabase
            .from(TABLES.TICKET_TYPES)
            .delete()
            .eq("id", ttId)
            .eq("org_id", ORG_ID)
        )
      );
    }

    // Update/insert ticket types (parallel)
    if (ticket_types && Array.isArray(ticket_types)) {
      await Promise.all(
        ticket_types.map((tt: Record<string, unknown>) => {
          if (tt.id) {
            const { id: ttId, ...ttFields } = tt;
            return supabase
              .from(TABLES.TICKET_TYPES)
              .update({ ...ttFields, updated_at: new Date().toISOString() })
              .eq("id", ttId as string)
              .eq("org_id", ORG_ID);
          } else {
            return supabase.from(TABLES.TICKET_TYPES).insert({
              org_id: ORG_ID,
              event_id: id,
              ...tt,
            });
          }
        })
      );
    }

    // Return updated event
    const { data } = await supabase
      .from(TABLES.EVENTS)
      .select("*, ticket_types(*, product:products(*))")
      .eq("id", id)
      .single();

    // Verify image persistence
    if (eventFields.cover_image && !data?.cover_image) {
      console.warn(`[events/${id}] cover_image was sent but not returned — column may not exist in DB. Run supabase-add-image-columns.sql`);
    }
    if (eventFields.hero_image && !data?.hero_image) {
      console.warn(`[events/${id}] hero_image was sent but not returned — column may not exist in DB. Run supabase-add-image-columns.sql`);
    }

    // Bust Next.js page cache so public event pages reflect changes immediately
    if (data?.slug) {
      revalidatePath(`/event/${data.slug}`);
      revalidatePath(`/event/${data.slug}/tickets`);
      revalidatePath(`/event/${data.slug}/checkout`);
    }
    revalidatePath("/admin/events");

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/events/[id] — Permanently delete an event and its ticket types
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Get event slug for cache revalidation before deleting
    const { data: event } = await supabase
      .from(TABLES.EVENTS)
      .select("slug")
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Delete ticket types first (foreign key)
    await supabase
      .from(TABLES.TICKET_TYPES)
      .delete()
      .eq("event_id", id)
      .eq("org_id", ORG_ID);

    // Delete event
    const { error } = await supabase
      .from(TABLES.EVENTS)
      .delete()
      .eq("id", id)
      .eq("org_id", ORG_ID);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Bust caches
    revalidatePath(`/event/${event.slug}`);
    revalidatePath("/admin/events");

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
