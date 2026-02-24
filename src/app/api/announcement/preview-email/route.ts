import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, emailKey, brandingKey } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { buildAnnouncementEmail } from "@/lib/email-templates";
import type { EmailSettings } from "@/types/email";
import { DEFAULT_EMAIL_SETTINGS } from "@/types/email";

/**
 * GET /api/announcement/preview-email — Render announcement email preview
 *
 * Returns rendered HTML for the announcement email using org's actual
 * email settings + branding. Supports all 4 steps.
 *
 * Query params:
 *   step    — 1|2|3|4 (required)
 *   subject — Custom subject override
 *   heading — Custom heading override
 *   body    — Custom body override
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { searchParams } = request.nextUrl;
    const step = Math.max(1, Math.min(4, parseInt(searchParams.get("step") || "1", 10))) as 1 | 2 | 3 | 4;
    const customSubject = searchParams.get("subject") || undefined;
    const customHeading = searchParams.get("heading") || undefined;
    const customBody = searchParams.get("body") || undefined;

    // Load org email settings + branding
    let emailSettings: EmailSettings = DEFAULT_EMAIL_SETTINGS;
    let accentColor = "#8B5CF6";
    let orgName = "Your Brand";

    const supabase = await getSupabaseAdmin();
    if (supabase) {
      const { data: settingsData } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", emailKey(orgId))
        .single();

      if (settingsData?.data) {
        emailSettings = { ...DEFAULT_EMAIL_SETTINGS, ...settingsData.data } as EmailSettings;
      }

      const { data: brandingData } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", brandingKey(orgId))
        .single();

      if (brandingData?.data) {
        const branding = brandingData.data as { accent_color?: string; org_name?: string };
        if (branding.accent_color) accentColor = branding.accent_color;
        if (branding.org_name) orgName = branding.org_name;
      }
    }

    // Ensure logo_url is absolute
    if (
      emailSettings.logo_url &&
      !emailSettings.logo_url.startsWith("http") &&
      !emailSettings.logo_url.startsWith("data:")
    ) {
      const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
      emailSettings = {
        ...emailSettings,
        logo_url: `${origin}${emailSettings.logo_url.startsWith("/") ? "" : "/"}${emailSettings.logo_url}`,
      };
    }

    // Sample data
    const sampleTicketsLive = "Saturday 15 March 2026 at 10:00";

    const { html } = buildAnnouncementEmail(emailSettings, {
      step,
      eventName: "Midnight Rave — Vol. 3",
      eventDate: "Saturday 15 March 2026",
      venue: "The Warehouse, London",
      ticketsLiveAt: sampleTicketsLive,
      eventUrl: "#",
      firstName: "Alex",
      orgName,
      accentColor,
      logoUrl: emailSettings.logo_url || undefined,
      unsubscribeUrl: "#",
      customSubject,
      customHeading,
      customBody,
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
