import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";

/**
 * POST /api/rep-portal/quests/[id]/submit — Submit quest proof (protected)
 *
 * Accepts proof_type, proof_url, proof_text. Validates the quest is active,
 * not expired, and not at max completions for this rep. Creates a submission
 * with status "pending".
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const repId = auth.rep.id;
    const { id: questId } = await params;

    const body = await request.json();
    const { proof_type, proof_url, proof_text } = body;

    // Validate proof_type
    const validProofTypes = ["screenshot", "url", "text"];
    if (!proof_type || !validProofTypes.includes(proof_type)) {
      return NextResponse.json(
        { error: "Invalid proof_type. Must be: screenshot, url, or text" },
        { status: 400 }
      );
    }

    // Validate proof content based on type
    if (proof_type === "screenshot" && !proof_url) {
      return NextResponse.json(
        { error: "proof_url is required for screenshot submissions" },
        { status: 400 }
      );
    }
    if (proof_type === "url" && !proof_url) {
      return NextResponse.json(
        { error: "proof_url is required for URL submissions" },
        { status: 400 }
      );
    }
    if (proof_type === "text" && !proof_text) {
      return NextResponse.json(
        { error: "proof_text is required for text submissions" },
        { status: 400 }
      );
    }

    // Length limits
    if (proof_url && (typeof proof_url !== "string" || proof_url.length > 2000)) {
      return NextResponse.json(
        { error: "proof_url must be under 2000 characters" },
        { status: 400 }
      );
    }
    if (proof_text && (typeof proof_text !== "string" || proof_text.length > 5000)) {
      return NextResponse.json(
        { error: "proof_text must be under 5000 characters" },
        { status: 400 }
      );
    }

    // URL format validation for url/screenshot types
    if (proof_url && (proof_type === "url" || proof_type === "screenshot")) {
      try {
        const parsed = new URL(proof_url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          return NextResponse.json(
            { error: "proof_url must be an HTTP or HTTPS URL" },
            { status: 400 }
          );
        }
      } catch {
        // Allow internal /api/media/ paths from our upload system
        if (!proof_url.startsWith("/api/media/")) {
          return NextResponse.json(
            { error: "proof_url must be a valid URL" },
            { status: 400 }
          );
        }
      }
    }

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Fetch the quest
    const { data: quest, error: questError } = await supabase
      .from(TABLES.REP_QUESTS)
      .select("*")
      .eq("id", questId)
      .eq("org_id", ORG_ID)
      .single();

    if (questError || !quest) {
      return NextResponse.json(
        { error: "Quest not found" },
        { status: 404 }
      );
    }

    // Validate quest is active
    if (quest.status !== "active") {
      return NextResponse.json(
        { error: "This quest is no longer active" },
        { status: 400 }
      );
    }

    // Check expiration
    if (quest.expires_at && new Date(quest.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This quest has expired" },
        { status: 400 }
      );
    }

    // Check start date
    if (quest.starts_at && new Date(quest.starts_at) > new Date()) {
      return NextResponse.json(
        { error: "This quest has not started yet" },
        { status: 400 }
      );
    }

    // Check max_total (global completion limit)
    if (quest.max_total !== null && quest.total_completed >= quest.max_total) {
      return NextResponse.json(
        { error: "This quest has reached its maximum number of completions" },
        { status: 400 }
      );
    }

    // Check max_completions (per-rep limit)
    if (quest.max_completions !== null) {
      const { count } = await supabase
        .from(TABLES.REP_QUEST_SUBMISSIONS)
        .select("id", { count: "exact", head: true })
        .eq("quest_id", questId)
        .eq("rep_id", repId)
        .eq("org_id", ORG_ID)
        .in("status", ["pending", "approved"]);

      if ((count || 0) >= quest.max_completions) {
        return NextResponse.json(
          { error: "You have reached the maximum number of submissions for this quest" },
          { status: 400 }
        );
      }
    }

    // Verify rep has access to this quest (global or assigned event)
    if (quest.event_id) {
      const { data: repEvent } = await supabase
        .from(TABLES.REP_EVENTS)
        .select("id")
        .eq("rep_id", repId)
        .eq("event_id", quest.event_id)
        .eq("org_id", ORG_ID)
        .single();

      if (!repEvent) {
        return NextResponse.json(
          { error: "You are not assigned to the event for this quest" },
          { status: 403 }
        );
      }
    }

    // Create submission
    const { data: submission, error: submitError } = await supabase
      .from(TABLES.REP_QUEST_SUBMISSIONS)
      .insert({
        org_id: ORG_ID,
        quest_id: questId,
        rep_id: repId,
        proof_type,
        proof_url: proof_url || null,
        proof_text: proof_text || null,
        status: "pending",
        points_awarded: 0,
      })
      .select("*")
      .single();

    if (submitError) {
      console.error("[rep-portal/quests/submit] Insert error:", submitError);
      return NextResponse.json(
        { error: "Failed to create submission" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: submission },
      { status: 201 }
    );
  } catch (err) {
    console.error("[rep-portal/quests/submit] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
