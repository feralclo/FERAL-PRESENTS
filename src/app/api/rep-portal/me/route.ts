import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";
import { syncRepDiscountCode } from "@/lib/discount-codes";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/me — Get current rep profile (protected)
 *
 * Returns the full rep row for the authenticated rep.
 */
export async function GET() {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;
    const orgId = auth.rep.org_id;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { data: rep, error } = await supabase
      .from(TABLES.REPS)
      .select("*")
      .eq("id", auth.rep.id)
      .eq("org_id", orgId)
      .single();

    if (error || !rep) {
      return NextResponse.json(
        { error: "Rep not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: rep });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/me] GET error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/rep-portal/me — Update rep profile (protected)
 *
 * Accepts: display_name, phone, photo_url, instagram, tiktok, bio, onboarding_completed.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;
    const orgId = auth.rep.org_id;

    const body = await request.json();
    const {
      display_name,
      phone,
      photo_url,
      instagram,
      tiktok,
      bio,
      date_of_birth,
      gender,
      onboarding_completed,
    } = body;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Validate display name: alphanumeric + underscores, 2-20 chars, globally unique, 30-day cooldown
    let gamertagChanging = false;
    if (display_name !== undefined && display_name !== null && display_name !== "") {
      const trimmed = typeof display_name === "string" ? display_name.trim() : "";
      if (trimmed.length < 2 || trimmed.length > 20) {
        return NextResponse.json({ error: "Rep name must be 2–20 characters" }, { status: 400 });
      }
      if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
        return NextResponse.json({ error: "Rep name can only contain letters, numbers, and underscores" }, { status: 400 });
      }

      // Check if gamertag is actually changing
      const { data: currentRep } = await supabase
        .from(TABLES.REPS)
        .select("display_name, display_name_changed_at")
        .eq("id", auth.rep.id)
        .single();

      gamertagChanging = !!(currentRep && currentRep.display_name?.toLowerCase() !== trimmed.toLowerCase());

      if (gamertagChanging) {
        // 30-day cooldown (skip if first time setting gamertag)
        if (currentRep!.display_name && currentRep!.display_name_changed_at) {
          const lastChanged = new Date(currentRep!.display_name_changed_at).getTime();
          const daysSince = (Date.now() - lastChanged) / (1000 * 60 * 60 * 24);
          if (daysSince < 30) {
            const daysLeft = Math.ceil(30 - daysSince);
            return NextResponse.json(
              { error: `You can change your rep name in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, code: "cooldown", days_left: daysLeft },
              { status: 429 }
            );
          }
        }

        // Check global uniqueness (case-insensitive)
        const { data: existing } = await supabase
          .from(TABLES.REPS)
          .select("id")
          .ilike("display_name", trimmed)
          .neq("id", auth.rep.id)
          .limit(1)
          .maybeSingle();

        if (existing) {
          return NextResponse.json({ error: "That rep name is already taken" }, { status: 409 });
        }
      }
    }
    if (display_name !== undefined && typeof display_name === "string" && display_name.length > 20) {
      return NextResponse.json({ error: "Rep name must be 20 characters or less" }, { status: 400 });
    }
    if (bio !== undefined && typeof bio === "string" && bio.length > 500) {
      return NextResponse.json({ error: "Bio must be 500 characters or less" }, { status: 400 });
    }
    if (instagram !== undefined && typeof instagram === "string" && instagram.length > 30) {
      return NextResponse.json({ error: "Instagram handle must be 30 characters or less" }, { status: 400 });
    }
    if (tiktok !== undefined && typeof tiktok === "string" && tiktok.length > 30) {
      return NextResponse.json({ error: "TikTok handle must be 30 characters or less" }, { status: 400 });
    }
    if (gender !== undefined && gender !== null && !["male", "female", "non-binary", "prefer-not-to-say"].includes(gender)) {
      return NextResponse.json({ error: "Invalid gender value" }, { status: 400 });
    }
    if (phone !== undefined && typeof phone === "string" && phone.length > 20) {
      return NextResponse.json({ error: "Phone must be 20 characters or less" }, { status: 400 });
    }
    if (photo_url !== undefined && typeof photo_url === "string" && photo_url.length > 2000) {
      return NextResponse.json({ error: "Photo URL too long" }, { status: 400 });
    }
    if (date_of_birth !== undefined && date_of_birth !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date_of_birth)) {
      return NextResponse.json({ error: "date_of_birth must be YYYY-MM-DD format" }, { status: 400 });
    }

    // Build update payload — only include provided fields
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (display_name !== undefined) {
      updatePayload.display_name = display_name;
      if (gamertagChanging) {
        updatePayload.display_name_changed_at = new Date().toISOString();
      }
    }
    if (phone !== undefined) updatePayload.phone = phone || null;
    if (photo_url !== undefined) updatePayload.photo_url = photo_url || null;
    if (instagram !== undefined) updatePayload.instagram = instagram || null;
    if (tiktok !== undefined) updatePayload.tiktok = tiktok || null;
    if (bio !== undefined) updatePayload.bio = bio || null;
    if (date_of_birth !== undefined) updatePayload.date_of_birth = date_of_birth || null;
    if (gender !== undefined) updatePayload.gender = gender || null;
    if (onboarding_completed !== undefined) {
      updatePayload.onboarding_completed = Boolean(onboarding_completed);
    }

    const { data: rep, error } = await supabase
      .from(TABLES.REPS)
      .update(updatePayload)
      .eq("id", auth.rep.id)
      .eq("org_id", orgId)
      .select("*")
      .single();

    if (error) {
      console.error("[rep-portal/me] Update error:", error);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    // Sync discount code when display_name changes (await so dashboard reload sees the new code)
    if (display_name !== undefined && rep?.display_name) {
      try {
        const syncResult = await syncRepDiscountCode({
          repId: auth.rep.id,
          orgId,
          newDisplayName: rep.display_name,
        });

        // If no discount existed to sync, create one with the new name
        if (!syncResult) {
          const { getOrCreateRepDiscount } = await import("@/lib/discount-codes");
          await getOrCreateRepDiscount({
            repId: auth.rep.id,
            orgId,
            firstName: rep.first_name || "Rep",
            displayName: rep.display_name,
          });
        }
      } catch (err) {
        console.error("[rep-portal/me] Discount sync error:", err);
      }
    }

    return NextResponse.json({ data: rep });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/me] PUT error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/rep-portal/me
 *
 * App Store requirement (guideline 5.1.1(v)) for apps that offer in-app
 * account creation. Soft-delete:
 *   • reps.status = 'deleted'
 *   • PII scrubbed: email → deleted-{id_prefix}@entry.local, name / photo /
 *     phone / bio / socials / DOB / gender blanked, auth_user_id detached
 *   • device_tokens + rep_push_subscriptions removed so we stop pushing
 *   • Supabase auth user deleted (their JWT stops working on refresh)
 *
 * rep.id is PRESERVED so historical FKs stay valid (orders.metadata.rep_id,
 * ep_ledger.rep_id, rep_reward_claims.rep_id). Money history can never
 * orphan. A deleted rep cannot be recovered — they must sign up fresh
 * (and can reuse their email since we've scrubbed the old one).
 *
 * Response: { data: { deleted: true } }
 */
export async function DELETE() {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const repId = auth.rep.id;
    const authUserId = auth.rep.auth_user_id;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const scrubbedEmail = `deleted-${repId.slice(0, 8)}@entry.local`;

    // 1. Scrub PII + flip status
    const { error: repError } = await supabase
      .from(TABLES.REPS)
      .update({
        status: "deleted",
        email: scrubbedEmail,
        first_name: null,
        last_name: null,
        display_name: null,
        phone: null,
        photo_url: null,
        bio: null,
        instagram: null,
        tiktok: null,
        date_of_birth: null,
        gender: null,
        auth_user_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", repId);

    if (repError) {
      Sentry.captureException(repError, { extra: { repId } });
      return NextResponse.json(
        { error: "Failed to scrub rep data" },
        { status: 500 }
      );
    }

    // 2. Stop pushing to this rep — remove every registered device
    await supabase.from("device_tokens").delete().eq("rep_id", repId);
    await supabase.from("rep_push_subscriptions").delete().eq("rep_id", repId);

    // 3. Drop the rep's live memberships to pending-rejected rather than
    // keeping them 'approved' — prevents a fresh signup with the same
    // email from inheriting the deleted rep's teams.
    await supabase
      .from("rep_promoter_memberships")
      .update({
        status: "left",
        left_at: new Date().toISOString(),
      })
      .eq("rep_id", repId)
      .in("status", ["pending", "approved"]);

    // 4. Revoke auth — delete the Supabase auth user so their JWT is
    // invalidated on refresh. Best-effort; failure here is logged but
    // doesn't undo the scrub.
    if (authUserId) {
      try {
        await supabase.auth.admin.deleteUser(authUserId);
      } catch (err) {
        Sentry.captureException(err, {
          extra: { step: "auth.admin.deleteUser", repId, authUserId },
          level: "warning",
        });
      }
    }

    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/me] DELETE error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
