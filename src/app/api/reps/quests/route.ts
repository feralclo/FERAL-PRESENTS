import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { sendRepEmail } from "@/lib/rep-emails";

/**
 * GET /api/reps/quests — List quests
 * Optional filters: ?status=active&event_id=
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const eventId = searchParams.get("event_id");

    let query = supabase
      .from(TABLES.REP_QUESTS)
      .select("*, event:events(name, slug)")
      .eq("org_id", ORG_ID)
      .order("created_at", { ascending: false })
      .limit(200);

    if (status) {
      if (!["active", "paused", "archived", "draft"].includes(status)) {
        return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
      }
      query = query.eq("status", status);
    }

    if (eventId) {
      query = query.eq("event_id", eventId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/reps/quests — Create a quest
 * If notify_reps is true, sends quest notification emails to active reps
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = await request.json();
    const {
      title,
      description,
      instructions,
      quest_type,
      image_url,
      video_url,
      points_reward,
      event_id,
      max_completions,
      max_total,
      starts_at,
      expires_at,
      status = "active",
      notify_reps = false,
    } = body;

    if (!title || !quest_type || points_reward == null) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: title, quest_type, points_reward",
        },
        { status: 400 }
      );
    }

    if (
      !["social_post", "story_share", "content_creation", "custom"].includes(
        quest_type
      )
    ) {
      return NextResponse.json(
        {
          error:
            "quest_type must be 'social_post', 'story_share', 'content_creation', or 'custom'",
        },
        { status: 400 }
      );
    }

    if (!["active", "paused", "archived", "draft"].includes(status)) {
      return NextResponse.json(
        { error: "status must be 'active', 'paused', 'archived', or 'draft'" },
        { status: 400 }
      );
    }

    if (Number(points_reward) <= 0) {
      return NextResponse.json(
        { error: "points_reward must be a positive number" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.REP_QUESTS)
      .insert({
        org_id: ORG_ID,
        title: title.trim(),
        description: description?.trim() || null,
        instructions: instructions?.trim() || null,
        quest_type,
        image_url: image_url || null,
        video_url: video_url || null,
        points_reward: Number(points_reward),
        event_id: event_id || null,
        max_completions: max_completions != null ? Number(max_completions) : null,
        max_total: max_total != null ? Number(max_total) : null,
        total_completed: 0,
        starts_at: starts_at || null,
        expires_at: expires_at || null,
        status,
        notify_reps,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Send quest notification emails to active reps (fire-and-forget)
    if (notify_reps && data) {
      let repQuery = supabase
        .from(TABLES.REPS)
        .select("id")
        .eq("org_id", ORG_ID)
        .eq("status", "active");

      if (event_id) {
        // Only notify reps assigned to this event
        const { data: assignments } = await supabase
          .from(TABLES.REP_EVENTS)
          .select("rep_id")
          .eq("org_id", ORG_ID)
          .eq("event_id", event_id);

        if (assignments && assignments.length > 0) {
          const repIds = assignments.map(
            (a: { rep_id: string }) => a.rep_id
          );
          repQuery = repQuery.in("id", repIds);
        } else {
          // No reps assigned — skip notifications
          return NextResponse.json({ data }, { status: 201 });
        }
      }

      const { data: reps } = await repQuery;

      if (reps && reps.length > 0) {
        // Fire-and-forget — don't await
        for (const rep of reps) {
          sendRepEmail({
            type: "quest_notification",
            repId: rep.id,
            orgId: ORG_ID,
            data: {
              quest_title: data.title,
              quest_id: data.id,
              points_reward: data.points_reward,
            },
          });
        }
      }
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
