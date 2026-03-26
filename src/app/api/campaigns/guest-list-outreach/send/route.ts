import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, emailKey, brandingKey, guestListCampaignsKey } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { buildGuestListOutreachEmail } from "@/lib/campaign-emails";
import type { EmailSettings } from "@/types/email";
import { DEFAULT_EMAIL_SETTINGS } from "@/types/email";
import type { ApplicationCampaign } from "@/types/guest-list";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/campaigns/guest-list-outreach/send
 *
 * Send the guest list outreach email to a list of recipients via Resend.
 *
 * Body:
 *   event_id    — required
 *   campaign_id — optional (for price info)
 *   subject     — optional custom subject
 *   recipients  — array of { email, first_name?, last_name? }
 *
 * Uses the org's Resend/email settings (same as order confirmations).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Email sending not configured" }, { status: 503 });
    }

    const body = await request.json();
    const { event_id, campaign_id, subject: customSubject, recipients } = body;

    if (!event_id) {
      return NextResponse.json({ error: "event_id required" }, { status: 400 });
    }
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: "recipients array required" }, { status: 400 });
    }
    if (recipients.length > 500) {
      return NextResponse.json({ error: "Maximum 500 recipients per send" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    // Fetch all data in parallel
    const [settingsRes, brandingRes, eventRes, campaignsRes, domainRes] = await Promise.all([
      supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", emailKey(orgId)).single(),
      supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", brandingKey(orgId)).single(),
      supabase.from(TABLES.EVENTS).select("name, venue_name, venue_address, date_start, currency")
        .eq("id", event_id).eq("org_id", orgId).single(),
      campaign_id
        ? supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", guestListCampaignsKey(orgId)).single()
        : Promise.resolve({ data: null }),
      supabase.from(TABLES.DOMAINS).select("hostname")
        .eq("org_id", orgId).eq("is_primary", true).eq("status", "active").single(),
    ]);

    // Build email settings
    let emailSettings: EmailSettings = { ...DEFAULT_EMAIL_SETTINGS };
    if (settingsRes.data?.data) {
      emailSettings = { ...DEFAULT_EMAIL_SETTINGS, ...settingsRes.data.data } as EmailSettings;
    }
    const branding = (brandingRes.data?.data as Record<string, string | number>) || {};
    if (!emailSettings.logo_url && branding.logo_url) emailSettings.logo_url = branding.logo_url as string;
    if (emailSettings.accent_color === DEFAULT_EMAIL_SETTINGS.accent_color && branding.accent_color) {
      emailSettings.accent_color = branding.accent_color as string;
    }
    if (emailSettings.logo_height === DEFAULT_EMAIL_SETTINGS.logo_height && branding.logo_height) {
      emailSettings.logo_height = branding.logo_height as number;
    }

    // Event data
    const event = eventRes.data;
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const venue = event.venue_name || "";
    const eventDate = event.date_start
      ? new Date(event.date_start).toLocaleDateString("en-GB", {
          weekday: "long", day: "numeric", month: "long", year: "numeric",
        })
      : "TBC";
    const currency = event.currency || "GBP";
    const currencySymbol = currency === "EUR" ? "€" : currency === "USD" ? "$" : "£";

    // Campaign price
    let campaignPrice: number | undefined;
    if (campaign_id && campaignsRes.data?.data) {
      const campaigns = (campaignsRes.data.data as ApplicationCampaign[]) || [];
      const campaign = campaigns.find((c) => c.id === campaign_id);
      if (campaign && campaign.default_price > 0) campaignPrice = campaign.default_price;
    }

    // Tenant URL
    const tenantBase = domainRes.data?.hostname
      ? `https://${domainRes.data.hostname}`
      : (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    const applyUrl = campaign_id
      ? `${tenantBase}/guest-list/apply/${campaign_id}`
      : `${tenantBase}/guest-list/apply/campaign`;

    const orgName = (branding.org_name as string) || orgId.toUpperCase();
    const fromEmail = emailSettings.from_email || `${orgId}@mail.entry.events`;
    const fromName = (branding.org_name as string) || emailSettings.from_name || "Entry";

    // Build email
    const { subject, html, text } = buildGuestListOutreachEmail(emailSettings, {
      eventName: event.name,
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

    // Send via Resend using batch API
    const resend = new Resend(apiKey);
    const batchEmails = recipients.map((r: { email: string }) => ({
      from: `${fromName} <${fromEmail}>`,
      to: [r.email],
      subject,
      html,
      text,
    }));

    // Resend batch supports up to 100 emails per call
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < batchEmails.length; i += 100) {
      const batch = batchEmails.slice(i, i + 100);
      try {
        const result = await resend.batch.send(batch);
        // Resend batch returns data array — count actual successes
        if (result.data && Array.isArray(result.data)) {
          sent += result.data.length;
          failed += batch.length - result.data.length;
        } else {
          sent += batch.length;
        }
      } catch (err) {
        console.error(`[campaign-send] Batch ${i}-${i + batch.length} failed:`, err);
        Sentry.captureException(err);
        failed += batch.length;
      }
    }

    console.log(`[campaign-send] Sent ${sent} emails for ${event.name} (${failed} failed)`);

    return NextResponse.json({ sent, failed, total: recipients.length });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
