import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { RESERVED_SLUGS } from "@/lib/signup";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/admin/promoter
 *
 * Returns the tenant's own promoter row (the public-facing projection of
 * their org). Source of truth for what reps, the iOS/Android/web-v2 clients,
 * and the public /api/promoters/[handle] endpoint read.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const db = await getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: promoter, error } = await db
    .from("promoters")
    .select("*")
    .eq("org_id", auth.orgId)
    .single();

  if (error || !promoter) {
    Sentry.captureException(error ?? new Error("promoter row missing"), {
      extra: { orgId: auth.orgId },
    });
    return NextResponse.json(
      { error: "Promoter profile not found for this tenant" },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: promoter });
}

// ---------------------------------------------------------------------------
// Editable fields — anything else in the body is ignored
// ---------------------------------------------------------------------------

const HANDLE_REGEX = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

type PatchInput = {
  handle?: unknown;
  display_name?: unknown;
  tagline?: unknown;
  bio?: unknown;
  location?: unknown;
  accent_hex?: unknown;
  avatar_url?: unknown;
  avatar_initials?: unknown;
  avatar_bg_hex?: unknown;
  cover_image_url?: unknown;
  website?: unknown;
  instagram?: unknown;
  tiktok?: unknown;
  visibility?: unknown;
};

type PatchUpdate = Partial<{
  handle: string;
  display_name: string;
  tagline: string | null;
  bio: string | null;
  location: string | null;
  accent_hex: number;
  avatar_url: string | null;
  avatar_initials: string | null;
  avatar_bg_hex: number | null;
  cover_image_url: string | null;
  website: string | null;
  instagram: string | null;
  tiktok: string | null;
  visibility: "public" | "private";
}>;

function validateString(
  value: unknown,
  field: string,
  opts: { min?: number; max: number; nullable?: boolean }
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === null || value === "") {
    if (opts.nullable) return { ok: true, value: null };
    return { ok: false, error: `${field} cannot be empty` };
  }
  if (typeof value !== "string") {
    return { ok: false, error: `${field} must be a string` };
  }
  const trimmed = value.trim();
  if (opts.min !== undefined && trimmed.length < opts.min) {
    return { ok: false, error: `${field} must be at least ${opts.min} characters` };
  }
  if (trimmed.length > opts.max) {
    return { ok: false, error: `${field} must be at most ${opts.max} characters` };
  }
  return { ok: true, value: trimmed };
}

