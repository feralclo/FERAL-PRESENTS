import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, guestListSubmissionsKey } from "@/lib/constants";
import type { SubmissionLink } from "@/types/guest-list";
import type { AccessLevel } from "@/types/orders";
import * as Sentry from "@sentry/nextjs";

interface SubmittedGuest {
  name: string;
  email?: string;
  phone?: string;
  qty?: number;
  access_level?: AccessLevel;
}

/**
 * Resolve submission link token → { link, orgId }
 */
async function resolveSubmissionToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  token: string
): Promise<{ link: SubmissionLink; orgId: string } | null> {
  const { data: rows } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("key, data")
    .like("key", "%_guest_list_submissions");

  if (!rows) return null;

  for (const row of rows) {
    const links = (row.data as SubmissionLink[]) || [];
    const link = links.find((l: SubmissionLink) => l.token === token && l.active);
    if (link) {
      const orgId = (row.key as string).replace("_guest_list_submissions", "");
      return { link, orgId };
    }
  }

  return null;
}

/**
 * GET /api/guest-list/submit/[token] — Fetch submission form data (public)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const resolved = await resolveSubmissionToken(supabase, token);
    if (!resolved) {
      return NextResponse.json({ error: "Invalid or expired submission link" }, { status: 404 });
    }

    // Fetch event details
    const { data: event } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name, venue_name, date_start, doors_time")
      .eq("id", resolved.link.event_id)
      .eq("org_id", resolved.orgId)
      .single();

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Fetch branding
    const { data: brandingRow } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", `${resolved.orgId}_branding`)
      .single();

    const branding = (brandingRow?.data as Record<string, string>) || {};

    // Calculate quota remaining if quotas exist
    let quotaRemaining: Partial<Record<AccessLevel, number | null>> | undefined;

    if (resolved.link.quotas) {
      // Count existing submissions by access_level
      const { data: existing } = await supabase
        .from(TABLES.GUEST_LIST)
        .select("access_level")
        .eq("submission_token", token)
        .eq("org_id", resolved.orgId);

      const usedCounts = new Map<string, number>();
      for (const row of existing || []) {
        const level = (row.access_level as string) || "artist";
        usedCounts.set(level, (usedCounts.get(level) || 0) + 1);
      }

      quotaRemaining = {};
      for (const [level, quota] of Object.entries(resolved.link.quotas)) {
        if (quota === null || quota === undefined) {
          quotaRemaining[level as AccessLevel] = null;
        } else {
          quotaRemaining[level as AccessLevel] = Math.max(0, quota - (usedCounts.get(level) || 0));
        }
      }
    }

    return NextResponse.json({
      artist_name: resolved.link.artist_name,
      event: {
        name: event.name,
        venue_name: event.venue_name,
        date_start: event.date_start,
        doors_time: event.doors_time,
      },
      branding: {
        org_name: branding.org_name || resolved.orgId,
        logo_url: branding.logo_url || null,
        accent_color: branding.accent_color || "#8B5CF6",
      },
      quotas: resolved.link.quotas || null,
      quota_remaining: quotaRemaining || null,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/guest-list/submit/[token] — Submit guest names (public)
 * Body: { guests: [{ name, email?, phone?, qty?, access_level? }] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { guests } = await request.json();

    if (!Array.isArray(guests) || guests.length === 0) {
      return NextResponse.json({ error: "No guests provided" }, { status: 400 });
    }

    if (guests.length > 50) {
      return NextResponse.json({ error: "Maximum 50 guests per submission" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const resolved = await resolveSubmissionToken(supabase, token);
    if (!resolved) {
      return NextResponse.json({ error: "Invalid or expired submission link" }, { status: 404 });
    }

    // Validate guests
    const validGuests: SubmittedGuest[] = [];
    for (const g of guests) {
      if (!g.name?.trim()) continue;

      // Determine access level: use provided level, or default
      const hasQuotas = resolved.link.quotas && Object.keys(resolved.link.quotas).length > 0;
      const defaultLevel: AccessLevel = hasQuotas ? "guest_list" : "artist";
      const level = (g.access_level as AccessLevel) || defaultLevel;

      validGuests.push({
        name: g.name.trim(),
        email: g.email?.trim() || undefined,
        phone: g.phone?.trim() || undefined,
        qty: Math.min(Math.max(parseInt(g.qty, 10) || 1, 1), 10),
        access_level: level,
      });
    }

    if (validGuests.length === 0) {
      return NextResponse.json({ error: "No valid guests provided" }, { status: 400 });
    }

    // Check total cap per submission link (100 max)
    const { count: existingTotal } = await supabase
      .from(TABLES.GUEST_LIST)
      .select("id", { count: "exact", head: true })
      .eq("submission_token", token)
      .eq("org_id", resolved.orgId);

    if ((existingTotal || 0) + validGuests.length > 100) {
      return NextResponse.json(
        { error: `Maximum 100 guests per submission link. ${existingTotal || 0} already submitted.` },
        { status: 400 }
      );
    }

    // Enforce per-access-level quotas
    if (resolved.link.quotas && Object.keys(resolved.link.quotas).length > 0) {
      // Count existing by access_level
      const { data: existingRows } = await supabase
        .from(TABLES.GUEST_LIST)
        .select("access_level")
        .eq("submission_token", token)
        .eq("org_id", resolved.orgId);

      const usedCounts = new Map<string, number>();
      for (const row of existingRows || []) {
        const level = (row.access_level as string) || "artist";
        usedCounts.set(level, (usedCounts.get(level) || 0) + 1);
      }

      // Count incoming per level
      const incomingCounts = new Map<string, number>();
      for (const g of validGuests) {
        const level = g.access_level || "guest_list";
        incomingCounts.set(level, (incomingCounts.get(level) || 0) + 1);
      }

      // Check each level
      for (const [level, incoming] of incomingCounts) {
        const quota = resolved.link.quotas[level as keyof typeof resolved.link.quotas];
        if (quota === null || quota === undefined) continue; // unlimited
        const used = usedCounts.get(level) || 0;
        const remaining = quota - used;

        if (incoming > remaining) {
          const levelLabel = level === "guest_list" ? "Guest List" : level.toUpperCase();
          return NextResponse.json(
            {
              error: `${levelLabel} quota exceeded: ${quota} allowed, ${remaining} remaining, ${incoming} requested.`,
              quota_remaining: { [level]: remaining },
            },
            { status: 400 }
          );
        }
      }
    }

    // Insert entries
    const rows = validGuests.map((g) => ({
      org_id: resolved.orgId,
      event_id: resolved.link.event_id,
      name: g.name,
      email: g.email || null,
      phone: g.phone || null,
      qty: g.qty || 1,
      status: "pending",
      access_level: g.access_level || "artist",
      submitted_by: resolved.link.artist_name,
      submission_token: token,
      added_by: resolved.link.artist_name,
    }));

    const { error } = await supabase
      .from(TABLES.GUEST_LIST)
      .insert(rows);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: validGuests.length,
      message: `${validGuests.length} guest${validGuests.length === 1 ? "" : "s"} submitted for review.`,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
