import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendAbandonedCartRecoveryEmail } from "@/lib/email";
import { TABLES, abandonedCartAutomationKey } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max for Vercel cron

/** Serialisable subset of the admin-page EmailStep (no icon/color) */
interface EmailStepConfig {
  id: string;
  delay_minutes: number;
  enabled: boolean;
  subject: string;
  preview_text: string;
  include_discount: boolean;
  discount_code: string;
  discount_percent: number;
  cta_text?: string;
  discount_label?: string;
  greeting?: string;
  body_message?: string;
}

interface AutomationSettings {
  enabled: boolean;
  steps: EmailStepConfig[];
}

const DEFAULT_SETTINGS: AutomationSettings = {
  enabled: false,
  steps: [],
};

/** 7 days in minutes */
const EXPIRY_MINUTES = 7 * 24 * 60;

/** Grace period before a cart is considered truly abandoned (minutes).
 *  Carts stay "pending" during this window — if the customer completes
 *  checkout the pending row is simply deleted and never counts as abandoned.
 *  5 minutes is safe: most checkouts complete in 2-3 min. Combined with
 *  the 10-min cron interval, worst-case promotion delay is ~15 min. */
const PENDING_GRACE_MINUTES = 5;

/** Max carts to process per org per run (prevent timeout) */
const BATCH_LIMIT = 100;

/** Bump notification_count and set notified_at in a single atomic update.
 *  Returns true if the update succeeded. Logs errors. */
