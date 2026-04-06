import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, guestListCampaignsKey, brandingKey } from "@/lib/constants";
import type { ApplicationCampaign } from "@/types/guest-list";
import * as Sentry from "@sentry/nextjs";

/**
 * Resolve campaign ID → { campaign, orgId }
 */
async function resolveCampaign(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  campaignId: string
): Promise<{ campaign: ApplicationCampaign; orgId: string } | null> {
  const { data: rows } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("key, data")
    .like("key", "%_guest_list_campaigns");

  if (!rows) return null;

  for (const row of rows) {
    const campaigns = (row.data as ApplicationCampaign[]) || [];
    const campaign = campaigns.find((c) => c.id === campaignId && c.active);
    if (campaign) {
      const orgId = (row.key as string).replace("_guest_list_campaigns", "");
      return { campaign, orgId };
    }
  }
  return null;
}

/**
 * GET /api/guest-list/apply/[campaignId] — Campaign details for landing page (public)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const { campaignId } = await params;

    const supabase = await getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const resolved = await resolveCampaign(supabase, campaignId);
    if (!resolved) return NextResponse.json({ error: "Campaign not found or closed" }, { status: 404 });

    const { campaign, orgId } = resolved;

    // Fetch event
    const { data: event } = await supabase.from(TABLES.EVENTS)
      .select("name, venue_name, date_start, doors_time")
      .eq("id", campaign.event_id).eq("org_id", orgId).single();

    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    // Fetch branding
    const { data: brandingRow } = await supabase.from(TABLES.SITE_SETTINGS)
      .select("data").eq("key", brandingKey(orgId)).single();
    const branding = (brandingRow?.data as Record<string, string>) || {};

    // Count applications (for capacity)
    const { count: appliedCount } = await supabase.from(TABLES.GUEST_LIST)
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId).eq("source", "application")
      .filter("application_data->>campaign_id", "eq", campaignId)
      .neq("status", "declined");

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        title: campaign.title,
        description: campaign.description,
        fields: campaign.fields,
        capacity: campaign.capacity,
      },
      event: {
        name: event.name,
        venue_name: event.venue_name,
        date_start: event.date_start,
        doors_time: event.doors_time,
      },
      branding: {
        org_name: branding.org_name || orgId,
        logo_url: branding.logo_url || null,
        accent_color: branding.accent_color || "#8B5CF6",
      },
      applied_count: appliedCount || 0,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/guest-list/apply/[campaignId] — Submit application (public)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const { campaignId } = await params;
    const body = await request.json();
    const { name, email, instagram, date_of_birth } = body;

    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const resolved = await resolveCampaign(supabase, campaignId);
    if (!resolved) return NextResponse.json({ error: "Campaign not found or closed" }, { status: 404 });

    const { campaign, orgId } = resolved;

    // Check duplicate (same email + campaign)
    const { count: existingCount } = await supabase.from(TABLES.GUEST_LIST)
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId).eq("email", email.trim().toLowerCase()).eq("source", "application")
      .filter("application_data->>campaign_id", "eq", campaignId);

    if ((existingCount || 0) > 0) {
      return NextResponse.json({ error: "already_applied", message: "You've already applied." }, { status: 409 });
    }

    // Check capacity
    if (campaign.capacity) {
      const { count: totalApplied } = await supabase.from(TABLES.GUEST_LIST)
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId).eq("source", "application")
        .filter("application_data->>campaign_id", "eq", campaignId)
        .neq("status", "declined");

      if ((totalApplied || 0) >= campaign.capacity) {
        return NextResponse.json({ error: "capacity_full", message: "Applications are closed." }, { status: 400 });
      }
    }

    // Insert application
    const { error } = await supabase.from(TABLES.GUEST_LIST).insert({
      org_id: orgId,
      event_id: campaign.event_id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      qty: 1,
      status: "pending",
      source: "application",
      access_level: campaign.access_level,
      application_data: {
        campaign_id: campaignId,
        ...(instagram?.trim() ? { instagram: instagram.trim() } : {}),
        ...(date_of_birth?.trim() ? { date_of_birth: date_of_birth.trim() } : {}),
      },
      added_by: "application",
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      message: "Application received. We'll be in touch.",
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
