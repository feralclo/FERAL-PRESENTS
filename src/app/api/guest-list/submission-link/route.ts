import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, guestListSubmissionsKey } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { generateSubmissionToken } from "@/lib/guest-list";
import * as Sentry from "@sentry/nextjs";

interface SubmissionLink {
  token: string;
  event_id: string;
  artist_name: string;
  created_at: string;
  active: boolean;
}

/**
 * POST /api/guest-list/submission-link — Generate a DJ/artist submission link
 * Body: { event_id: string, artist_name: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { event_id, artist_name } = await request.json();

    if (!event_id || !artist_name?.trim()) {
      return NextResponse.json(
        { error: "Missing event_id or artist_name" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Fetch existing submission links
    const settingsKey = guestListSubmissionsKey(orgId);
    const { data: existing } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", settingsKey)
      .single();

    const links: SubmissionLink[] = (existing?.data as SubmissionLink[]) || [];

    // Generate new link
    const token = generateSubmissionToken();
    const newLink: SubmissionLink = {
      token,
      event_id,
      artist_name: artist_name.trim(),
      created_at: new Date().toISOString(),
      active: true,
    };

    links.push(newLink);

    // Upsert settings
    await supabase
      .from(TABLES.SITE_SETTINGS)
      .upsert(
        { key: settingsKey, data: links, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

    // Resolve tenant URL for the submission link
    const { data: domain } = await supabase
      .from(TABLES.DOMAINS)
      .select("hostname")
      .eq("org_id", orgId)
      .eq("is_primary", true)
      .eq("status", "active")
      .single();

    const baseUrl = domain?.hostname
      ? `https://${domain.hostname}`
      : (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");

    return NextResponse.json({
      token,
      url: `${baseUrl}/guest-list/submit/${token}`,
      artist_name: artist_name.trim(),
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * GET /api/guest-list/submission-link — List all submission links for an org
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const settingsKey = guestListSubmissionsKey(orgId);
    const { data } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", settingsKey)
      .single();

    const links: SubmissionLink[] = (data?.data as SubmissionLink[]) || [];

    return NextResponse.json({ links: links.filter((l) => l.active) });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
