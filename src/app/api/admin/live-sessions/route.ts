import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/admin/live-sessions — Active sessions for live pulse visualization
 *
 * Queries traffic_events for the last 15 min, grouped by session_id.
 * Returns per-session objects with journey path, current stage, and event name.
 */

const STAGE_ORDER = ["landing", "tickets", "add_to_cart", "checkout", "purchase"] as const;
type Stage = (typeof STAGE_ORDER)[number];

const STAGE_SET = new Set<string>(STAGE_ORDER);

function stageIndex(s: string): number {
  const idx = STAGE_ORDER.indexOf(s as Stage);
  return idx >= 0 ? idx : -1;
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // Fetch recent traffic events (funnel-relevant types only)
    const { data: events, error } = await supabase
      .from(TABLES.TRAFFIC_EVENTS)
      .select("session_id, event_type, event_name, product_name, timestamp")
      .eq("org_id", orgId)
      .gte("timestamp", fifteenMinAgo)
      .in("event_type", [...STAGE_ORDER])
      .order("timestamp", { ascending: true })
      .limit(2000);

    if (error) {
      Sentry.captureException(error);
      return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
    }

    // Resolve event slugs to display names
    const slugs = new Set<string>();
    for (const e of events || []) {
      if (e.event_name) slugs.add(e.event_name);
    }

    let slugMap: Record<string, string> = {};
    if (slugs.size > 0) {
      const { data: eventsData } = await supabase
        .from(TABLES.EVENTS)
        .select("slug, name")
        .eq("org_id", orgId)
        .in("slug", [...slugs]);

      if (eventsData) {
        for (const ev of eventsData) {
          slugMap[ev.slug] = ev.name;
        }
      }
    }

    // Group by session_id, compute highest stage reached
    const sessionMap = new Map<
      string,
      {
        stage: Stage;
        journeyPath: string[];
        eventName?: string;
        productName?: string;
        enteredAt: string;
        lastSeenAt: string;
        stageChangedAt: string;
      }
    >();

    for (const evt of events || []) {
      if (!evt.session_id || !STAGE_SET.has(evt.event_type)) continue;

      const existing = sessionMap.get(evt.session_id);
      const evtStage = evt.event_type as Stage;
      const ts = evt.timestamp || new Date().toISOString();

      if (!existing) {
        sessionMap.set(evt.session_id, {
          stage: evtStage,
          journeyPath: [evtStage],
          eventName: slugMap[evt.event_name] || evt.event_name || undefined,
          productName: evt.product_name || undefined,
          enteredAt: ts,
          lastSeenAt: ts,
          stageChangedAt: ts,
        });
      } else {
        existing.lastSeenAt = ts;
        if (evt.event_name && !existing.eventName) {
          existing.eventName = slugMap[evt.event_name] || evt.event_name;
        }
        if (evt.product_name) {
          existing.productName = evt.product_name;
        }

        // Only promote, never demote
        if (stageIndex(evtStage) > stageIndex(existing.stage)) {
          existing.stage = evtStage;
          existing.stageChangedAt = ts;
          if (!existing.journeyPath.includes(evtStage)) {
            existing.journeyPath.push(evtStage);
          }
        }
      }
    }

    // Convert to array, cap at 50
    const sessions = [...sessionMap.entries()]
      .map(([sessionId, data]) => ({
        sessionId,
        stage: data.stage,
        eventName: data.eventName,
        productName: data.productName,
        journeyPath: data.journeyPath,
        enteredAt: new Date(data.enteredAt).getTime(),
        lastSeenAt: new Date(data.lastSeenAt).getTime(),
        stageChangedAt: new Date(data.stageChangedAt).getTime(),
        isPurchaseNew: false,
      }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .slice(0, 50);

    return NextResponse.json({ sessions });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
