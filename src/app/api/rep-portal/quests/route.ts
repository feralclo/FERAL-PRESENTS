import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import {
  buildQuestShareUrl,
  fetchPrimaryDomains,
} from "@/lib/rep-share-url";
import { getMuxThumbnailUrl, isMuxPlaybackId } from "@/lib/mux";
import * as Sentry from "@sentry/nextjs";

/** Resolve the best thumbnail URL for a quest_asset row. Mux video uses
 *  the thumbnail endpoint; everything else uses the canonical URL. */
function thumbForRow(row: {
  url: string;
  storage_key: string | null;
  mime_type: string | null;
}): string {
  const isVideo = (row.mime_type ?? "").startsWith("video/");
  if (isVideo && row.storage_key && isMuxPlaybackId(row.storage_key)) {
    return getMuxThumbnailUrl(row.storage_key);
  }
  return row.url;
}

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

    // Per-quest discount-code lookup. Per-promoter wins, primary fallback.
    const questDiscountCode = (promoterId: string | null): string | null => {
      if (promoterId) {
        const code = codeByPromoterId.get(promoterId);
        if (code) return code;
      }
      return primaryCode;
    };
    // share_url uses the event's tenant domain (for the "this is from MY
    // promoter" emotional read) — primary domains are fetched in batch
    // below once we know which org_ids the events span.

    // 2. Fetch quests: (promoter_id IN scoped) OR (promoter_id IS NULL,
    // platform-level — visible to everyone). Filter by event_id if given.
    let questQuery = db
      .from(TABLES.REP_QUESTS)
      .select(
        `
          id, org_id, title, subtitle, description, instructions, quest_type,
          platform, proof_type, xp_reward, points_reward, currency_reward,
          ep_reward, sales_target, max_completions, starts_at, expires_at,
          cover_image_url, image_url, banner_image_url, video_url,
          accent_hex, accent_hex_secondary, status, promoter_id, event_id,
          auto_approve, asset_mode, asset_campaign_tag,
          event:events(id, name, slug, date_start, cover_image_url, cover_image, org_id),
          promoter:promoters(org_id)
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
      org_id: string | null;
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
      asset_mode: "single" | "pool";
      asset_campaign_tag: string | null;
      event:
        | {
            id: string;
            name: string;
            slug: string;
            date_start: string | null;
            cover_image_url: string | null;
            cover_image: string | null;
            org_id: string;
          }
        | Array<{
            id: string;
            name: string;
            slug: string;
            date_start: string | null;
            cover_image_url: string | null;
            cover_image: string | null;
            org_id: string;
          }>
        | null;
      promoter:
        | { org_id: string | null }
        | Array<{ org_id: string | null }>
        | null;
    };

    // Batch-fetch primary domains for every unique org we'll build a
    // share_url for. We collect from quest.org_id, the event join, AND
    // the promoter join so pool / event-less quests still get their
    // tenant's branded host instead of falling back to entry.events.
    const rawQuests = quests as unknown as RawQuest[];
    const allOrgIds: string[] = [];
    for (const q of rawQuests) {
      const fromQuest = (q.org_id ?? "").trim();
      if (fromQuest) allOrgIds.push(fromQuest);
      const ev = Array.isArray(q.event) ? q.event[0] ?? null : q.event;
      if (ev?.org_id) allOrgIds.push(ev.org_id);
      const pr = Array.isArray(q.promoter) ? q.promoter[0] ?? null : q.promoter;
      if (pr?.org_id) allOrgIds.push(pr.org_id);
    }
    const domainsByOrgId = await fetchPrimaryDomains(allOrgIds);

    // Batch-fetch pool summaries for every pool quest. One query covers
    // every (org, tag) pair: filter by org_id IN (...) + tags overlap on
    // the union of tags, then bucket client-side. Avoids N+1 when a rep
    // has multiple pool quests across teams.
    type PoolSummary = {
      count: number;
      image_count: number;
      video_count: number;
      sample_thumbs: string[];
    };
    const poolSummaryByQuestId = new Map<string, PoolSummary>();
    const poolQuests = rawQuests.filter(
      (q) => q.asset_mode === "pool" && !!q.asset_campaign_tag
    );
    if (poolQuests.length > 0) {
      const orgIdsForPools: string[] = [];
      const tagsForPools: string[] = [];
      const orgIdByQuestId = new Map<string, string>();
      for (const q of poolQuests) {
        const ev = Array.isArray(q.event) ? q.event[0] ?? null : q.event;
        const oid = ev?.org_id ?? null;
        if (!oid || !q.asset_campaign_tag) continue;
        orgIdByQuestId.set(q.id, oid);
        orgIdsForPools.push(oid);
        tagsForPools.push(q.asset_campaign_tag);
      }
      const uniqueOrgIds = Array.from(new Set(orgIdsForPools));
      const uniqueTags = Array.from(new Set(tagsForPools));
      if (uniqueOrgIds.length > 0 && uniqueTags.length > 0) {
        const { data: poolRows } = await db
          .from("tenant_media")
          .select(
            "id, url, storage_key, mime_type, tags, org_id, created_at"
          )
          .in("org_id", uniqueOrgIds)
          .eq("kind", "quest_asset")
          .is("deleted_at", null)
          .overlaps("tags", uniqueTags)
          .order("created_at", { ascending: false });

        // Bucket by (org_id::tag) — a row tagged with multiple campaigns
        // counts in each bucket.
        const buckets = new Map<
          string,
          Array<{
            id: string;
            url: string;
            storage_key: string | null;
            mime_type: string | null;
          }>
        >();
        for (const row of (poolRows ?? []) as Array<{
          id: string;
          url: string;
          storage_key: string | null;
          mime_type: string | null;
          tags: string[] | null;
          org_id: string;
        }>) {
          const tags = row.tags ?? [];
          for (const tag of tags) {
            if (!uniqueTags.includes(tag)) continue;
            const key = `${row.org_id}::${tag}`;
            const list = buckets.get(key) ?? [];
            list.push(row);
            buckets.set(key, list);
          }
        }

        for (const q of poolQuests) {
          const oid = orgIdByQuestId.get(q.id);
          if (!oid || !q.asset_campaign_tag) continue;
          const list = buckets.get(`${oid}::${q.asset_campaign_tag}`) ?? [];
          let imageCount = 0;
          let videoCount = 0;
          for (const row of list) {
            if ((row.mime_type ?? "").startsWith("video/")) videoCount += 1;
            else imageCount += 1;
          }
          const sampleThumbs: string[] = [];
          for (const row of list.slice(0, 3)) {
            sampleThumbs.push(thumbForRow(row));
          }
          poolSummaryByQuestId.set(q.id, {
            count: list.length,
            image_count: imageCount,
            video_count: videoCount,
            sample_thumbs: sampleThumbs,
          });
        }
      }
    }

    const shaped = rawQuests.map((q) => {
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
        // the rep has a code on that membership; else primary. share_url:
        // full deep-link with the code in ?ref=, served from the tenant's
        // branded domain (custom or subdomain) for the "this is from MY
        // promoter" emotional read — falls through to entry.events if
        // the tenant has no primary domain registered.
        discount_code: questDiscountCode(q.promoter_id),
        share_url: buildQuestShareUrl({
          // Cascade quest.org_id → event.org_id → promoter.org_id so
          // pool / event-less quests still resolve to the right
          // tenant domain (and downstream, the right branded share).
          orgId:
            (q.org_id ?? "").trim() ||
            eventRow?.org_id ||
            (Array.isArray(q.promoter)
              ? q.promoter[0]?.org_id ?? null
              : q.promoter?.org_id ?? null) ||
            null,
          eventSlug: eventRow?.slug ?? null,
          code: questDiscountCode(q.promoter_id),
          domainsByOrgId,
        }),
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
        // Pool-quest fields (locked iOS contract — see
        // docs/ios-quest-pool-contract.md). `asset_pool` is null for
        // single-asset quests; iOS branches on `asset_mode`.
        asset_mode: q.asset_mode,
        asset_pool:
          q.asset_mode === "pool"
            ? poolSummaryByQuestId.get(q.id) ?? {
                count: 0,
                image_count: 0,
                video_count: 0,
                sample_thumbs: [],
              }
            : null,
      };
    });

    return NextResponse.json({ data: shaped });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/quests] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
