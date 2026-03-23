import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, guestListSubmissionsKey } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

interface SubmissionLink {
  token: string;
  event_id: string;
  artist_name: string;
  created_at: string;
  active: boolean;
}

interface SubmittedGuest {
  name: string;
  email?: string;
  phone?: string;
  qty?: number;
}

/**
 * Resolve submission link token → { event_id, artist_name, org_id }
 */
async function resolveSubmissionToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  token: string
): Promise<{ link: SubmissionLink; orgId: string } | null> {
  // Search all org submission settings for the token
  const { data: rows } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("key, data")
    .like("key", "%_guest_list_submissions");

  if (!rows) return null;

  for (const row of rows) {
    const links = (row.data as SubmissionLink[]) || [];
    const link = links.find((l: SubmissionLink) => l.token === token && l.active);
    if (link) {
      // Extract org_id from key: "{org_id}_guest_list_submissions"
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

    // Fetch branding for page styling
    const { data: brandingRow } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", `${resolved.orgId}_branding`)
      .single();

    const branding = (brandingRow?.data as Record<string, string>) || {};

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
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/guest-list/submit/[token] — Submit guest names (public)
 * Body: { guests: [{ name, email?, phone?, qty? }] }
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

    // Check existing submissions for this token (cap at 100 total per link)
    const { count: existingCount } = await supabase
      .from(TABLES.GUEST_LIST)
      .select("id", { count: "exact", head: true })
      .eq("submission_token", token)
      .eq("org_id", resolved.orgId);

    if ((existingCount || 0) + guests.length > 100) {
      return NextResponse.json(
        { error: `Maximum 100 guests per submission link. ${existingCount || 0} already submitted.` },
        { status: 400 }
      );
    }

    // Validate each guest has at least a name
    const validGuests: SubmittedGuest[] = [];
    for (const g of guests) {
      if (!g.name?.trim()) continue;
      validGuests.push({
        name: g.name.trim(),
        email: g.email?.trim() || undefined,
        phone: g.phone?.trim() || undefined,
        qty: Math.min(Math.max(parseInt(g.qty, 10) || 1, 1), 10),
      });
    }

    if (validGuests.length === 0) {
      return NextResponse.json({ error: "No valid guests provided" }, { status: 400 });
    }

    // Insert all as pending entries
    const rows = validGuests.map((g) => ({
      org_id: resolved.orgId,
      event_id: resolved.link.event_id,
      name: g.name,
      email: g.email || null,
      phone: g.phone || null,
      qty: g.qty || 1,
      status: "pending",
      access_level: "artist",
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
