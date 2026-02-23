import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getOrgId } from "@/lib/org";

/**
 * GET /api/merch/[id]/linked-tickets — List ticket types linked to this merch item
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getOrgId();
    const { id } = await params;
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.TICKET_TYPES)
      .select("id, name, price, event:events(name, slug)")
      .eq("product_id", id)
      .eq("org_id", orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten the join for the frontend
    const linked = (data || []).map((tt: Record<string, unknown>) => {
      const event = tt.event as { name: string; slug: string } | null;
      return {
        id: tt.id,
        name: tt.name,
        price: tt.price,
        event_name: event?.name || "Unknown Event",
        event_slug: event?.slug || "",
      };
    });

    return NextResponse.json({ data: linked });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
