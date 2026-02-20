import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/reps/quests/[id] — Single quest
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.REP_QUESTS)
      .select("*, event:events(name, slug)")
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Quest not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PUT /api/reps/quests/[id] — Update quest fields
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

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const allowedFields = [
      "title",
      "description",
      "instructions",
      "quest_type",
      "platform",
      "image_url",
      "video_url",
      "points_reward",
      "event_id",
      "max_completions",
      "max_total",
      "starts_at",
      "expires_at",
      "status",
      "notify_reps",
      "reference_url",
      "uses_sound",
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Validate enums if provided
    if (updates.quest_type && !["social_post", "story_share", "content_creation", "custom"].includes(updates.quest_type as string)) {
      return NextResponse.json(
        { error: "quest_type must be 'social_post', 'story_share', 'content_creation', or 'custom'" },
        { status: 400 }
      );
    }
    if (updates.status && !["active", "paused", "archived", "draft"].includes(updates.status as string)) {
      return NextResponse.json(
        { error: "status must be 'active', 'paused', 'archived', or 'draft'" },
        { status: 400 }
      );
    }
    if (updates.platform && !["tiktok", "instagram", "any"].includes(updates.platform as string)) {
      return NextResponse.json(
        { error: "platform must be 'tiktok', 'instagram', or 'any'" },
        { status: 400 }
      );
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from(TABLES.REP_QUESTS)
      .update(updates)
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "Quest not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/reps/quests/[id] — Archive quest (set status to "archived")
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.REP_QUESTS)
      .update({
        status: "archived",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "Quest not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
