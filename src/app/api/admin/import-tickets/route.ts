import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { importExternalTickets } from "@/lib/import-tickets";
import { TABLES } from "@/lib/constants";
import type { ImportTicketsRequest } from "@/types/import-tickets";

export const dynamic = "force-dynamic";

/** Import a batch of external tickets. */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service unavailable" },
      { status: 503 }
    );
  }

  let body: ImportTicketsRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.event_id || !body.tickets?.length) {
    return NextResponse.json(
      { error: "Missing event_id or tickets" },
      { status: 400 }
    );
  }

  if (!body.ticket_type_mappings?.length) {
    return NextResponse.json(
      { error: "Missing ticket type mappings" },
      { status: 400 }
    );
  }

  // Verify event belongs to this org
  const { data: event } = await supabase
    .from(TABLES.EVENTS)
    .select("id")
    .eq("id", body.event_id)
    .eq("org_id", auth.orgId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  try {
    const result = await importExternalTickets(supabase, {
      eventId: body.event_id,
      orgId: auth.orgId,
      sourcePlatform: body.source_platform || "External",
      ticketTypeMappings: body.ticket_type_mappings,
      tickets: body.tickets,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[import-tickets] Import failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}

/** List past imports for this org. */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service unavailable" },
      { status: 503 }
    );
  }

  const { data: imports } = await supabase
    .from(TABLES.ORDERS)
    .select("id, order_number, created_at, metadata, event:events(name)")
    .eq("org_id", auth.orgId)
    .eq("payment_method", "imported")
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ data: imports || [] });
}
