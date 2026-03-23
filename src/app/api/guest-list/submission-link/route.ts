import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, guestListSubmissionsKey } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { generateSubmissionToken, sendSubmissionLinkEmail } from "@/lib/guest-list";
import type { SubmissionLink, SubmissionLinkWithUsage } from "@/types/guest-list";
import type { AccessLevel } from "@/types/orders";
import * as Sentry from "@sentry/nextjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveTenantBaseUrl(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string
): Promise<string> {
  const { data: domain } = await supabase
    .from(TABLES.DOMAINS)
    .select("hostname")
    .eq("org_id", orgId)
    .eq("is_primary", true)
    .eq("status", "active")
    .single();

  return domain?.hostname
    ? `https://${domain.hostname}`
    : (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
}

async function loadLinks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string
): Promise<SubmissionLink[]> {
  const { data } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("data")
    .eq("key", guestListSubmissionsKey(orgId))
    .single();

  return (data?.data as SubmissionLink[]) || [];
}

async function saveLinks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  links: SubmissionLink[]
): Promise<void> {
  await supabase
    .from(TABLES.SITE_SETTINGS)
    .upsert(
      { key: guestListSubmissionsKey(orgId), data: links, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
}

// ---------------------------------------------------------------------------
// GET — List submission links with usage counts
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const links = await loadLinks(supabase, orgId);

    // Optional event_id filter
    const eventId = request.nextUrl.searchParams.get("event_id");
    const filtered = eventId ? links.filter((l) => l.event_id === eventId) : links;

    // Get submission counts grouped by token + access_level
    const tokens = filtered.map((l) => l.token);
    let usageCounts: { submission_token: string; access_level: string; count: number }[] = [];

    if (tokens.length > 0) {
      const { data: rows } = await supabase
        .from(TABLES.GUEST_LIST)
        .select("submission_token, access_level")
        .eq("org_id", orgId)
        .in("submission_token", tokens);

      // Count manually (Supabase JS doesn't support GROUP BY directly)
      const countMap = new Map<string, Map<string, number>>();
      for (const row of rows || []) {
        const token = row.submission_token as string;
        const level = (row.access_level as string) || "artist";
        if (!countMap.has(token)) countMap.set(token, new Map());
        const m = countMap.get(token)!;
        m.set(level, (m.get(level) || 0) + 1);
      }
      for (const [token, levels] of countMap) {
        for (const [level, count] of levels) {
          usageCounts.push({ submission_token: token, access_level: level, count });
        }
      }
    }

    // Resolve tenant URL once
    const baseUrl = await resolveTenantBaseUrl(supabase, orgId);

    // Enrich links
    const enriched: SubmissionLinkWithUsage[] = filtered.map((link) => {
      const usage: Partial<Record<AccessLevel, number>> = {};
      let totalCount = 0;

      for (const u of usageCounts) {
        if (u.submission_token === link.token) {
          usage[u.access_level as AccessLevel] = u.count;
          totalCount += u.count;
        }
      }

      // Calculate remaining quotas
      const remaining: Partial<Record<AccessLevel, number | null>> = {};
      if (link.quotas) {
        for (const [level, quota] of Object.entries(link.quotas)) {
          if (quota === null || quota === undefined) {
            remaining[level as AccessLevel] = null; // unlimited
          } else {
            remaining[level as AccessLevel] = Math.max(0, quota - (usage[level as AccessLevel] || 0));
          }
        }
      }

      return {
        ...link,
        url: `${baseUrl}/guest-list/submit/${link.token}`,
        submission_count: totalCount,
        quota_usage: usage,
        quota_remaining: Object.keys(remaining).length > 0 ? remaining : undefined,
      };
    });

    return NextResponse.json({ links: enriched });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — Generate a new submission link (with optional quotas)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { event_id, artist_name, quotas, artist_email } = await request.json();

    if (!event_id || !artist_name?.trim()) {
      return NextResponse.json({ error: "Missing event_id or artist_name" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const links = await loadLinks(supabase, orgId);

    const token = generateSubmissionToken();
    const newLink: SubmissionLink = {
      token,
      event_id,
      artist_name: artist_name.trim(),
      created_at: new Date().toISOString(),
      active: true,
      ...(quotas ? { quotas } : {}),
    };

    links.push(newLink);
    await saveLinks(supabase, orgId, links);

    const baseUrl = await resolveTenantBaseUrl(supabase, orgId);
    const submissionUrl = `${baseUrl}/guest-list/submit/${token}`;

    // Send email to artist if email provided (fire-and-forget)
    if (artist_email?.trim()) {
      const { data: event } = await supabase
        .from(TABLES.EVENTS)
        .select("name, date_start, venue_name")
        .eq("id", event_id)
        .eq("org_id", orgId)
        .single();

      sendSubmissionLinkEmail({
        orgId,
        artistName: artist_name.trim(),
        artistEmail: artist_email.trim(),
        submissionUrl,
        eventName: event?.name || "Event",
        eventDate: event?.date_start || undefined,
        venueName: event?.venue_name || undefined,
      }).catch((err) => console.error("[submission-link] Email failed:", err));
    }

    return NextResponse.json({
      token,
      url: submissionUrl,
      artist_name: artist_name.trim(),
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PUT — Update a submission link (quotas, active status)
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { token, quotas, active } = await request.json();

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const links = await loadLinks(supabase, orgId);
    const idx = links.findIndex((l) => l.token === token);

    if (idx === -1) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    if (quotas !== undefined) links[idx].quotas = quotas;
    if (active !== undefined) links[idx].active = active;

    await saveLinks(supabase, orgId, links);

    return NextResponse.json({ success: true, link: links[idx] });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
