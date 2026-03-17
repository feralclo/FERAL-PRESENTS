import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

const STAGE_ORDER = ["landing", "tickets", "add_to_cart", "checkout", "purchase"] as const;
type Stage = (typeof STAGE_ORDER)[number];
const STAGE_SET = new Set<string>(STAGE_ORDER);

function stageIdx(s: string): number {
  return STAGE_ORDER.indexOf(s as Stage);
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const supabase = await getSupabaseAdmin();
    if (!supabase)
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

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

    // Resolve slugs → display names
    const slugs = new Set<string>();
    for (const e of events || []) if (e.event_name) slugs.add(e.event_name);

    let slugMap: Record<string, string> = {};
    if (slugs.size > 0) {
      const { data } = await supabase
        .from(TABLES.EVENTS)
        .select("slug, name")
        .eq("org_id", orgId)
        .in("slug", [...slugs]);
      if (data) for (const ev of data) slugMap[ev.slug] = ev.name;
    }

    // Group by session
    const map = new Map<string, {
      stage: Stage; journeyPath: string[]; eventSlug?: string; eventName?: string;
      productName?: string; enteredAt: string; lastSeenAt: string; stageChangedAt: string;
    }>();

    for (const evt of events || []) {
      if (!evt.session_id || !STAGE_SET.has(evt.event_type)) continue;
      const stage = evt.event_type as Stage;
      const ts = evt.timestamp || new Date().toISOString();
      const existing = map.get(evt.session_id);

      if (!existing) {
        map.set(evt.session_id, {
          stage, journeyPath: [stage],
          eventSlug: evt.event_name || undefined,
          eventName: slugMap[evt.event_name] || evt.event_name || undefined,
          productName: evt.product_name || undefined,
          enteredAt: ts, lastSeenAt: ts, stageChangedAt: ts,
        });
      } else {
        existing.lastSeenAt = ts;
        if (evt.event_name && !existing.eventName) {
          existing.eventSlug = evt.event_name;
          existing.eventName = slugMap[evt.event_name] || evt.event_name;
        }
        if (evt.product_name) existing.productName = evt.product_name;
        if (stageIdx(stage) > stageIdx(existing.stage)) {
          existing.stage = stage;
          existing.stageChangedAt = ts;
          if (!existing.journeyPath.includes(stage)) existing.journeyPath.push(stage);
        }
      }
    }

    const sessions = [...map.entries()]
      .map(([sessionId, d]) => ({
        sessionId, stage: d.stage, eventSlug: d.eventSlug, eventName: d.eventName,
        productName: d.productName, journeyPath: d.journeyPath,
        enteredAt: new Date(d.enteredAt).getTime(),
        lastSeenAt: new Date(d.lastSeenAt).getTime(),
        stageChangedAt: new Date(d.stageChangedAt).getTime(),
        isPurchaseNew: false,
      }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .slice(0, 80);

    return NextResponse.json({ sessions });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
