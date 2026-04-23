import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/admin/reps/pending-joins
 *
 * Returns a unified list of reps waiting on tenant approval, merging two
 * sources the admin Dashboard needs to see:
 *
 *   1. Legacy v1 — `reps.status = 'pending'` (reps created before v2 tables,
 *      no membership row yet). Includes no pitch.
 *   2. v2 — `rep_promoter_memberships.status = 'pending'` joined to this
 *      tenant's promoter (1:1 with org). Includes the free-text pitch the
 *      rep wrote on join-request.
 *
 * Response shape:
 *   {
 *     data: Array<{
 *       id: string;                   // rep.id
 *       source: "legacy" | "membership";
 *       membership_id?: string;       // only for membership source
 *       rep: { id, display_name, first_name, last_name, photo_url };
 *       pitch: string | null;         // null for legacy / no pitch written
 *       requested_at: string;         // ISO — created_at (legacy) or requested_at (membership)
 *     }>
 *   }
 *
 * Deduped on rep.id — if both sources reference the same rep (rare), the
 * membership row wins because it carries the pitch.
 */
export async function GET() {
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

    // Fetch both sources in parallel
    const [legacyRes, promoterRes] = await Promise.all([
      supabase
        .from("reps")
        .select(
          "id, display_name, first_name, last_name, photo_url, created_at"
        )
        .eq("org_id", orgId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("promoters")
        .select("id")
        .eq("org_id", orgId)
        .maybeSingle(),
    ]);

    const legacy = legacyRes.data ?? [];
    const promoterId = promoterRes.data?.id as string | undefined;

    type Member = {
      id: string;
      pitch: string | null;
      requested_at: string | null;
      rep: {
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        photo_url: string | null;
      } | null;
    };

    let memberships: Member[] = [];
    if (promoterId) {
      const { data } = await supabase
        .from("rep_promoter_memberships")
        .select(
          "id, pitch, requested_at, rep:reps(id, display_name, first_name, last_name, photo_url)"
        )
        .eq("promoter_id", promoterId)
        .eq("status", "pending")
        .order("requested_at", { ascending: false })
        .limit(100);
      memberships = ((data ?? []) as unknown[]).map((row) => {
        const r = row as Record<string, unknown>;
        const rep = Array.isArray(r.rep) ? r.rep[0] : r.rep;
        return {
          id: String(r.id),
          pitch: (r.pitch as string | null) ?? null,
          requested_at: (r.requested_at as string | null) ?? null,
          rep: rep
            ? {
                id: String((rep as Record<string, unknown>).id),
                display_name:
                  ((rep as Record<string, unknown>).display_name as
                    | string
                    | null) ?? null,
                first_name:
                  ((rep as Record<string, unknown>).first_name as
                    | string
                    | null) ?? null,
                last_name:
                  ((rep as Record<string, unknown>).last_name as
                    | string
                    | null) ?? null,
                photo_url:
                  ((rep as Record<string, unknown>).photo_url as
                    | string
                    | null) ?? null,
              }
            : null,
        };
      });
    }

    // Build unified list. Memberships win over legacy on rep-id collision
    // (they carry the pitch; legacy carries nothing extra).
    const seen = new Set<string>();
    const unified: Array<{
      id: string;
      source: "legacy" | "membership";
      membership_id?: string;
      rep: {
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        photo_url: string | null;
      };
      pitch: string | null;
      requested_at: string;
    }> = [];

    for (const m of memberships) {
      if (!m.rep) continue;
      seen.add(m.rep.id);
      unified.push({
        id: m.rep.id,
        source: "membership",
        membership_id: m.id,
        rep: m.rep,
        pitch: m.pitch,
        requested_at: m.requested_at ?? new Date().toISOString(),
      });
    }
    for (const r of legacy) {
      if (seen.has(r.id)) continue;
      unified.push({
        id: r.id,
        source: "legacy",
        rep: {
          id: r.id,
          display_name: r.display_name,
          first_name: r.first_name,
          last_name: r.last_name,
          photo_url: r.photo_url,
        },
        pitch: null,
        requested_at: r.created_at,
      });
    }

    unified.sort(
      (a, b) =>
        new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()
    );

    return NextResponse.json({ data: unified });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
