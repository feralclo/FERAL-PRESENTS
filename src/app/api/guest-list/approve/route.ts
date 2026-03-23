import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { issueGuestListTicket } from "@/lib/guest-list";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/guest-list/approve — Approve guests and issue tickets
 * Body: { guest_id: string } or { guest_ids: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json();
    const guestIds: string[] = body.guest_ids || (body.guest_id ? [body.guest_id] : []);

    if (guestIds.length === 0) {
      return NextResponse.json({ error: "Missing guest_id or guest_ids" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Fetch guest entries with event details
    const { data: guests, error: gErr } = await supabase
      .from(TABLES.GUEST_LIST)
      .select("*, event:events(id, name, slug, currency, venue_name, date_start, doors_time)")
      .eq("org_id", orgId)
      .in("id", guestIds);

    if (gErr || !guests) {
      return NextResponse.json({ error: gErr?.message || "Failed to fetch guests" }, { status: 500 });
    }

    const results: { id: string; approved: boolean; orderId?: string; ticketCodes?: string[]; error?: string }[] = [];

    for (const guest of guests) {
      // Skip already approved
      if (guest.status === "approved") {
        results.push({ id: guest.id, approved: true, error: "Already approved" });
        continue;
      }

      // Must have an email to issue tickets
      if (!guest.email) {
        results.push({ id: guest.id, approved: false, error: "No email address — cannot issue ticket" });
        continue;
      }

      const event = guest.event as {
        id: string; name: string; slug?: string; currency?: string;
        venue_name?: string; date_start?: string; doors_time?: string;
      } | null;

      if (!event) {
        results.push({ id: guest.id, approved: false, error: "Event not found" });
        continue;
      }

      try {
        const result = await issueGuestListTicket(
          supabase,
          orgId,
          guest,
          event,
          auth.user?.email || "admin"
        );
        results.push({
          id: guest.id,
          approved: true,
          orderId: result.orderId,
          ticketCodes: result.ticketIds,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to issue ticket";
        console.error(`[guest-list-approve] Failed for ${guest.id}:`, err);
        Sentry.captureException(err);
        results.push({ id: guest.id, approved: false, error: message });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