/**
 * PATCH /api/admin/promoter
 *
 * Partial update of the tenant's promoter profile. Silently ignores any
 * system-managed fields (id, org_id, follower_count, team_size, timestamps).
 *
 * Handle changes validate against RESERVED_SLUGS and uniqueness across all
 * promoters.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  let body: PatchInput;
  try {
    body = (await request.json()) as PatchInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: PatchUpdate = {};

  // handle — format + reserved + uniqueness check. A single handle lookup
  // serves double duty: detects conflicts AND detects whether the submitted
  // value is the tenant's own current handle (idempotent save, bypasses
  // RESERVED_SLUGS so tenants can save even if their own handle happens to
  // match a reserved word, e.g. FERAL's "feral").
  if (body.handle !== undefined) {
    if (typeof body.handle !== "string") {
      return NextResponse.json({ error: "handle must be a string" }, { status: 400 });
    }
    const handle = body.handle.trim().toLowerCase();

    // Regex first — format errors fail fast, no DB hit
    if (!HANDLE_REGEX.test(handle)) {
      return NextResponse.json(
        {
          error:
            "handle must be 3–32 chars, lowercase letters, numbers, hyphens; cannot start or end with a hyphen",
        },
        { status: 400 }
      );
    }

    // Look up any existing promoter with this handle
    const dbForHandle = await getSupabaseAdmin();
    if (!dbForHandle) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    const { data: existing } = await dbForHandle
      .from("promoters")
      .select("org_id")
      .eq("handle", handle)
      .limit(1)
      .single();

    const isOwnHandle = !!existing && existing.org_id === auth.orgId;

    if (existing && !isOwnHandle) {
      return NextResponse.json(
        { error: `@${handle} is already taken` },
        { status: 409 }
      );
    }

    // RESERVED slug blocks only when genuinely claiming it (not keeping own).
    if (!isOwnHandle && RESERVED_SLUGS.has(handle)) {
      return NextResponse.json(
        { error: `@${handle} is reserved — try another` },
        { status: 400 }
      );
    }

    update.handle = handle;
  }

  if (body.display_name !== undefined) {
    const r = validateString(body.display_name, "display_name", { min: 2, max: 50 });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    update.display_name = r.value!;
  }

  if (body.tagline !== undefined) {
    const r = validateString(body.tagline, "tagline", { max: 100, nullable: true });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    update.tagline = r.value;
  }

  if (body.bio !== undefined) {
    const r = validateString(body.bio, "bio", { max: 500, nullable: true });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    update.bio = r.value;
  }

  if (body.location !== undefined) {
    const r = validateString(body.location, "location", { max: 80, nullable: true });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    update.location = r.value;
  }

  if (body.accent_hex !== undefined) {
    if (
      typeof body.accent_hex !== "number" ||
      !Number.isInteger(body.accent_hex) ||
      body.accent_hex < 0 ||
      body.accent_hex > 0xffffff
    ) {
      return NextResponse.json(
        { error: "accent_hex must be an integer 0..0xFFFFFF" },
        { status: 400 }
      );
    }
    update.accent_hex = body.accent_hex;
  }

  if (body.avatar_bg_hex !== undefined) {
    if (body.avatar_bg_hex === null) {
      update.avatar_bg_hex = null;
    } else if (
      typeof body.avatar_bg_hex !== "number" ||
      !Number.isInteger(body.avatar_bg_hex) ||
      body.avatar_bg_hex < 0 ||
      body.avatar_bg_hex > 0xffffff
    ) {
      return NextResponse.json(
        { error: "avatar_bg_hex must be an integer 0..0xFFFFFF or null" },
        { status: 400 }
      );
    } else {
      update.avatar_bg_hex = body.avatar_bg_hex;
    }
  }

  if (body.avatar_url !== undefined) {
    const r = validateString(body.avatar_url, "avatar_url", { max: 2000, nullable: true });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    update.avatar_url = r.value;
  }

  if (body.avatar_initials !== undefined) {
    const r = validateString(body.avatar_initials, "avatar_initials", {
      max: 3,
      nullable: true,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    update.avatar_initials = r.value ? r.value.toUpperCase() : null;
  }

  if (body.cover_image_url !== undefined) {
    const r = validateString(body.cover_image_url, "cover_image_url", {
      max: 2000,
      nullable: true,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    update.cover_image_url = r.value;
  }

  if (body.website !== undefined) {
    const r = validateString(body.website, "website", { max: 200, nullable: true });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    update.website = r.value;
  }

  if (body.instagram !== undefined) {
    const r = validateString(body.instagram, "instagram", { max: 50, nullable: true });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    // strip leading @ if user typed it
    update.instagram = r.value ? r.value.replace(/^@+/, "") : null;
  }

  if (body.tiktok !== undefined) {
    const r = validateString(body.tiktok, "tiktok", { max: 50, nullable: true });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    update.tiktok = r.value ? r.value.replace(/^@+/, "") : null;
  }

  if (body.visibility !== undefined) {
    if (body.visibility !== "public" && body.visibility !== "private") {
      return NextResponse.json(
        { error: "visibility must be 'public' or 'private'" },
        { status: 400 }
      );
    }
    update.visibility = body.visibility;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const db = await getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // (Handle uniqueness already resolved upstream — safe to UPDATE directly.)

  const { data, error } = await db
    .from("promoters")
    .update(update)
    .eq("org_id", auth.orgId)
    .select()
    .single();

  if (error) {
    Sentry.captureException(error, { extra: { orgId: auth.orgId, update } });
    return NextResponse.json(
      { error: "Failed to update promoter profile" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}
