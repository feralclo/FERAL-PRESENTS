import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, guestListCampaignsKey } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import type { ApplicationCampaign, ApplicationCampaignWithUsage } from "@/types/guest-list";
import * as Sentry from "@sentry/nextjs";

async function resolveTenantBaseUrl(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, orgId: string
): Promise<string> {
  const { data: domain } = await supabase.from(TABLES.DOMAINS).select("hostname")
    .eq("org_id", orgId).eq("is_primary", true).eq("status", "active").single();
  return domain?.hostname ? `https://${domain.hostname}` : (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
}

async function loadCampaigns(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, orgId: string
): Promise<ApplicationCampaign[]> {
  const { data } = await supabase.from(TABLES.SITE_SETTINGS).select("data")
    .eq("key", guestListCampaignsKey(orgId)).single();
  return (data?.data as ApplicationCampaign[]) || [];
}

async function saveCampaigns(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, orgId: string, campaigns: ApplicationCampaign[]
): Promise<void> {
  await supabase.from(TABLES.SITE_SETTINGS).upsert(
    { key: guestListCampaignsKey(orgId), data: campaigns, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
}

/**
 * GET /api/guest-list/campaigns — List campaigns with applied counts
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const supabase = await getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const campaigns = await loadCampaigns(supabase, orgId);

    const eventId = request.nextUrl.searchParams.get("event_id");
    const filtered = eventId ? campaigns.filter((c) => c.event_id === eventId) : campaigns;

    // Count applications per campaign
    const campaignIds = filtered.map((c) => c.id);
    let appliedCounts = new Map<string, number>();

    if (campaignIds.length > 0) {
      const { data: rows } = await supabase.from(TABLES.GUEST_LIST)
        .select("application_data").eq("org_id", orgId).eq("source", "application");

      for (const row of rows || []) {
        const ad = row.application_data as { campaign_id?: string } | null;
        if (ad?.campaign_id) {
          appliedCounts.set(ad.campaign_id, (appliedCounts.get(ad.campaign_id) || 0) + 1);
        }
      }
    }

    const baseUrl = await resolveTenantBaseUrl(supabase, orgId);

    const enriched: ApplicationCampaignWithUsage[] = filtered.map((c) => ({
      ...c,
      url: `${baseUrl}/guest-list/apply/${c.id}`,
      applied_count: appliedCounts.get(c.id) || 0,
    }));

    return NextResponse.json({ campaigns: enriched });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/guest-list/campaigns — Create a new campaign
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json();
    const { event_id, title, description, default_price = 0, currency = "GBP", access_level = "guest_list", capacity, fields } = body;

    if (!event_id || !title?.trim()) {
      return NextResponse.json({ error: "Missing event_id or title" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const campaigns = await loadCampaigns(supabase, orgId);

    const newCampaign: ApplicationCampaign = {
      id: crypto.randomUUID(),
      event_id,
      title: title.trim(),
      description: description?.trim() || undefined,
      default_price: Math.max(0, Number(default_price) || 0),
      currency: currency.toUpperCase(),
      access_level,
      capacity: capacity ? Math.max(1, Number(capacity)) : undefined,
      fields: {
        instagram: fields?.instagram ?? false,
        date_of_birth: fields?.date_of_birth ?? false,
      },
      active: true,
      created_at: new Date().toISOString(),
    };

    campaigns.push(newCampaign);
    await saveCampaigns(supabase, orgId, campaigns);

    const baseUrl = await resolveTenantBaseUrl(supabase, orgId);

    return NextResponse.json({
      campaign: newCampaign,
      url: `${baseUrl}/guest-list/apply/${newCampaign.id}`,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PUT /api/guest-list/campaigns — Update a campaign
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: "Missing campaign id" }, { status: 400 });

    const supabase = await getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const campaigns = await loadCampaigns(supabase, orgId);
    const idx = campaigns.findIndex((c) => c.id === id);

    if (idx === -1) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    // Merge updates
    if (updates.title !== undefined) campaigns[idx].title = updates.title;
    if (updates.description !== undefined) campaigns[idx].description = updates.description;
    if (updates.default_price !== undefined) campaigns[idx].default_price = Math.max(0, Number(updates.default_price));
    if (updates.capacity !== undefined) campaigns[idx].capacity = updates.capacity ? Math.max(1, Number(updates.capacity)) : undefined;
    if (updates.active !== undefined) campaigns[idx].active = updates.active;
    if (updates.fields !== undefined) campaigns[idx].fields = { ...campaigns[idx].fields, ...updates.fields };
    if (updates.access_level !== undefined) campaigns[idx].access_level = updates.access_level;

    await saveCampaigns(supabase, orgId, campaigns);

    return NextResponse.json({ success: true, campaign: campaigns[idx] });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
