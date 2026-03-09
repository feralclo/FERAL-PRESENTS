import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/rewards/claims — Claim history for current rep
 *
 * Returns all claims (newest first) with reward details.
 * Enriches each claim with ticket scan/collection status and event info.
 * Query params: ?limit=50&offset=0
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const repId = auth.rep.id;
    const orgId = auth.rep.org_id;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { searchParams } = request.nextUrl;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const { data, error } = await supabase
      .from(TABLES.REP_REWARD_CLAIMS)
      .select(
        "*, reward:rep_rewards(id, name, description, image_url, reward_type, points_cost, custom_value, metadata, product:products(name, images))"
      )
      .eq("rep_id", repId)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const claims = data || [];

    // ── Enrich claims with ticket status + event info ──
    // Collect all ticket codes and event IDs from claim metadata
    const allTicketCodes: string[] = [];
    const allEventIds = new Set<string>();

    for (const claim of claims) {
      const meta = claim.metadata as { ticket_codes?: string[]; event_id?: string } | null;
      if (meta?.ticket_codes) allTicketCodes.push(...meta.ticket_codes);
      if (meta?.event_id) allEventIds.add(meta.event_id);
      // Also check reward metadata for event_id
      const rewardMeta = (claim.reward as { metadata?: { event_id?: string } })?.metadata;
      if (rewardMeta?.event_id) allEventIds.add(rewardMeta.event_id);
    }

    // Batch fetch ticket statuses
    type TicketStatus = {
      ticket_code: string;
      status: string;
      scanned_at: string | null;
      merch_collected: boolean;
      merch_collected_at: string | null;
    };
    const ticketStatusMap = new Map<string, TicketStatus>();

    if (allTicketCodes.length > 0) {
      const { data: tickets } = await supabase
        .from(TABLES.TICKETS)
        .select("ticket_code, status, scanned_at, merch_collected, merch_collected_at")
        .eq("org_id", orgId)
        .in("ticket_code", allTicketCodes);

      if (tickets) {
        for (const t of tickets as TicketStatus[]) {
          ticketStatusMap.set(t.ticket_code, t);
        }
      }
    }

    // Batch fetch event info
    type EventInfo = {
      id: string;
      name: string;
      date_start: string | null;
      venue_name: string | null;
      cover_image: string | null;
    };
    const eventMap = new Map<string, EventInfo>();

    if (allEventIds.size > 0) {
      const { data: events } = await supabase
        .from(TABLES.EVENTS)
        .select("id, name, date_start, venue_name, cover_image")
        .eq("org_id", orgId)
        .in("id", Array.from(allEventIds));

      if (events) {
        for (const e of events as EventInfo[]) {
          eventMap.set(e.id, e);
        }
      }
    }

    // Merge enriched data into claims
    const enrichedClaims = claims.map((claim) => {
      const meta = claim.metadata as { ticket_codes?: string[]; event_id?: string; merch_size?: string } | null;
      const rewardMeta = (claim.reward as { metadata?: { event_id?: string; fulfillment_type?: string } })?.metadata;
      const eventId = meta?.event_id || rewardMeta?.event_id;

      // Ticket statuses for this claim
      const ticketStatuses = (meta?.ticket_codes || []).map((code) => ticketStatusMap.get(code) || null).filter(Boolean);

      // Determine overall collection/scan status
      const allScanned = ticketStatuses.length > 0 && ticketStatuses.every((t) => t!.scanned_at);
      const allMerchCollected = ticketStatuses.length > 0 && ticketStatuses.every((t) => t!.merch_collected);
      const anyScanned = ticketStatuses.some((t) => t!.scanned_at);
      const anyMerchCollected = ticketStatuses.some((t) => t!.merch_collected);

      return {
        ...claim,
        // Event info
        event: eventId ? eventMap.get(eventId) || null : null,
        // Ticket scan/collection summary
        ticket_status: {
          scanned: allScanned,
          any_scanned: anyScanned,
          scanned_at: ticketStatuses.find((t) => t!.scanned_at)?.scanned_at || null,
          merch_collected: allMerchCollected,
          any_merch_collected: anyMerchCollected,
          merch_collected_at: ticketStatuses.find((t) => t!.merch_collected_at)?.merch_collected_at || null,
        },
      };
    });

    return NextResponse.json({ data: enrichedClaims });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
