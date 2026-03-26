export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, emailKey, brandingKey, guestListCampaignsKey } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { buildGuestListOutreachEmail } from "@/lib/campaign-emails";
import type { EmailSettings } from "@/types/email";
import { DEFAULT_EMAIL_SETTINGS } from "@/types/email";
import type { ApplicationCampaign } from "@/types/guest-list";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/campaigns/guest-list-outreach/preview
 *
 * Renders the guest list outreach email HTML for preview and copy.
 *
 * Query params:
 *   event_id  — required, fetch real event data
 *   campaign_id — optional, fetch campaign for price/access level
 *   subject   — optional custom subject line
 *   t         — cache buster
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { searchParams } = request.nextUrl;
    const eventId = searchParams.get("event_id");
    const campaignId = searchParams.get("campaign_id");
    const customSubject = searchParams.get("subject") || undefined;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    // Parallel fetch: email settings, branding, event, campaigns, tenant domain
    const [settingsRes, brandingRes, eventRes, campaignsRes, domainRes] = await Promise.all([
      supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", emailKey(orgId)).single(),
      supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", brandingKey(orgId)).single(),
      eventId
        ? supabase.from(TABLES.EVENTS).select("name, venue_name, venue_city, date_start, currency")
            .eq("id", eventId).eq("org_id", orgId).single()
        : Promise.resolve({ data: null }),
      campaignId
        ? supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", guestListCampaignsKey(orgId)).single()
        : Promise.resolve({ data: null }),
      supabase.from(TABLES.DOMAINS).select("hostname")
        .eq("org_id", orgId).eq("is_primary", true).eq("status", "active").single(),
    ]);

    // Build email settings with branding fallback
    let emailSettings: EmailSettings = { ...DEFAULT_EMAIL_SETTINGS };
    if (settingsRes.data?.data) {
      emailSettings = { ...DEFAULT_EMAIL_SETTINGS, ...settingsRes.data.data } as EmailSettings;
    }

    const branding = (brandingRes.data?.data as Record<string, string | number>) || {};
    if (!emailSettings.logo_url && branding.logo_url) {
      emailSettings.logo_url = branding.logo_url as string;
    }
    if (emailSettings.accent_color === DEFAULT_EMAIL_SETTINGS.accent_color && branding.accent_color) {
      emailSettings.accent_color = branding.accent_color as string;
    }
    if (emailSettings.logo_height === DEFAULT_EMAIL_SETTINGS.logo_height && branding.logo_height) {
      emailSettings.logo_height = branding.logo_height as number;
    }

    // Make logo URL absolute for iframe rendering
    if (
      emailSettings.logo_url &&
      !emailSettings.logo_url.startsWith("http") &&
      !emailSettings.logo_url.startsWith("data:")
    ) {
      const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
      emailSettings.logo_url = `${origin}${emailSettings.logo_url.startsWith("/") ? "" : "/"}${emailSettings.logo_url}`;
    }

    // Resolve event data — fall back gracefully if not found
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventResult = eventRes as { data: any; error: any };
    const event = eventResult.data;
    // Debug: log every preview request to diagnose the "Event not found" issue
    console.log(`[campaign-preview] eventId=${eventId}, orgId=${orgId}, eventFound=${!!event}, eventName=${event?.name || "NONE"}, error=${eventResult.error?.message || "none"}, errorCode=${eventResult.error?.code || "none"}`);
    if (eventId && !event && eventResult.error) {
      // If .single() failed, try without .single() to see if the issue is 0 or 2+ rows
      const { data: debugRows, error: debugErr } = await supabase
        .from(TABLES.EVENTS)
        .select("id, name")
        .eq("id", eventId)
        .eq("org_id", orgId);
      console.warn(`[campaign-preview] Debug fallback: rows=${debugRows?.length || 0}, err=${debugErr?.message || "none"}`);
    }
    const eventName = event?.name || "Your Event Name";
    const venueParts = [event?.venue_name, event?.venue_city].filter(Boolean);
    const venue = venueParts.length > 0 ? venueParts.join(", ") : "Venue";
    const eventDate = event?.date_start
      ? new Date(event.date_start).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "Date TBC";
    const currency = event?.currency || "GBP";
    const currencySymbol = currency === "EUR" ? "€" : currency === "USD" ? "$" : "£";

    // Resolve campaign data for price
    let campaignPrice: number | undefined;
    if (campaignId && campaignsRes.data?.data) {
      const campaigns = (campaignsRes.data.data as ApplicationCampaign[]) || [];
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (campaign && campaign.default_price > 0) {
        campaignPrice = campaign.default_price;
      }
    }

    // Resolve tenant URL for apply link
    const tenantBase = domainRes.data?.hostname
      ? `https://${domainRes.data.hostname}`
      : (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    const applyUrl = campaignId
      ? `${tenantBase}/guest-list/apply/${campaignId}`
      : `${tenantBase}/guest-list/apply/campaign-id`;

    const orgName = (branding.org_name as string) || orgId.toUpperCase();

    const { html } = buildGuestListOutreachEmail(emailSettings, {
      eventName,
      eventDate,
      venue,
      applyUrl,
      orgName,
      accentColor: emailSettings.accent_color,
      logoUrl: emailSettings.logo_url,
      logoHeight: emailSettings.logo_height,
      logoAspectRatio: emailSettings.logo_aspect_ratio,
      footerText: emailSettings.footer_text,
      customSubject,
      price: campaignPrice,
      currencySymbol,
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
