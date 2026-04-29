import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import { getOrCreateRepDiscount } from "@/lib/discount-codes";
import * as Sentry from "@sentry/nextjs";

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
    const orgId = auth.rep.org_id;
    const { id: questId } = await params;

    const body = await request.json();
    const { proof_type, proof_url, proof_text } = body;

    // Validate proof_type
    const validProofTypes = ["screenshot", "url", "text", "tiktok_link", "instagram_link"];
    if (!proof_type || !validProofTypes.includes(proof_type)) {
      return NextResponse.json(
        { error: "Invalid proof_type. Must be: screenshot, url, text, tiktok_link, or instagram_link" },
        { status: 400 }
      );
    }

    // Validate proof content based on type
    const urlProofTypes = ["screenshot", "url", "tiktok_link", "instagram_link"];
    if (urlProofTypes.includes(proof_type) && !proof_url) {
      return NextResponse.json(
        { error: `proof_url is required for ${proof_type} submissions` },
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
    if (proof_url && urlProofTypes.includes(proof_type)) {
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

    // TikTok URL validation
    if (proof_type === "tiktok_link" && proof_url) {
      const tiktokPattern = /^https?:\/\/(www\.|m\.|vm\.)?tiktok\.com\//;
      if (!tiktokPattern.test(proof_url)) {
        return NextResponse.json(
          { error: "Please submit a valid TikTok URL (e.g. https://www.tiktok.com/@user/video/...)" },
          { status: 400 }
        );
      }
    }

    // Instagram URL validation
    if (proof_type === "instagram_link" && proof_url) {
      const instaPattern = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\//;
      if (!instaPattern.test(proof_url)) {
        return NextResponse.json(
          { error: "Please submit a valid Instagram post or reel URL (e.g. https://www.instagram.com/p/... or /reel/...)" },
          { status: 400 }
        );
      }
    }

    const supabase = await getSupabaseAdmin();
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
      .eq("org_id", orgId)
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
        .eq("org_id", orgId)
        .in("status", ["pending", "approved"]);

      if ((count || 0) >= quest.max_completions) {
        return NextResponse.json(
          { error: "You have reached the maximum number of submissions for this quest" },
          { status: 400 }
        );
      }
    }

    // Verify rep has the rep_events linkage for this quest's event. The
    // linkage is what carries the discount code attribution + per-event
    // sales count, so we can't skip it for sales-target quests.
    //
    // Previously: missing row → 403. That created a UX trap — a rep could
    // accept an event-scoped quest from the feed, then get blocked at submit.
    // Now: if the row is missing AND the event is rep-enabled + valid, we
    // auto-create it (same logic as /api/rep-portal/join-event). Idempotent;
    // a real "you're not allowed" case (event not rep-enabled or wrong org)
    // still 403s.
    if (quest.event_id) {
      const { data: repEvent } = await supabase
        .from(TABLES.REP_EVENTS)
        .select("id")
        .eq("rep_id", repId)
        .eq("event_id", quest.event_id)
        .eq("org_id", orgId)
        .maybeSingle();

      if (!repEvent) {
        const { data: questEvent } = await supabase
          .from(TABLES.EVENTS)
          .select("id, rep_enabled, status")
          .eq("id", quest.event_id)
          .eq("org_id", orgId)
          .maybeSingle();

        const eventOk =
          questEvent &&
          questEvent.rep_enabled === true &&
          ["published", "active", "live"].includes(questEvent.status);

        if (!eventOk) {
          return NextResponse.json(
            { error: "This event is not currently open to reps" },
            { status: 403 }
          );
        }

        // Reuse existing per-rep discount (or mint one) so attribution works
        // the moment the rep starts sharing.
        const { data: repProfile } = await supabase
          .from(TABLES.REPS)
          .select("first_name, display_name")
          .eq("id", repId)
          .maybeSingle();

        const discount = await getOrCreateRepDiscount({
          repId,
          orgId,
          firstName: repProfile?.first_name || "Rep",
          displayName: repProfile?.display_name ?? undefined,
        });

        const { error: joinError } = await supabase
          .from(TABLES.REP_EVENTS)
          .insert({
            org_id: orgId,
            rep_id: repId,
            event_id: quest.event_id,
            discount_id: discount?.id ?? null,
            sales_count: 0,
            revenue: 0,
          });

        // Tolerate the rare race where two concurrent submits both try to
        // create the row (unique constraint catches the dupe). Anything
        // else is a real failure.
        if (joinError && joinError.code !== "23505") {
          Sentry.captureException(joinError, {
            extra: { step: "auto_join_rep_event", repId, eventId: quest.event_id },
          });
          return NextResponse.json(
            { error: "Failed to join event for this quest" },
            { status: 500 }
          );
        }
      }
    }

    // Create submission
    const { data: submission, error: submitError } = await supabase
      .from(TABLES.REP_QUEST_SUBMISSIONS)
      .insert({
        org_id: orgId,
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
      // Handle unique constraint violation (duplicate pending/approved submission)
      if (submitError.code === "23505") {
        return NextResponse.json(
          { error: "You already have a pending or approved submission for this quest" },
          { status: 409 }
        );
      }
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
    Sentry.captureException(err);
    console.error("[rep-portal/quests/submit] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
