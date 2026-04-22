import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRepAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/me/memberships
 *
 * Returns the rep's full promoter-membership list, grouped by status.
 * iOS shows these on "Your Teams" / pending requests screens.
 *
 * Response:
 *   {
 *     data: {
 *       approved: Membership[],
 *       pending: Membership[],
 *       rejected: Membership[],
 *       left: Membership[]
 *     }
 *   }
 */
export async function GET() {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { data, error } = await db
      .from("rep_promoter_memberships")
      .select(
        "id, status, discount_code, discount_percent, pitch, requested_at, approved_at, left_at, rejected_reason, promoter:promoters(id, handle, display_name, tagline, accent_hex, avatar_url, avatar_initials, avatar_bg_hex, cover_image_url, follower_count, team_size)"
      )
      .eq("rep_id", auth.rep.id)
      .order("requested_at", { ascending: false });

    if (error) {
      Sentry.captureException(error, { extra: { repId: auth.rep.id } });
      return NextResponse.json(
        { error: "Failed to load memberships" },
        { status: 500 }
      );
    }

    type Promoter = {
      id: string;
      handle: string;
      display_name: string;
      tagline: string | null;
      accent_hex: number;
      avatar_url: string | null;
      avatar_initials: string | null;
      avatar_bg_hex: number | null;
      cover_image_url: string | null;
      follower_count: number;
      team_size: number;
    };
    type Row = {
      id: string;
      status: "approved" | "pending" | "rejected" | "left";
      discount_code: string | null;
      discount_percent: number | null;
      pitch: string | null;
      requested_at: string;
      approved_at: string | null;
      left_at: string | null;
      rejected_reason: string | null;
      promoter: Promoter | Promoter[] | null;
    };

    const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      status: r.status,
      discount_code: r.discount_code,
      discount_percent: r.discount_percent,
      pitch: r.pitch,
      requested_at: r.requested_at,
      approved_at: r.approved_at,
      left_at: r.left_at,
      rejected_reason: r.rejected_reason,
      promoter: Array.isArray(r.promoter) ? r.promoter[0] ?? null : r.promoter,
    }));

    const grouped = {
      approved: rows.filter((r) => r.status === "approved"),
      pending: rows.filter((r) => r.status === "pending"),
      rejected: rows.filter((r) => r.status === "rejected"),
      left: rows.filter((r) => r.status === "left"),
    };

    return NextResponse.json({ data: grouped });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/me/memberships] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
