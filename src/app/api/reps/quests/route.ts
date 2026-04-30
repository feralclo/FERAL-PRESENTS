import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { sendRepEmail } from "@/lib/rep-emails";
import { createNotification } from "@/lib/rep-notifications";
import { getPlatformXPConfig } from "@/lib/rep-points";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/reps/quests — List quests
 * Optional filters: ?status=active&event_id=
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const supabase = await getSupabaseAdmin();
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
      .eq("org_id", orgId)
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

    // Enrich with pending submission counts per quest
    const quests = data || [];
    if (quests.length > 0) {
      const questIds = quests.map((q: { id: string }) => q.id);
      const { data: counts } = await supabase
        .from(TABLES.REP_QUEST_SUBMISSIONS)
        .select("quest_id, status")
        .eq("org_id", orgId)
        .in("quest_id", questIds)
        .eq("status", "pending");

      const pendingMap = new Map<string, number>();
      for (const row of counts || []) {
        const c = pendingMap.get(row.quest_id) || 0;
        pendingMap.set(row.quest_id, c + 1);
      }
      for (const quest of quests) {
        (quest as Record<string, unknown>).pending_count = pendingMap.get(quest.id) || 0;
      }
    }

    return NextResponse.json({ data: quests });
  } catch (err) {
    Sentry.captureException(err);
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
    const orgId = auth.orgId;

    const body = await request.json();
    const {
      title,
      subtitle,
      description,
      instructions,
      quest_type,
      platform = "any",
      proof_type = "screenshot",
      image_url,
      cover_image_url,
      banner_image_url,
      video_url,
      points_reward,
      event_id,
      max_completions,
      max_total,
      starts_at,
      expires_at,
      status = "active",
      notify_reps = false,
      reference_url,
      uses_sound = false,
      currency_reward,
      ep_reward,
      sales_target,
      accent_hex,
      accent_hex_secondary,
      auto_approve = false,
      asset_mode,
      asset_campaign_tag,
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
      !["social_post", "story_share", "content_creation", "custom", "sales_milestone"].includes(
        quest_type
      )
    ) {
      return NextResponse.json(
        {
          error:
            "quest_type must be 'social_post', 'story_share', 'content_creation', 'custom', or 'sales_milestone'",
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

    // sales_milestone requires a sales_target
    if (quest_type === "sales_milestone") {
      if (!sales_target || Number(sales_target) < 1) {
        return NextResponse.json(
          { error: "sales_milestone quests require a sales_target of at least 1" },
          { status: 400 }
        );
      }
    }

    if (!["tiktok", "instagram", "any"].includes(platform)) {
      return NextResponse.json(
        { error: "platform must be 'tiktok', 'instagram', or 'any'" },
        { status: 400 }
      );
    }

    // proof_type=none would create a quest the iOS client can't submit
    // (QuestDetailSheet renders EmptyView → no submit button). Block at
    // write time so we never ship a dead-end quest.
    if (proof_type === "none") {
      return NextResponse.json(
        {
          error: "proof_type_none_unsupported",
          message:
            "proof_type=none is not yet supported by the mobile client; use screenshot, url, or text",
        },
        { status: 400 }
      );
    }
    if (
      !["screenshot", "url", "text", "instagram_link", "tiktok_link"].includes(
        proof_type
      )
    ) {
      return NextResponse.json(
        {
          error:
            "proof_type must be 'screenshot', 'url', 'text', 'instagram_link', or 'tiktok_link'",
        },
        { status: 400 }
      );
    }

    // Platform controls XP — override client-provided points_reward
    const platformConfig = await getPlatformXPConfig();
    const platformXP = platformConfig.xp_per_quest_type[quest_type as keyof typeof platformConfig.xp_per_quest_type] ?? platformConfig.xp_per_quest_type.custom;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Resolve promoter_id for this org so iOS/Android clients can scope the
    // quest by promoter (the new way) without losing the legacy org_id path.
    let promoterId: string | null = null;
    {
      const { data: promoter } = await supabase
        .from("promoters")
        .select("id")
        .eq("org_id", orgId)
        .maybeSingle();
      promoterId = promoter?.id ?? null;
    }

    // EP reward: accept either new `ep_reward` or legacy `currency_reward`.
    const epAmount = Number(ep_reward ?? currency_reward ?? 0);

    const { data, error } = await supabase
      .from(TABLES.REP_QUESTS)
      .insert({
        org_id: orgId,
        promoter_id: promoterId,
        title: title.trim(),
        subtitle: subtitle?.trim() || null,
        description: description?.trim() || null,
        instructions: instructions?.trim() || null,
        quest_type,
        platform,
        proof_type,
        image_url: image_url || null,
        cover_image_url: cover_image_url || image_url || null,
        banner_image_url: banner_image_url || null,
        video_url: video_url || null,
        points_reward: platformXP,
        xp_reward: platformXP,
        currency_reward: epAmount,
        ep_reward: epAmount,
        accent_hex: typeof accent_hex === "number" ? accent_hex : null,
        accent_hex_secondary:
          typeof accent_hex_secondary === "number" ? accent_hex_secondary : null,
        auto_approve: Boolean(auto_approve),
        event_id: event_id || null,
        max_completions: max_completions != null ? Number(max_completions) : null,
        max_total: max_total != null ? Number(max_total) : null,
        total_completed: 0,
        starts_at: starts_at || null,
        expires_at: expires_at || null,
        status,
        notify_reps,
        reference_url: reference_url?.trim() || null,
        uses_sound: Boolean(uses_sound),
        sales_target: quest_type === "sales_milestone" ? Number(sales_target) : null,
        asset_mode: asset_mode === "pool" ? "pool" : "single",
        asset_campaign_tag:
          asset_mode === "pool" && typeof asset_campaign_tag === "string" && asset_campaign_tag
            ? asset_campaign_tag
            : null,
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
        .eq("org_id", orgId)
        .eq("status", "active");

      if (event_id) {
        // Only notify reps assigned to this event
        const { data: assignments } = await supabase
          .from(TABLES.REP_EVENTS)
          .select("rep_id")
          .eq("org_id", orgId)
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
        // Fire-and-forget — don't await. Email + push run in parallel; the
        // push fanout (createNotification → APNs/FCM/web) is what iOS
        // surfaces in the notifications sheet, the email is the legacy
        // fallback for reps without a registered device.
        const questBody = data.subtitle?.trim() || data.description?.trim() || null;
        for (const rep of reps) {
          sendRepEmail({
            type: "quest_notification",
            repId: rep.id,
            orgId,
            data: {
              quest_title: data.title,
              quest_id: data.id,
              points_reward: data.points_reward,
            },
          });
          createNotification({
            repId: rep.id,
            orgId,
            type: "reward_drop",
            title: data.title,
            body: questBody ?? undefined,
            link: `/rep/quests/${data.id}`,
            metadata: {
              quest_id: data.id,
              event_id: data.event_id ?? null,
              promoter_id: data.promoter_id ?? null,
              xp_reward: data.points_reward ?? 0,
              ep_reward: data.ep_reward ?? data.currency_reward ?? 0,
            },
          }).catch((err) => Sentry.captureException(err, { level: "warning" }));
        }
      }
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
