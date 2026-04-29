import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, brandingKey } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import { requireAuth } from "@/lib/auth";
import { getOrgBaseCurrency } from "@/lib/org-settings";
import { getEventTemplate, type TicketTypeSeed } from "@/lib/event-templates";
import * as Sentry from "@sentry/nextjs";

/**
 * Build the deterministic OG cover URL for events that ship without an
 * uploaded cover image. The OG route is content-addressed by query params
 * so the URL itself is the cache key — no Supabase Storage round-trip.
 * Phase 2.4 of EVENT-BUILDER-PLAN.
 */
function buildGeneratedCoverUrl(params: {
  name: string;
  venue: string | null;
  dateStart: string;
  accent: string;
  variant: "square" | "portrait" | "landscape";
}): string {
  const qp = new URLSearchParams({
    name: params.name,
    date: params.dateStart,
    accent: params.accent,
    variant: params.variant,
  });
  if (params.venue) qp.set("venue", params.venue);
  return `/api/og/event-cover?${qp.toString()}`;
}

/**
 * Look up the org's brand accent (or the platform default) so generated
 * covers feel like the tenant. Falls back to Electric Violet rather than
 * leaving the cover bland — every event gets a deliberate accent on day 1.
 */
async function readOrgAccent(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseAdmin>>>,
  orgId: string
): Promise<string> {
  try {
    const { data } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("org_id", orgId)
      .eq("key", brandingKey(orgId))
      .maybeSingle();
    const branding = (data?.data || {}) as { accent_hex?: string };
    if (branding.accent_hex && /^#[0-9a-fA-F]{6}$/.test(branding.accent_hex)) {
      return branding.accent_hex;
    }
  } catch {
    /* fall through */
  }
  return "#8B5CF6";
}

/**
 * Generate up to three alternative slugs for a taken slug. Tries `-2`, `-pt2`,
 * and `-{year}` in that order, then falls back to numeric increments. Returns
 * only slugs we've verified are free for this org so the user can click any
 * and have it succeed.
 *
 * `supabase` is typed loose because the DB client doesn't infer well across
 * dynamic `from(TABLES.EVENTS)` lookups; we only call `select` on it.
 */
async function suggestSlugs(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseAdmin>>>,
  orgId: string,
  base: string,
  year: number
): Promise<string[]> {
  // Strip any existing trailing -N from the base so we don't end up with
  // "summer-launch-2-2" — start from the conceptual root each time.
  const root = base.replace(/-\d+$/, "").replace(/-+$/, "").slice(0, 35) || "event";
  const candidates = [
    `${root}-2`,
    `${root}-pt2`,
    `${root}-${year}`,
    `${root}-3`,
    `${root}-encore`,
    `${root}-${year + 1}`,
  ].map((s) => s.slice(0, 40));

  const { data: existing } = await supabase
    .from(TABLES.EVENTS)
    .select("slug")
    .eq("org_id", orgId)
    .in("slug", candidates);
  const taken = new Set((existing || []).map((r) => r.slug));

  const free: string[] = [];
  for (const c of candidates) {
    if (taken.has(c) || free.includes(c)) continue;
    free.push(c);
    if (free.length === 3) break;
  }
  return free;
}

/**
 * GET /api/events — List all events for the org
 */
