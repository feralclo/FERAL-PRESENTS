import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendAbandonedCartRecoveryEmail } from "@/lib/email";
import { ORG_ID, TABLES, abandonedCartAutomationKey } from "@/lib/constants";

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

/** Max carts to process per run (prevent timeout) */
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
 * Steps:
 * 1. Verify auth
 * 2. Load automation settings
 * 3. Expire stale carts (>7 days)
 * 4. For each enabled step, find qualifying carts and send emails
 * 5. Return summary
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
    expired: 0,
    processed: 0,
    sent: 0,
    skipped_disabled: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    // ── 2. Load automation settings ──
    const { data: settingsRow } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", abandonedCartAutomationKey(ORG_ID))
      .single();

    const settings: AutomationSettings = settingsRow?.data
      ? { ...DEFAULT_SETTINGS, ...(settingsRow.data as Partial<AutomationSettings>) }
      : DEFAULT_SETTINGS;

    if (!settings.enabled || settings.steps.length === 0) {
      return NextResponse.json({ status: "skipped", reason: "automation disabled" });
    }

    // ── 3. Expire stale carts (>7 days old, still abandoned) ──
    const expiryThreshold = new Date(
      Date.now() - EXPIRY_MINUTES * 60 * 1000,
    ).toISOString();

    const { data: expiredCarts } = await supabase
      .from(TABLES.ABANDONED_CARTS)
      .update({
        status: "expired",
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", ORG_ID)
      .eq("status", "abandoned")
      .lt("created_at", expiryThreshold)
      .select("id");

    summary.expired = expiredCarts?.length ?? 0;

    // ── 4. Collect unsubscribed emails (carts with unsubscribed_at set) ──
    const unsubscribedEmails = new Set<string>();
    try {
      const { data: unsubs } = await supabase
        .from(TABLES.ABANDONED_CARTS)
        .select("email")
        .eq("org_id", ORG_ID)
        .not("unsubscribed_at", "is", null);

      if (unsubs) {
        for (const row of unsubs) {
          unsubscribedEmails.add(row.email.toLowerCase());
        }
      }
    } catch {
      // Column may not exist yet — proceed without unsubscribe filtering
    }

    // ── 5. Process each step ──
    for (let stepIndex = 0; stepIndex < settings.steps.length; stepIndex++) {
      const step = settings.steps[stepIndex];

      // Find carts at this step position
      // notification_count = stepIndex means this cart hasn't been processed for this step yet
      const delayThreshold = new Date(
        Date.now() - step.delay_minutes * 60 * 1000,
      ).toISOString();

      const { data: carts, error: queryErr } = await supabase
        .from(TABLES.ABANDONED_CARTS)
        .select(`
          id, email, first_name, items, subtotal, currency, cart_token, notification_count, status,
          events:event_id ( id, name, slug, venue_name, date_start, doors_time, currency, status )
        `)
        .eq("org_id", ORG_ID)
        .eq("status", "abandoned")
        .eq("notification_count", stepIndex)
        .lt("created_at", delayThreshold)
        .limit(BATCH_LIMIT);

      if (queryErr) {
        summary.errors.push(`Step ${stepIndex} query failed: ${queryErr.message}`);
        continue;
      }

      if (!carts || carts.length === 0) continue;

      for (const cart of carts) {
        summary.processed++;

        // Skip unsubscribed emails
        if (unsubscribedEmails.has(cart.email.toLowerCase())) {
          // Bump notification_count so this cart progresses past disabled/skipped steps
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
          summary.errors.push(`Cart ${cart.id}: missing event data`);
          // Bump count to avoid re-processing
          await bumpNotificationCount(supabase, cart.id, cart.notification_count);
          summary.failed++;
          continue;
        }

        // Skip if event is no longer active (cancelled, past, etc.)
        if (event.status && !["active", "published"].includes(event.status)) {
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

        // Skip if event date has already passed — no point recovering tickets for past events
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

        // ── Race condition guard: re-check status ──
        const { data: freshCart } = await supabase
          .from(TABLES.ABANDONED_CARTS)
          .select("status")
          .eq("id", cart.id)
          .single();

        if (!freshCart || freshCart.status !== "abandoned") {
          continue; // Cart was recovered or expired between query and now
        }

        // Prepare items for the email function
        const items = (cart.items as { name: string; qty: number; price: number; merch_size?: string }[]) || [];

        // ── Send email ──
        const sent = await sendAbandonedCartRecoveryEmail({
          orgId: ORG_ID,
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
            discount_code: step.discount_code || undefined,
            discount_percent: step.discount_percent || undefined,
          },
        });

        if (sent) {
          // Atomic update: bump notification_count + notified_at together
          // (email.ts no longer sets notified_at — single source of truth here)
          const bumped = await bumpNotificationCount(supabase, cart.id, cart.notification_count);
          if (bumped) {
            summary.sent++;
          } else {
            // Email sent but DB update failed — log as error so we can investigate
            summary.sent++;
            summary.errors.push(`Cart ${cart.id}: email sent but notification_count update failed`);
          }
        } else {
          summary.failed++;
          summary.errors.push(`Cart ${cart.id}: email send failed`);
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
