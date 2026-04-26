import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, brandingKey, emailKey } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import { requireAuth } from "@/lib/auth";
import type { BrandingSettings } from "@/types/settings";
import * as Sentry from "@sentry/nextjs";

// CRITICAL: this endpoint is org-scoped via the x-org-id header set by
// middleware, but the URL itself ("/api/branding") is identical for every
// tenant. Public Cache-Control here was keying by URL alone, so the first
// admin's branding got cached and served to every other tenant. Same root
// cause as commits 9da97ba / e54e284 / 64cc085. Force dynamic + no-store.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Platform-neutral default branding — tenants override via {org_id}_branding settings */
const DEFAULT_BRANDING: BrandingSettings = {
  org_name: "Entry",
  logo_url: "",
  accent_color: "#8B5CF6",
  background_color: "#0e0e0e",
  card_color: "#1a1a1a",
  text_color: "#ffffff",
  heading_font: "Space Mono",
  body_font: "Inter",
  copyright_text: "",
};

/**
 * GET /api/branding — Get org branding settings (public)
 *
 * Returns the branding configuration for the current org.
 * Used by checkout pages, event pages, and email templates
 * to render the correct logo, colors, and text.
 */
export async function GET() {
  try {
    const orgId = await getOrgId();
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: DEFAULT_BRANDING });
    }

    const key = brandingKey(orgId);
    const { data: row } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", key)
      .single();

    const headers = {
      "Cache-Control": "no-store, must-revalidate",
    };

    if (row?.data && typeof row.data === "object") {
      // Merge with defaults so missing fields fall back gracefully
      const branding: BrandingSettings = {
        ...DEFAULT_BRANDING,
        ...(row.data as BrandingSettings),
      };
      return NextResponse.json({ data: branding }, { headers });
    }

    return NextResponse.json({ data: DEFAULT_BRANDING }, { headers });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ data: DEFAULT_BRANDING });
  }
}

/**
 * POST /api/branding — Save org branding settings (admin only)
 *
 * Upserts the branding configuration for the current org.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json();

    // Validate about_section if present
    if (body.about_section) {
      const about = body.about_section;
      if (about.pillars && Array.isArray(about.pillars)) {
        if (about.pillars.length > 3) {
          return NextResponse.json(
            { error: "Maximum 3 pillars allowed" },
            { status: 400 }
          );
        }
        for (const pillar of about.pillars) {
          if (pillar.title && pillar.title.length > 100) {
            return NextResponse.json(
              { error: "Pillar title must be under 100 characters" },
              { status: 400 }
            );
          }
          if (pillar.text && pillar.text.length > 500) {
            return NextResponse.json(
              { error: "Pillar text must be under 500 characters" },
              { status: 400 }
            );
          }
        }
      }
      if (about.heading_line1 && about.heading_line1.length > 50) {
        return NextResponse.json(
          { error: "Heading line 1 must be under 50 characters" },
          { status: 400 }
        );
      }
      if (about.heading_line2 && about.heading_line2.length > 50) {
        return NextResponse.json(
          { error: "Heading line 2 must be under 50 characters" },
          { status: 400 }
        );
      }
      if (about.closer && about.closer.length > 100) {
        return NextResponse.json(
          { error: "Closer must be under 100 characters" },
          { status: 400 }
        );
      }
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const key = brandingKey(orgId);

    const { error } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .upsert(
        {
          key,
          data: body,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Cascade the logo to email settings so a single upload flows everywhere
    // a tenant's brand shows up. Skip when the tenant has explicitly set a
    // different logo for transactional emails (logo_override flag).
    if (typeof body?.logo_url === "string") {
      try {
        const eKey = emailKey(orgId);
        const { data: existingEmail } = await supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", eKey)
          .maybeSingle();
        const current = (existingEmail?.data as
          | (Record<string, unknown> & { logo_override?: boolean; logo_url?: string })
          | null) ?? {};
        if (!current.logo_override) {
          await supabase.from(TABLES.SITE_SETTINGS).upsert(
            {
              key: eKey,
              data: {
                ...current,
                logo_url: body.logo_url,
              },
              updated_at: new Date().toISOString(),
            },
            { onConflict: "key" }
          );
        }
      } catch (cascadeErr) {
        // Cascade failures must never block the primary save — the rest of
        // the platform falls back to brand logo at send-time anyway.
        Sentry.captureException(cascadeErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