export async function GET(request: NextRequest) {
  try {
    const orgId = await getOrgId();
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const status = request.nextUrl.searchParams.get("status");

    let query = supabase
      .from(TABLES.EVENTS)
      .select("*, ticket_types(*, product:products(*))")
      .eq("org_id", orgId)
      .order("date_start", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/events — Create a new event
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json();
    const {
      name,
      slug,
      description,
      venue_name,
      venue_address,
      city,
      country,
      date_start,
      date_end,
      doors_open,
      age_restriction,
      status = "draft",
      visibility,
      payment_method = "stripe",
      capacity,
      cover_image,
      cover_image_url,
      hero_image,
      theme,
      currency,
      about_text,
      lineup,
      details_text,
      tag_line,
      doors_time,
      stripe_account_id,
      platform_fee_percent,
      external_link,
      seo_title,
      seo_description,
      ticket_types,
      template: templateKey,
    } = body;

    if (!name || !slug || !date_start) {
      return NextResponse.json(
        { error: "Missing required fields: name, slug, date_start" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Resolve the template (Phase 2.3) — drives default visibility, seed
    // ticket types, and cover-aspect for the generated OG fallback.
    const template = getEventTemplate(templateKey);

    const resolvedVisibility =
      visibility ?? template?.default_visibility ?? "public";

    // Default currency to org's base currency if not provided
    const eventCurrency = currency || (await getOrgBaseCurrency(orgId));

    // Generated cover fallback (Phase 2.4) — deterministic OG URL when the
    // host hasn't uploaded one and we know how to render a placeholder.
    let resolvedCoverUrl: string | undefined = cover_image_url;
    if (!resolvedCoverUrl && !cover_image) {
      const accent = await readOrgAccent(supabase, orgId);
      resolvedCoverUrl = buildGeneratedCoverUrl({
        name,
        venue: venue_name || null,
        dateStart: date_start,
        accent,
        variant: template?.recommended_cover_aspect ?? "square",
      });
    }

    // Create event
    const { data: event, error: eventError } = await supabase
      .from(TABLES.EVENTS)
      .insert({
        org_id: orgId,
        name,
        slug,
        description,
        venue_name,
        venue_address,
        city,
        country,
        date_start,
        date_end,
        doors_open,
        age_restriction,
        status,
        visibility: resolvedVisibility,
        payment_method,
        capacity,
        cover_image,
        cover_image_url: resolvedCoverUrl,
        hero_image,
        theme,
        currency: eventCurrency,
        about_text,
        lineup,
        details_text,
        tag_line,
        doors_time,
        stripe_account_id,
        platform_fee_percent,
        external_link,
        seo_title: seo_title || null,
        seo_description: seo_description || null,
      })
      .select()
      .single();

    if (eventError) {
      // Postgres unique-constraint violation = slug already exists for this org.
      // Generate three sensible alternatives instead of leaking the raw DB error.
      // Suggestions are user-facing chips; the slug helper keeps them within the
      // 40-char cap and strips any trailing dash so they round-trip cleanly.
      if (eventError.code === "23505") {
        const year = new Date(date_start).getFullYear();
        const candidates = await suggestSlugs(supabase, orgId, slug, year);
        return NextResponse.json(
          {
            error: "An event with that URL already exists. Pick a different slug below.",
            code: "slug_taken",
            suggestions: candidates,
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: eventError.message },
        { status: 500 }
      );
    }

    // Resolve ticket-type seeds — explicit body wins, else expand template.
    // Templates are Phase 2.3: pre-filled tiers so the editor isn't empty
    // when a host lands. Each seed is shaped like the manual `ticket_types`
    // payload so the existing mapper handles both paths uniformly.
    const ticketSeeds: TicketTypeSeed[] | undefined =
      ticket_types && Array.isArray(ticket_types) && ticket_types.length > 0
        ? (ticket_types as TicketTypeSeed[])
        : template?.ticket_types;

    // Create ticket types if any
    if (ticketSeeds && ticketSeeds.length > 0) {
      const ticketRows = ticketSeeds.map(
        (
          tt: {
            name: string;
            description?: string;
            price: number;
            capacity?: number;
            includes_merch?: boolean;
            merch_type?: string;
            merch_sizes?: string[];
            merch_name?: string;
            merch_description?: string;
            merch_images?: string[] | Record<string, string>;
            sort_order?: number;
            min_per_order?: number;
            max_per_order?: number;
            tier?: string;
            product_id?: string;
          },
          i: number
        ) => ({
          org_id: orgId,
          event_id: event.id,
          name: tt.name,
          description: tt.description,
          price: tt.price,
          capacity: tt.capacity,
          includes_merch: tt.includes_merch || false,
          merch_type: tt.merch_type,
          merch_sizes: tt.merch_sizes,
          merch_name: tt.merch_name,
          merch_description: tt.merch_description,
          merch_images: tt.merch_images,
          sort_order: tt.sort_order ?? i,
          min_per_order: tt.min_per_order ?? 1,
          max_per_order: tt.max_per_order ?? 10,
          tier: tt.tier || "standard",
          product_id: tt.product_id,
        })
      );

      const { error: ttError } = await supabase
        .from(TABLES.TICKET_TYPES)
        .insert(ticketRows);

      if (ttError) {
        return NextResponse.json(
          { error: `Event created but ticket types failed: ${ttError.message}` },
          { status: 500 }
        );
      }
    }

    // Return event with ticket types
    const { data: fullEvent } = await supabase
      .from(TABLES.EVENTS)
      .select("*, ticket_types(*)")
      .eq("id", event.id)
      .eq("org_id", orgId)
      .single();

    return NextResponse.json({ data: fullEvent }, { status: 201 });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
