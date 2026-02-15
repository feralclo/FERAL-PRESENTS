import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";

/**
 * GET /api/rep-portal/me — Get current rep profile (protected)
 *
 * Returns the full rep row for the authenticated rep.
 */
export async function GET() {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const supabase = await getSupabaseServer();
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
      .eq("org_id", ORG_ID)
      .single();

    if (error || !rep) {
      return NextResponse.json(
        { error: "Rep not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: rep });
  } catch (err) {
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
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

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

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Validate field lengths
    if (display_name !== undefined && typeof display_name === "string" && display_name.length > 50) {
      return NextResponse.json({ error: "Display name must be 50 characters or less" }, { status: 400 });
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
    if (gender !== undefined && gender !== null && !["male", "female", "non-binary", "other", "prefer-not-to-say"].includes(gender)) {
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

    if (display_name !== undefined) updatePayload.display_name = display_name;
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
      .eq("org_id", ORG_ID)
      .select("*")
      .single();

    if (error) {
      console.error("[rep-portal/me] Update error:", error);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: rep });
  } catch (err) {
    console.error("[rep-portal/me] PUT error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