async function bumpNotificationCount(
  supabase: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  cartId: string,
  currentCount: number,
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from(TABLES.ABANDONED_CARTS)
    .update({
      notification_count: currentCount + 1,
      notified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", cartId)
    .eq("status", "abandoned"); // Guard: don't update if status changed
  if (error) {
    console.error(`[cron/abandoned-carts] Failed to bump notification_count for cart ${cartId}:`, error.message);
    return false;
  }
  return true;
}

/**
 * GET /api/cron/abandoned-carts
 *
 * Vercel Cron job that processes the abandoned-cart email sequence.
 * Protected by CRON_SECRET (Vercel injects Authorization: Bearer <secret>).
 *
 * Multi-tenant: discovers all orgs with abandoned carts, processes each
 * org's carts using that org's automation settings and email branding.
 *
 * Steps:
 * 1. Verify auth
 * 2. Discover all orgs with abandoned/pending carts
 * 3. For each org: promote pending, expire stale, load settings, send emails
 * 4. Return summary
 */
export async function GET(request: NextRequest) {
  // ── 1. Auth ──
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron/abandoned-carts] CRON_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const summary = {
    orgs_processed: 0,
    promoted: 0,
    expired: 0,
    processed: 0,
    sent: 0,
    skipped_disabled: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    // ── 2. Discover all orgs with active abandoned carts ──
    const { data: orgRows, error: orgError } = await supabase
      .from(TABLES.ABANDONED_CARTS)
      .select("org_id")
      .in("status", ["pending", "abandoned"]);

    if (orgError) {
      return NextResponse.json({ error: orgError.message }, { status: 500 });
    }

    const orgIds = [...new Set((orgRows || []).map((r) => r.org_id))];

    if (orgIds.length === 0) {
      return NextResponse.json({ status: "ok", reason: "no active carts" });
    }

    // ── 3. Process each org ──
    for (const orgId of orgIds) {
      summary.orgs_processed++;

      // 3a. Promote "pending" carts → "abandoned" after grace period
      const pendingThreshold = new Date(
        Date.now() - PENDING_GRACE_MINUTES * 60 * 1000,
      ).toISOString();

      const { data: promotedCarts } = await supabase
        .from(TABLES.ABANDONED_CARTS)
        .update({
          status: "abandoned",
          updated_at: new Date().toISOString(),
        })
        .eq("org_id", orgId)
        .eq("status", "pending")
        .lt("created_at", pendingThreshold)
        .select("id");

      summary.promoted += promotedCarts?.length ?? 0;

      // 3b. Expire stale carts (>7 days old, still abandoned)
      const expiryThreshold = new Date(
        Date.now() - EXPIRY_MINUTES * 60 * 1000,
      ).toISOString();

      const { data: expiredCarts } = await supabase
        .from(TABLES.ABANDONED_CARTS)
        .update({
          status: "expired",
          updated_at: new Date().toISOString(),
        })
        .eq("org_id", orgId)
        .eq("status", "abandoned")
        .lt("created_at", expiryThreshold)
        .select("id");

      summary.expired += expiredCarts?.length ?? 0;

      // 3c. Load automation settings for this org
      const { data: settingsRow } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", abandonedCartAutomationKey(orgId))
        .single();

      const settings: AutomationSettings = settingsRow?.data
        ? { ...DEFAULT_SETTINGS, ...(settingsRow.data as Partial<AutomationSettings>) }
        : DEFAULT_SETTINGS;

      if (!settings.enabled || settings.steps.length === 0) {
        continue; // Email automation disabled for this org — promotions/expiry still ran
      }

      // 3d. Collect unsubscribed emails for this org
      const unsubscribedEmails = new Set<string>();
      try {
        const { data: unsubs } = await supabase
          .from(TABLES.ABANDONED_CARTS)
          .select("email")
          .eq("org_id", orgId)
          .not("unsubscribed_at", "is", null);

        if (unsubs) {
          for (const row of unsubs) {
            unsubscribedEmails.add(row.email.toLowerCase());
          }
        }
      } catch {
        // Column may not exist yet — proceed without unsubscribe filtering
      }

      // 3e. Process each step
      for (let stepIndex = 0; stepIndex < settings.steps.length; stepIndex++) {
        const step = settings.steps[stepIndex];

        const delayThreshold = new Date(
          Date.now() - step.delay_minutes * 60 * 1000,
        ).toISOString();

        const { data: carts, error: queryErr } = await supabase
          .from(TABLES.ABANDONED_CARTS)
          .select(`
            id, email, first_name, items, subtotal, currency, cart_token, notification_count, status,
            discount_code, discount_type, discount_value,
            events:event_id ( id, name, slug, venue_name, date_start, doors_time, currency, status )
          `)
          .eq("org_id", orgId)
          .eq("status", "abandoned")
          .eq("notification_count", stepIndex)
          .lt("created_at", delayThreshold)
          .limit(BATCH_LIMIT);

        if (queryErr) {
          summary.errors.push(`[${orgId}] Step ${stepIndex} query failed: ${queryErr.message}`);
          continue;
        }

        if (!carts || carts.length === 0) continue;

        for (const cart of carts) {
          summary.processed++;

          // Skip unsubscribed emails
          if (unsubscribedEmails.has(cart.email.toLowerCase())) {
            await bumpNotificationCount(supabase, cart.id, cart.notification_count);
            summary.skipped_disabled++;
            continue;
          }

          // Skip if step is disabled — bump count so cart progresses
          if (!step.enabled) {
            await bumpNotificationCount(supabase, cart.id, cart.notification_count);
            summary.skipped_disabled++;
            continue;
          }

          // Get event data (Supabase returns joined object)
          const event = cart.events as unknown as {
            id: string;
            name: string;
            slug: string;
            venue_name?: string;
            date_start?: string;
            doors_time?: string;
            currency?: string;
            status?: string;
          } | null;

          if (!event || !event.slug) {
            summary.errors.push(`[${orgId}] Cart ${cart.id}: missing event data`);
            await bumpNotificationCount(supabase, cart.id, cart.notification_count);
            summary.failed++;
            continue;
          }

          // Skip if event is no longer active
          if (event.status && !["live", "draft"].includes(event.status)) {
            await supabase
              .from(TABLES.ABANDONED_CARTS)
              .update({
                status: "expired",
                updated_at: new Date().toISOString(),
              })
              .eq("id", cart.id)
              .eq("status", "abandoned");
            summary.expired++;
            continue;
          }

          // Skip if event date has already passed
          if (event.date_start) {
            const eventDate = new Date(event.date_start);
            if (eventDate.getTime() < Date.now()) {
              await supabase
                .from(TABLES.ABANDONED_CARTS)
                .update({
                  status: "expired",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", cart.id)
                .eq("status", "abandoned");
              summary.expired++;
              continue;
            }
          }

          // Race condition guard: re-check status
          const { data: freshCart } = await supabase
            .from(TABLES.ABANDONED_CARTS)
            .select("status")
            .eq("id", cart.id)
            .single();

          if (!freshCart || freshCart.status !== "abandoned") {
            continue;
          }

          // Prepare items for the email function
          const items = (cart.items as { name: string; qty: number; price: number; merch_size?: string }[]) || [];

          // Determine which discount to include in email
          let emailDiscountCode: string | undefined;
          let emailDiscountType: string | undefined;
          let emailDiscountValue: number | undefined;
          let isOriginalDiscount = false;

          if (step.include_discount && step.discount_code) {
            emailDiscountCode = step.discount_code;
            emailDiscountType = "percentage";
            emailDiscountValue = step.discount_percent || 0;
          } else if (!step.include_discount && cart.discount_code) {
            emailDiscountCode = cart.discount_code;
            emailDiscountType = cart.discount_type || "percentage";
            emailDiscountValue = cart.discount_value ?? undefined;
            isOriginalDiscount = true;
          }

          // Send email
          const sent = await sendAbandonedCartRecoveryEmail({
            orgId,
            cartId: cart.id,
            email: cart.email,
            firstName: cart.first_name || undefined,
            event: {
              name: event.name,
              slug: event.slug,
              venue_name: event.venue_name,
              date_start: event.date_start,
              doors_time: event.doors_time,
              currency: event.currency,
            },
            items,
            subtotal: cart.subtotal,
            currency: cart.currency || event.currency || "GBP",
            cartToken: cart.cart_token || "",
            stepConfig: {
              subject: step.subject,
              preview_text: step.preview_text,
              include_discount: step.include_discount,
              discount_code: emailDiscountCode,
              discount_percent: emailDiscountType === "percentage" ? emailDiscountValue : undefined,
              discount_type: emailDiscountType,
              discount_value: emailDiscountValue,
              cta_text: step.cta_text || undefined,
              discount_label: step.discount_label || undefined,
              greeting: step.greeting || undefined,
              body_message: step.body_message || undefined,
            },
            isOriginalDiscount,
          });

          if (sent) {
            const bumped = await bumpNotificationCount(supabase, cart.id, cart.notification_count);
            if (bumped) {
              summary.sent++;
            } else {
              summary.sent++;
              summary.errors.push(`[${orgId}] Cart ${cart.id}: email sent but notification_count update failed`);
            }
          } else {
            summary.failed++;
            summary.errors.push(`[${orgId}] Cart ${cart.id}: email send failed`);
          }
        }
      }
    }

    console.log("[cron/abandoned-carts] Run complete:", summary);
    return NextResponse.json({ status: "ok", ...summary });
  } catch (err) {
    console.error("[cron/abandoned-carts] Fatal error:", err);
    return NextResponse.json(
      { error: "Internal error", details: String(err) },
      { status: 500 },
    );
  }
}
