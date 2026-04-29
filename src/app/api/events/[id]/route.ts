import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, stripeAccountKey } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import { requireAuth } from "@/lib/auth";
import { verifyConnectedAccount } from "@/lib/stripe/server";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/events/[id] — Get event detail with ticket types
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getOrgId();
    const { id } = await params;
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.EVENTS)
      .select("*, ticket_types(*, product:products(*))")
      .eq("id", id)
      .eq("org_id", orgId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PUT /api/events/[id] — Update event
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { id } = await params;
    const body = await request.json();

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Gate: block going live unless the event is actually sellable.
    // Three checks, in order of cost (cheapest first):
    //   1. date_start is in the future
    //   2. At least one active ticket type with non-zero capacity (or unlimited)
    //   3. Stripe Connect verified — only for stripe-payment events
    // Only applies when *transitioning* to live — editing an already-live event
    // is fine. Platform owners are exempt across the board (they may run test
    // events for QA without going through the full setup).
    if (body.status === "live") {
      const supabaseServer = await getSupabaseServer();
      const { data: { user: sessionUser } } = supabaseServer
        ? await supabaseServer.auth.getUser()
        : { data: { user: null } };
      const isPlatformOwner = sessionUser?.app_metadata?.is_platform_owner === true;

      if (!isPlatformOwner) {
        // Pull existing status, date, and payment method so we can validate
        // against either the incoming body OR the persisted row (the editor
        // sends a single PUT with both event fields and ticket_types).
        const { data: existingEvent } = await supabase
          .from(TABLES.EVENTS)
          .select("status, date_start, payment_method")
          .eq("id", id)
          .eq("org_id", orgId)
          .single();

        const isAlreadyLive = existingEvent?.status === "live";

        if (!isAlreadyLive) {
          // (1) Future date — body wins if provided, else fall back to DB
          const dateStartRaw = body.date_start ?? existingEvent?.date_start;
          const dateStart = dateStartRaw ? new Date(dateStartRaw) : null;
          if (!dateStart || isNaN(dateStart.getTime()) || dateStart.getTime() <= Date.now()) {
            return NextResponse.json(
              {
                error: "Set an event date in the future before going live.",
                code: "live_gate_past_date",
              },
              { status: 400 }
            );
          }

          // (2) Sellable tickets — use body.ticket_types when present (covers the
          // editor's all-in-one save), else read from DB. A ticket counts when:
          // status is "active" AND (capacity > 0 OR capacity is null/unlimited).
          let candidateTickets: Array<{
            status?: string;
            capacity?: number | null;
          }> = [];
          if (Array.isArray(body.ticket_types) && body.ticket_types.length > 0) {
            candidateTickets = body.ticket_types as typeof candidateTickets;
          } else {
            const { data: dbTickets } = await supabase
              .from(TABLES.TICKET_TYPES)
              .select("status, capacity")
              .eq("event_id", id)
              .eq("org_id", orgId);
            candidateTickets = dbTickets || [];
          }
          const sellable = candidateTickets.some((tt) => {
            const isActive = (tt.status ?? "active") === "active";
            const hasCapacity = tt.capacity == null || (typeof tt.capacity === "number" && tt.capacity > 0);
            return isActive && hasCapacity;
          });
          if (!sellable) {
            return NextResponse.json(
              {
                error: "Add a ticket on sale (active and with capacity) before going live.",
                code: "live_gate_no_tickets",
              },
              { status: 400 }
            );
          }

          // (3) Stripe Connect — only when this event takes card payments.
          // Body's payment_method wins if updated in the same request.
          const paymentMethod = body.payment_method ?? existingEvent?.payment_method;
          if (paymentMethod === "stripe") {
            const { data: stripeRow } = await supabase
              .from(TABLES.SITE_SETTINGS)
              .select("data")
              .eq("key", stripeAccountKey(orgId))
              .single();

            const accountId = stripeRow?.data?.account_id;
            if (!accountId) {
              return NextResponse.json(
                {
                  error: "Connect your payment account before going live. Go to Settings → Payments to set up.",
                  code: "live_gate_no_stripe",
                },
                { status: 400 }
              );
            }

            // Account exists in our DB — but is it actually able to take charges?
            // verifyConnectedAccount returns null if the account is deleted/revoked
            // OR if card_payments capability is anything other than 'active' (most
            // commonly: KYC half-finished — name + address provided but no bank
            // account or no ToS yet). Letting the tenant publish in that state
            // means buyers hit a 503 at checkout time, which is a much worse
            // experience than blocking the publish here.
            const verified = await verifyConnectedAccount(accountId, orgId);
            if (!verified) {
              return NextResponse.json(
                {
                  error: "Your Stripe account isn't fully set up yet. Go to Settings → Payments to finish verification, then come back to publish.",
                  code: "live_gate_stripe_unverified",
                },
                { status: 400 }
              );
            }
          }
        }
      }
    }

    // Separate ticket_types and deleted IDs from event fields
    const { ticket_types, deleted_ticket_type_ids, ...eventFields } = body;

    // Log image size for debugging
    if (eventFields.cover_image) {
      console.log(`[events/${id}] cover_image size: ${Math.round(eventFields.cover_image.length / 1024)}KB (base64 string)`);
    }

    // Update event
    const { error: eventError } = await supabase
      .from(TABLES.EVENTS)
      .update({ ...eventFields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", orgId);

    if (eventError) {
      console.error(`[events/${id}] Update error:`, eventError.message);
      return NextResponse.json(
        { error: eventError.message },
        { status: 500 }
      );
    }

    // Delete removed ticket types (parallel)
    if (deleted_ticket_type_ids && Array.isArray(deleted_ticket_type_ids)) {
      await Promise.all(
        deleted_ticket_type_ids.map((ttId: string) =>
          supabase
            .from(TABLES.TICKET_TYPES)
            .delete()
            .eq("id", ttId)
            .eq("org_id", orgId)
        )
      );
    }

    // Update/insert ticket types (parallel)
    if (ticket_types && Array.isArray(ticket_types)) {
      await Promise.all(
        ticket_types.map((tt: Record<string, unknown>) => {
          if (tt.id) {
            const { id: ttId, ...ttFields } = tt;
            return supabase
              .from(TABLES.TICKET_TYPES)
              .update({ ...ttFields, updated_at: new Date().toISOString() })
              .eq("id", ttId as string)
              .eq("org_id", orgId);
          } else {
            return supabase.from(TABLES.TICKET_TYPES).insert({
              org_id: orgId,
              event_id: id,
              ...tt,
            });
          }
        })
      );
    }

    // Return updated event
    const { data } = await supabase
      .from(TABLES.EVENTS)
      .select("*, ticket_types(*, product:products(*))")
      .eq("id", id)
      .eq("org_id", orgId)
      .single();

    // Verify image persistence
    if (eventFields.cover_image && !data?.cover_image) {
      console.warn(`[events/${id}] cover_image was sent but not returned — column may not exist in DB. Run supabase-add-image-columns.sql`);
    }
    if (eventFields.hero_image && !data?.hero_image) {
      console.warn(`[events/${id}] hero_image was sent but not returned — column may not exist in DB. Run supabase-add-image-columns.sql`);
    }

    // Bust Next.js page cache so public event pages reflect changes immediately
    if (data?.slug) {
      revalidatePath(`/event/${data.slug}`);
      revalidatePath(`/event/${data.slug}/tickets`);
      revalidatePath(`/event/${data.slug}/checkout`);
    }
    revalidatePath("/admin/events");

    return NextResponse.json({ data });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/events/[id] — Permanently delete an event and its ticket types
 */
export async function DELETE(
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

    // Get event slug for cache revalidation before deleting
    const { data: event } = await supabase
      .from(TABLES.EVENTS)
      .select("slug")
      .eq("id", id)
      .eq("org_id", orgId)
      .single();

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Delete ticket types first (foreign key)
    await supabase
      .from(TABLES.TICKET_TYPES)
      .delete()
      .eq("event_id", id)
      .eq("org_id", orgId);

    // Delete event
    const { error } = await supabase
      .from(TABLES.EVENTS)
      .delete()
      .eq("id", id)
      .eq("org_id", orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Bust caches
    revalidatePath(`/event/${event.slug}`);
    revalidatePath("/admin/events");

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
