import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/events/[id]/duplicate — Clone an event into a fresh draft.
 *
 * Promoters running weekly nights would otherwise re-create ticket tiers
 * by hand each week. This copies the editorial fields (identity / look /
 * money / VAT / SEO) and the ticket-type ladder, but resets everything
 * sale-related (status → draft, sold → 0, dates left to the host to
 * adjust). The new event lands as a draft on the same org with a unique
 * slug ("my-event" → "my-event-2", incrementing if "-2" is taken).
 *
 * Settings (site_settings JSONB — ticket groups, release modes, etc.)
 * are NOT cloned in this pass; they reference ticket-type IDs which
 * change in the new event. A future pass can translate the IDs the way
 * the editor's tmp-id flow does. Hosts who use sequential release will
 * re-set the strategy on the new event, which is the same surface they
 * already configure on the original.
 *
 * NOT cloned: orders, customers, tickets, guest list, abandoned carts,
 * campaigns, scanner assignments. The point is to clone the *product*,
 * not its sales history.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { id } = await params;
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data: source } = await supabase
      .from(TABLES.EVENTS)
      .select("*, ticket_types(*)")
      .eq("id", id)
      .eq("org_id", orgId)
      .single();

    if (!source) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Pick a unique slug. Try "{slug}-2" first; if taken, walk numerically
    // until we find a free one. Bounded at 40 chars to match the slugify
    // contract used elsewhere in the platform.
    const baseSlug = (source.slug as string).replace(/-\d+$/, "").slice(0, 36);
    let candidate = `${baseSlug}-2`;
    for (let i = 2; i < 50; i++) {
      candidate = `${baseSlug}-${i}`.slice(0, 40);
      const { data: clash } = await supabase
        .from(TABLES.EVENTS)
        .select("id")
        .eq("org_id", orgId)
        .eq("slug", candidate)
        .maybeSingle();
      if (!clash) break;
    }

    const baseName = (source.name as string).replace(/\s*\(copy(?:\s\d+)?\)\s*$/i, "");
    const newName = `${baseName} (copy)`;

    // Strip server-managed columns + anything that's truly per-instance.
    // Importantly, status drops to "draft" so duplication never accidentally
    // exposes a half-cloned event to buyers.
    const insertPayload = {
      org_id: orgId,
      name: newName,
      slug: candidate,
      description: source.description,
      venue_name: source.venue_name,
      venue_address: source.venue_address,
      city: source.city,
      country: source.country,
      date_start: source.date_start,
      date_end: source.date_end,
      doors_open: source.doors_open,
      age_restriction: source.age_restriction,
      status: "draft" as const,
      visibility: source.visibility,
      payment_method: source.payment_method,
      capacity: source.capacity,
      cover_image: source.cover_image,
      cover_image_url: source.cover_image_url,
      hero_image: source.hero_image,
      banner_image_url: source.banner_image_url,
      poster_image_url: source.poster_image_url,
      theme: source.theme,
      currency: source.currency,
      about_text: source.about_text,
      lineup: source.lineup,
      details_text: source.details_text,
      tag_line: source.tag_line,
      doors_time: source.doors_time,
      lineup_sort_alphabetical: source.lineup_sort_alphabetical,
      seo_title: source.seo_title,
      seo_description: source.seo_description,
      stripe_account_id: source.stripe_account_id,
      external_link: source.external_link,
      vat_registered: source.vat_registered,
      vat_rate: source.vat_rate,
      vat_prices_include: source.vat_prices_include,
      vat_number: source.vat_number,
    };

    const { data: created, error: insertErr } = await supabase
      .from(TABLES.EVENTS)
      .insert(insertPayload)
      .select()
      .single();

    if (insertErr || !created) {
      Sentry.captureException(insertErr);
      return NextResponse.json(
        { error: insertErr?.message || "Failed to create copy" },
        { status: 500 }
      );
    }

    // Clone ticket types — same shape, sold reset, status carried as-is.
    // The host will likely flip them all "active" or "scheduled" later.
    type TicketTypeSrc = {
      name: string;
      description: string | null;
      price: number;
      capacity: number | null;
      status: string | null;
      sort_order: number | null;
      includes_merch: boolean | null;
      merch_name: string | null;
      merch_type: string | null;
      merch_sizes: string[] | null;
      merch_description: string | null;
      merch_images: unknown;
      min_per_order: number | null;
      max_per_order: number | null;
      tier: string | null;
      product_id: string | null;
    };
    const sourceTickets = (source.ticket_types as TicketTypeSrc[]) || [];
    if (sourceTickets.length > 0) {
      const rows = sourceTickets.map((tt, i) => ({
        org_id: orgId,
        event_id: created.id,
        name: tt.name,
        description: tt.description,
        price: tt.price,
        capacity: tt.capacity,
        // Carry status across so a "scheduled" tier doesn't accidentally
        // flip to "active" on the clone — but reset sold to 0 in case any
        // legacy sold-counter sneaks through (the column has a default).
        status: tt.status ?? "active",
        sort_order: tt.sort_order ?? i,
        includes_merch: tt.includes_merch ?? false,
        merch_name: tt.merch_name,
        merch_type: tt.merch_type,
        merch_sizes: tt.merch_sizes,
        merch_description: tt.merch_description,
        merch_images: tt.merch_images,
        min_per_order: tt.min_per_order ?? 1,
        max_per_order: tt.max_per_order ?? 10,
        tier: tt.tier ?? "standard",
        product_id: tt.product_id,
      }));

      const { error: ttErr } = await supabase
        .from(TABLES.TICKET_TYPES)
        .insert(rows);

      if (ttErr) {
        // Don't roll back — the event row is fine, ticket types can be
        // re-added by hand. But surface the partial failure.
        Sentry.captureException(ttErr);
        return NextResponse.json(
          {
            data: created,
            warning: `Event copied but ticket tiers failed: ${ttErr.message}`,
          },
          { status: 207 }
        );
      }
    }

    // Clone event_artists — pure junction rows, safe to copy. If the
    // junction table doesn't exist yet on this tenant the catch leaves the
    // duplicated event without a lineup, which the host can re-attach.
    try {
      const { data: srcArtists } = await supabase
        .from("event_artists")
        .select("artist_id, sort_order")
        .eq("event_id", source.id);
      if (srcArtists && srcArtists.length > 0) {
        await supabase.from("event_artists").insert(
          srcArtists.map((row) => ({
            org_id: orgId,
            event_id: created.id,
            artist_id: row.artist_id,
            sort_order: row.sort_order,
          }))
        );
      }
    } catch {
      /* event_artists may not exist on every tenant — non-fatal */
    }

    revalidatePath("/admin/events");

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
