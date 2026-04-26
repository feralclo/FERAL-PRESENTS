import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/quests
 *
 * Quest list shaped for iOS / Android / web-v2 per ENTRY-IOS-BACKEND-SPEC §6.5.
 * Scope is resolved through approved rep_promoter_memberships — a rep sees
 * all active quests from every promoter whose team they're on, plus any
 * platform-level quest (promoter_id IS NULL).
 *
 * Query params:
 *   ?promoter_id=UUID — restrict to one promoter
 *   ?event_id=UUID    — restrict to one event
 *   ?status=active|paused|archived — default active
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const repId = auth.rep.id;

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { searchParams } = request.nextUrl;
    const promoterIdParam = searchParams.get("promoter_id");
    const eventIdParam = searchParams.get("event_id");
    const statusFilter = searchParams.get("status") || "active";

    if (!["active", "paused", "archived"].includes(statusFilter)) {
      return NextResponse.json(
        { error: "Invalid status filter" },
        { status: 400 }
      );
    }

    // 1. Resolve scope — which promoters does this rep have active on?
    //    `discount_code` is selected so the response can include a
    //    pre-built share_url per quest (saves iOS a per-quest lookup
    //    against dashboard.discount.per_promoter[]).
    const { data: memberships } = await db
      .from("rep_promoter_memberships")
      .select("promoter_id, discount_code, promoter:promoters(id, org_id, handle, display_name, accent_hex)")
      .eq("rep_id", repId)
      .eq("status", "approved");

    type PromoterShort = {
      id: string;
      org_id: string;
      handle: string;
      display_name: string;
      accent_hex: number;
    };
    type MembershipRow = {
      promoter_id: string;
      discount_code: string | null;
      promoter: PromoterShort | PromoterShort[] | null;
    };
    const approved = ((memberships ?? []) as unknown as MembershipRow[]).map(
      (m) => ({
        promoter_id: m.promoter_id,
        discount_code: m.discount_code,
        promoter: Array.isArray(m.promoter) ? m.promoter[0] ?? null : m.promoter,
      })
    );

    // Discount-code lookup tables: per-promoter (the precise code for a
    // promoter-scoped quest) and primary (any approved membership's code,
    // used as fallback for platform-level / unmatched quests).
    const codeByPromoterId = new Map<string, string>();
    let primaryCode: string | null = null;
    for (const m of approved) {
      if (m.discount_code) {
        codeByPromoterId.set(m.promoter_id, m.discount_code);
        if (!primaryCode) primaryCode = m.discount_code;
      }
    }

    // Apply ?promoter_id= scoping if set
    const scoped = promoterIdParam
      ? approved.filter((m) => m.promoter_id === promoterIdParam)
      : approved;
    const scopedPromoterIds = scoped.map((m) => m.promoter_id);
    const promoterByPromoterId = new Map<string, PromoterShort>();
    for (const m of scoped) {
      if (m.promoter) promoterByPromoterId.set(m.promoter_id, m.promoter);
    }

    // Helpers for the share-card fields below — defined here so they close
    // over codeByPromoterId / primaryCode without re-passing them.
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://entry.events").replace(/\/$/, "");
    const questDiscountCode = (promoterId: string | null): string | null => {
      if (promoterId) {
        const code = codeByPromoterId.get(promoterId);
        if (code) return code;
      }
      return primaryCode;
    };
    const questShareUrl = (eventSlug: string | null, code: string | null): string | null => {
      if (!eventSlug || !code) return null;
      return `${siteUrl}/event/${eventSlug}?ref=${encodeURIComponent(code)}`;
    };

    // 2. Fetch quests: (promoter_id IN scoped) OR (promoter_id IS NULL,
    // platform-level — visible to everyone). Filter by event_id if given.
    let questQuery = db
      .from(TABLES.REP_QUESTS)
      .select(
        `
          id, title, subtitle, description, instructions, quest_type,
          platform, proof_type, xp_reward, points_reward, currency_reward,
          ep_reward, sales_target, max_completions, starts_at, expires_at,
          cover_image_url, image_url, banner_image_url, video_url,
          accent_hex, accent_hex_secondary, status, promoter_id, event_id,
          auto_approve,
          event:events(id, name, slug, date_start, cover_image_url, cover_image)
        `
      )
      .eq("status", statusFilter)
      .order("created_at", { ascending: false })
      .limit(100);

    // `(promoter_id IN (...) OR promoter_id IS NULL)` — Supabase .or() syntax
    const promoterClause = scopedPromoterIds.length
      ? `promoter_id.is.null,promoter_id.in.(${scopedPromoterIds.join(",")})`
      : `promoter_id.is.null`;
    questQuery = questQuery.or(promoterClause);

    if (eventIdParam) {
      questQuery = questQuery.eq("event_id", eventIdParam);
    }

    const { data: quests, error } = await questQuery;

    if (error) {
      console.error("[rep-portal/quests] Postgres error:", error);
      Sentry.captureException(error, { extra: { repId, statusFilter } });
      return NextResponse.json(
        { error: "Failed to fetch quests" },
        { status: 500 }
      );
    }

    if (!quests || quests.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const questIds = (quests as Array<{ id: string }>).map((q) => q.id);

    // 3. My submissions (for my_submissions counts + latest)
    const { data: submissions } = await db
      .from(TABLES.REP_QUEST_SUBMISSIONS)
      .select(
        "id, quest_id, status, created_at, rejection_reason, requires_revision"
      )
      .eq("rep_id", repId)
      .in("quest_id", questIds)
      .order("created_at", { ascending: false });

    type Submission = {
      id: string;
      quest_id: string;
      status: "pending" | "approved" | "rejected" | "requires_revision";
      created_at: string;
      rejection_reason: string | null;
      requires_revision: boolean;
    };
    const submissionsByQuestId = new Map<string, Submission[]>();
    for (const s of (submissions ?? []) as Submission[]) {
      const list = submissionsByQuestId.get(s.quest_id) ?? [];
      list.push(s);
      submissionsByQuestId.set(s.quest_id, list);
    }

    // 4. Accepted flags
    const { data: acceptances } = await db
      .from("rep_quest_acceptances")
      .select("quest_id, accepted_at")
      .eq("rep_id", repId)
      .in("quest_id", questIds);

    const acceptedQuestIds = new Set(
      ((acceptances ?? []) as Array<{ quest_id: string }>).map(
        (a) => a.quest_id
      )
    );

    // 5. Sales milestone progress (only for quest_type='sales_milestone')
    const salesMilestones = (quests as Array<{
      id: string;
      quest_type: string;
      sales_target: number | null;
      event_id: string | null;
      starts_at: string | null;
    }>).filter((q) => q.quest_type === "sales_milestone");

    const progressByQuestId = new Map<
      string,
      { current: number; target: number }
    >();

    for (const q of salesMilestones) {
      const target = q.sales_target ?? 1;
      const since = q.starts_at ?? "1970-01-01T00:00:00Z";

      let orderQuery = db
        .from(TABLES.ORDERS)
        .select("id", { count: "exact", head: true })
        .contains("metadata", { rep_id: repId })
        .gte("created_at", since)
        .in("status", ["completed", "paid"]);

      if (q.event_id) {
        orderQuery = orderQuery.eq("event_id", q.event_id);
      }

      const { count } = await orderQuery;
      progressByQuestId.set(q.id, {
        current: Math.min(count ?? 0, target),
        target,
      });
    }

    // 6. Assemble the iOS-shaped response
    type RawQuest = {
      id: string;
      title: string;
      subtitle: string | null;
      description: string | null;
      instructions: string | null;
      quest_type: string;
      platform: string | null;
      proof_type: string;
      xp_reward: number | null;
      points_reward: number | null;
      currency_reward: number | null;
      ep_reward: number | null;
      sales_target: number | null;
      max_completions: number | null;
      starts_at: string | null;
      expires_at: string | null;
      cover_image_url: string | null;
      image_url: string | null;
      banner_image_url: string | null;
      video_url: string | null;
      accent_hex: number | null;
      accent_hex_secondary: number | null;
      promoter_id: string | null;
      event_id: string | null;
      auto_approve: boolean;
      event:
        | {
            id: string;
            name: string;
            slug: string;
            date_start: string | null;
            cover_image_url: string | null;
            cover_image: string | null;
          }
        | Array<{
            id: string;
            name: string;
            slug: string;
            date_start: string | null;
            cover_image_url: string | null;
            cover_image: string | null;
          }>
        | null;
    };

    const shaped = (quests as unknown as RawQuest[]).map((q) => {
      const subs = submissionsByQuestId.get(q.id) ?? [];
      const approved = subs.filter((s) => s.status === "approved").length;
      const pending = subs.filter((s) => s.status === "pending").length;
      const rejected = subs.filter(
        (s) => s.status === "rejected" || s.status === "requires_revision"
      ).length;
      const latest = subs[0] ?? null;

      const progress =
        progressByQuestId.get(q.id) ?? {
          current: Math.min(approved, q.max_completions ?? 1),
          target: q.max_completions ?? 1,
        };

      const eventRow = Array.isArray(q.event) ? q.event[0] ?? null : q.event;

      const promoter = q.promoter_id
        ? promoterByPromoterId.get(q.promoter_id) ?? null
        : null;

      return {
        id: q.id,
        title: q.title,
        subtitle: q.subtitle,
        instructions: q.instructions ?? q.description ?? null,
        kind: q.quest_type,
        platform: q.platform,
        proof_type: q.proof_type,
        xp_reward: q.xp_reward ?? q.points_reward ?? 0,
        ep_reward: q.ep_reward ?? q.currency_reward ?? 0,
        sales_target: q.sales_target,
        progress,
        max_completions: q.max_completions ?? 1,
        completed_count: approved,
        accepted: acceptedQuestIds.has(q.id),
        event: eventRow
          ? {
              id: eventRow.id,
              name: eventRow.name,
              slug: eventRow.slug,
              date_start: eventRow.date_start,
              cover_image_url:
                eventRow.cover_image_url ?? eventRow.cover_image ?? null,
            }
          : null,
        promoter: promoter
          ? {
              id: promoter.id,
              handle: promoter.handle,
              display_name: promoter.display_name,
              accent_hex: promoter.accent_hex,
            }
          : null,
        cover_image_url: q.cover_image_url ?? q.image_url ?? null,
        banner_image_url: q.banner_image_url,
        video_url: q.video_url,
        accent_hex: q.accent_hex,
        accent_hex_secondary: q.accent_hex_secondary,
        starts_at: q.starts_at,
        expires_at: q.expires_at,
        auto_approve: q.auto_approve,
        // Pre-built share payload — saves iOS a round trip to dashboard.
        // discount_code: per-promoter if the quest is promoter-scoped and
        // the rep has a code on that membership; else primary (first
        // approved membership's code). share_url: full deep-link to the
        // event with the code already in ?ref=, ready for the share card.
        // Both null when there's no code or no event to point at.
        discount_code: questDiscountCode(q.promoter_id),
        share_url: questShareUrl(eventRow?.slug ?? null, questDiscountCode(q.promoter_id)),
        my_submissions: {
          total: subs.length,
          approved,
          pending,
          rejected,
          latest: latest
            ? {
                id: latest.id,
                status: latest.status,
                submitted_at: latest.created_at,
                rejection_reason: latest.rejection_reason,
                requires_revision: latest.requires_revision,
              }
            : null,
        },
      };
    });

    return NextResponse.json({ data: shaped });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/quests] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
