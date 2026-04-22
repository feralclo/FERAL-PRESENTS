import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRepAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

const MAX_PITCH_LENGTH = 500;

/**
 * POST /api/rep-portal/promoters/[handle]/join-request
 *
 * Rep requests to join a promoter's team. Creates a rep_promoter_memberships
 * row with status='pending'. Tenants review pending requests and approve /
 * reject from /admin/team/requests/ (Phase 2+).
 *
 * Body (optional): { pitch: string } — short message the rep sends with
 * the request (max 500 chars).
 *
 * Semantics:
 *   - Idempotent: if a pending/approved row already exists, returns that
 *     row unchanged.
 *   - If status='rejected' or 'left', overwrites it with a fresh 'pending'
 *     row — reps get a second shot.
 *   - 404 if promoter doesn't exist / is private.
 *
 * Response: { data: { membership: { id, status, requested_at } } }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const { handle: rawHandle } = await params;
    const handle = rawHandle.toLowerCase().replace(/^@/, "");

    let pitch: string | null = null;
    try {
      const body = await request.json().catch(() => null);
      if (body && typeof body.pitch === "string") {
        const trimmed = body.pitch.trim();
        if (trimmed.length > MAX_PITCH_LENGTH) {
          return NextResponse.json(
            {
              error: `pitch must be ${MAX_PITCH_LENGTH} characters or fewer`,
            },
            { status: 400 }
          );
        }
        pitch = trimmed || null;
      }
    } catch {
      // body is optional — no body is fine
    }

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Resolve promoter by handle. Block private promoters from receiving
    // public-handle join requests — for a private promoter, reps must be
    // invited directly (future flow), not discover via handle.
    const { data: promoter } = await db
      .from("promoters")
      .select("id, visibility")
      .ilike("handle", handle)
      .maybeSingle();

    if (!promoter) {
      return NextResponse.json(
        { error: "Promoter not found" },
        { status: 404 }
      );
    }

    if (promoter.visibility === "private") {
      return NextResponse.json(
        { error: "This team is invite-only" },
        { status: 403 }
      );
    }

    // Check for an existing membership row
    const { data: existing } = await db
      .from("rep_promoter_memberships")
      .select("id, status, requested_at")
      .eq("rep_id", auth.rep.id)
      .eq("promoter_id", promoter.id)
      .maybeSingle();

    if (existing) {
      if (existing.status === "pending" || existing.status === "approved") {
        // Already pending or already on team — return as-is, no-op.
        return NextResponse.json({ data: { membership: existing } });
      }
      // Was rejected or left — flip back to pending with fresh timestamp.
      const { data, error } = await db
        .from("rep_promoter_memberships")
        .update({
          status: "pending",
          pitch,
          requested_at: new Date().toISOString(),
          approved_at: null,
          left_at: null,
          rejected_reason: null,
        })
        .eq("id", existing.id)
        .select("id, status, requested_at")
        .single();
      if (error) {
        Sentry.captureException(error, { extra: { membershipId: existing.id } });
        return NextResponse.json(
          { error: "Failed to refresh join request" },
          { status: 500 }
        );
      }
      return NextResponse.json({ data: { membership: data } });
    }

    // Fresh request
    const { data, error } = await db
      .from("rep_promoter_memberships")
      .insert({
        rep_id: auth.rep.id,
        promoter_id: promoter.id,
        status: "pending",
        pitch,
      })
      .select("id, status, requested_at")
      .single();

    if (error) {
      Sentry.captureException(error, {
        extra: { repId: auth.rep.id, promoterId: promoter.id },
      });
      return NextResponse.json(
        { error: "Failed to submit join request" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { membership: data } });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/promoters/[handle]/join-request] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/rep-portal/promoters/[handle]/join-request
 *
 * Withdraw a pending join request. Idempotent — returns 200 even if no
 * pending request exists. Leaves approved memberships alone (different
 * endpoint/flow needed for leaving a team).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const { handle: rawHandle } = await params;
    const handle = rawHandle.toLowerCase().replace(/^@/, "");

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { data: promoter } = await db
      .from("promoters")
      .select("id")
      .ilike("handle", handle)
      .maybeSingle();

    if (!promoter) {
      return NextResponse.json(
        { error: "Promoter not found" },
        { status: 404 }
      );
    }

    const { error } = await db
      .from("rep_promoter_memberships")
      .delete()
      .eq("rep_id", auth.rep.id)
      .eq("promoter_id", promoter.id)
      .eq("status", "pending");

    if (error) {
      Sentry.captureException(error, {
        extra: { repId: auth.rep.id, promoterId: promoter.id },
      });
      return NextResponse.json(
        { error: "Failed to withdraw request" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { withdrawn: true, promoter_id: promoter.id },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/promoters/[handle]/join-request] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
