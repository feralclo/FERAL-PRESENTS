import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, stripeAccountKey } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";
import { createOrder, OrderCreationError, type OrderVat, type OrderDiscount } from "@/lib/orders";
// Dynamic import to avoid pulling crypto into test environment
// import { issueGuestListTicket } from "@/lib/guest-list";
import { sendOrderConfirmationEmail } from "@/lib/email";
import { applyRefundSideEffects } from "@/lib/refund";
import { fetchMarketingSettings, hashSHA256, sendMetaEvents } from "@/lib/meta";
import { updateOrgPlanSettings } from "@/lib/plans";
import { fromSmallestUnit } from "@/lib/stripe/config";
import { logPaymentEvent } from "@/lib/payment-monitor";
import type { MetaEventPayload } from "@/types/marketing";
import * as Sentry from "@sentry/nextjs";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const connectWebhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

/**
 * Verify a webhook event against one or more signing secrets.
 * Account and Connect webhooks share this URL but have different secrets.
 * Returns the verified event, or null if verification fails.
 */
/**
 * Cross-check that a tenant's claimed org_id (from PI metadata) actually
 * owns the connected Stripe account a webhook event came from.
 *
 * Looks up site_settings.{orgId}_stripe_account.account_id and compares.
 * Returns true only if the org's stored account matches event.account.
 *
 * If the org has no connected account stored at all (e.g. platform-owner
 * org running events on the platform Stripe), event.account would normally
 * be null — meaning we wouldn't even call this. So the function is only
 * invoked for actual Connect events, and a missing match means something
 * is wrong.
 */
async function verifyOrgOwnsConnectedAccount(
  orgId: string,
  connectedAccountId: string,
): Promise<boolean> {
  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) return false;
    const { data } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", stripeAccountKey(orgId))
      .single();
    const storedAccountId =
      data?.data && typeof data.data === "object"
        ? (data.data as { account_id?: string }).account_id
        : undefined;
    return storedAccountId === connectedAccountId;
  } catch {
    // Failing closed: a DB blip should refuse the cross-check rather than
    // assuming OK. The legitimate caller can retry; an attacker can't.
    return false;
  }
}

async function verifyWebhookEvent(
  stripe: Stripe,
  body: string,
  request: NextRequest,
  secrets: string[]
): Promise<Stripe.Event | null> {
  // Dev/test with no secrets configured — accept unverified
  if (secrets.length === 0) {
    return JSON.parse(body) as Stripe.Event;
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return null;

  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(body, signature, secret);
    } catch {
      // Try next secret
    }
  }

  // All secrets failed — log the error
  logPaymentEvent({
    orgId: getOrgIdFromRequest(request),
    type: "webhook_error",
    severity: "critical",
    errorCode: "signature_verification_failed",
    errorMessage: "No webhook secret matched the signature",
  });
  return null;
}

/**
 * POST /api/stripe/webhook
 *
 * Handles Stripe webhook events for payment processing.
 * Key events:
 * - payment_intent.succeeded: Create order + tickets
 * - payment_intent.payment_failed: Log failure
 *
 * Two Stripe webhook endpoints point to this route:
 * 1. Account webhook — platform events (subscriptions, platform payments)
 * 2. Connect webhook — connected account events (tenant direct charges)
 * Each has its own signing secret; we try both to verify.
 */
export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    const body = await request.text();

    const secrets = [webhookSecret, connectWebhookSecret].filter(Boolean) as string[];

    // Verify webhook signature — required in production to prevent forged events
    if (secrets.length === 0) {
      if (process.env.NODE_ENV === "production") {
        console.error("STRIPE_WEBHOOK_SECRET is required in production");
        return NextResponse.json(
          { error: "Webhook not configured" },
          { status: 500 }
        );
      }
      // Dev/test only: accept unverified events with warning
      console.warn("[webhook] No webhook secrets configured — accepting unverified event (dev only)");
    }

    const event = await verifyWebhookEvent(stripe, body, request, secrets);
    if (!event) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    // Handle the event
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const fallbackOrgId = getOrgIdFromRequest(request);

        // Connect cross-check: if the event came from a connected account,
        // verify that metadata.org_id (the org we'll attribute the order to)
        // actually owns that connected account in our DB. Mismatched values
        // would route a tenant's revenue to the wrong tenant — extremely
        // unlikely (Stripe sig verification + we set both ourselves), but
        // worth auditing because the failure mode is silent money loss.
        const connectedAccount =
          typeof event.account === "string" ? event.account : null;
        if (connectedAccount && paymentIntent.metadata?.org_id) {
          const ok = await verifyOrgOwnsConnectedAccount(
            paymentIntent.metadata.org_id,
            connectedAccount,
          );
          if (!ok) {
            console.error(
              "[webhook] org_id / event.account mismatch — REFUSING to attribute.",
              {
                metadata_org_id: paymentIntent.metadata.org_id,
                event_account: connectedAccount,
                pi: paymentIntent.id,
              },
            );
            logPaymentEvent({
              orgId: paymentIntent.metadata.org_id,
              type: "webhook_error",
              severity: "critical",
              stripePaymentIntentId: paymentIntent.id,
              stripeAccountId: connectedAccount,
              errorCode: "org_account_mismatch",
              errorMessage: `metadata.org_id=${paymentIntent.metadata.org_id} does not own event.account=${connectedAccount}. Manual reconciliation required.`,
            });
            // Acknowledge to Stripe (so they stop retrying) — manual fix.
            return NextResponse.json({ received: true, skipped: true });
          }
        }

        await handlePaymentSuccess(paymentIntent, fallbackOrgId);
        logPaymentEvent({
          orgId: paymentIntent.metadata?.org_id || fallbackOrgId,
          type: "payment_succeeded",
          stripePaymentIntentId: paymentIntent.id,
          stripeAccountId: connectedAccount || undefined,
          customerEmail: paymentIntent.metadata?.customer_email,
          metadata: { amount: paymentIntent.amount, currency: paymentIntent.currency },
        });
        break;
      }

      case "charge.refunded": {
        // A charge was refunded — could be from our /api/orders/[id]/refund
        // (already synced our DB), or from the Stripe Dashboard (haven't
        // synced yet). applyRefundSideEffects is idempotent: if the order's
        // already flagged refunded it's a no-op, so calling on every event
        // is safe.
        const charge = event.data.object as Stripe.Charge;
        await handleChargeRefunded(charge, event);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const lastError = paymentIntent.last_payment_error;
        console.error(
          `Payment failed for PI ${paymentIntent.id}:`,
          lastError?.message
        );
        logPaymentEvent({
          orgId: paymentIntent.metadata?.org_id || getOrgIdFromRequest(request),
          type: "payment_failed",
          stripePaymentIntentId: paymentIntent.id,
          stripeAccountId: typeof event.account === "string" ? event.account : undefined,
          errorCode: lastError?.decline_code || lastError?.code || undefined,
          errorMessage: lastError?.message || undefined,
          customerEmail: paymentIntent.metadata?.customer_email,
          metadata: { amount: paymentIntent.amount, currency: paymentIntent.currency },
        });
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.metadata?.org_id) {
          const orgId = session.metadata.org_id;
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id;
          console.log(`[webhook] Subscription checkout completed for org ${orgId}, sub ${subscriptionId}`);
          await updateOrgPlanSettings(orgId, {
            plan_id: "pro",
            subscription_status: "active",
            stripe_subscription_id: subscriptionId || undefined,
            assigned_at: new Date().toISOString(),
            assigned_by: "stripe_checkout",
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.org_id;
        if (orgId) {
          const status = subscription.status as "active" | "past_due" | "canceled" | "incomplete";
          console.log(`[webhook] Subscription updated for org ${orgId}: ${status}`);
          await updateOrgPlanSettings(orgId, {
            subscription_status: status,
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.org_id;
        if (orgId) {
          console.log(`[webhook] Subscription deleted for org ${orgId} — downgrading to Starter`);
          await updateOrgPlanSettings(orgId, {
            plan_id: "starter",
            subscription_status: "canceled",
            stripe_subscription_id: undefined,
            current_period_end: undefined,
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subDetails = invoice.parent?.subscription_details;
        const subscriptionId =
          typeof subDetails?.subscription === "string"
            ? subDetails.subscription
            : subDetails?.subscription?.id;
        const orgId = subDetails?.metadata?.org_id;
        if (orgId) {
          console.error(`[webhook] Invoice payment failed for org ${orgId}, sub ${subscriptionId}`);
          await updateOrgPlanSettings(orgId, {
            subscription_status: "past_due",
          });
          logPaymentEvent({
            orgId,
            type: "subscription_failed",
            severity: "critical",
            errorMessage: `Invoice payment failed for subscription ${subscriptionId}`,
            metadata: { subscription_id: subscriptionId, invoice_id: invoice.id },
          });
        }
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    Sentry.captureException(err);
    console.error("Webhook handler error:", err);
    logPaymentEvent({
      orgId: getOrgIdFromRequest(request),
      type: "webhook_error",
      severity: "critical",
      errorCode: "handler_exception",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

/**
 * Handle a successful payment: create order, tickets, update stats.
 * Delegates to the shared createOrder() function.
 */
async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent, fallbackOrgId: string) {
  const metadata = paymentIntent.metadata;

  // Guest list application payments — separate flow
  if (metadata.type === "guest_list_application" && metadata.guest_list_id) {
    await handleGuestListApplicationPayment(paymentIntent);
    return;
  }

  // EP purchase — tenant topping up their float
  if (metadata.type === "ep_purchase" && metadata.tenant_org_id) {
    await handleEpPurchaseSuccess(paymentIntent);
    return;
  }

  const eventId = metadata.event_id;
  // SECURITY: require metadata.org_id explicitly. The previous version fell
  // back to fallbackOrgId (derived from x-org-id header / hostname), which
  // could mis-attribute a charge if a webhook arrived without the header set
  // (e.g. from a misconfigured edge worker). Every PI we create writes
  // org_id to metadata, so its absence is a real bug worth surfacing rather
  // than silently routing the order to the platform-default org.
  const orgId = metadata.org_id;
  const customerEmail = metadata.customer_email;
  const customerFirstName = metadata.customer_first_name;
  const customerLastName = metadata.customer_last_name;
  const customerPhone = metadata.customer_phone;
  const itemsJson = metadata.items_json;

  if (!orgId) {
    console.error(
      "[webhook] payment_intent.succeeded missing metadata.org_id — REFUSING to attribute via fallback. PI:",
      paymentIntent.id,
    );
    logPaymentEvent({
      orgId: fallbackOrgId,
      type: "webhook_error",
      severity: "critical",
      stripePaymentIntentId: paymentIntent.id,
      errorCode: "missing_org_id_metadata",
      errorMessage:
        "PaymentIntent succeeded but metadata.org_id was missing — payment NOT attributed (would have been mis-routed). Manual reconciliation required.",
      customerEmail,
    });
    return;
  }

  // SECURITY (Connect events): if this charge came from a connected account
  // (event.account is set), verify the metadata.org_id actually owns that
  // connected account in our DB. Defends against developer error or any
  // future code path that puts the wrong org_id on a PI's metadata. Stripe
  // signature verification already rules out forgery; this is belt and
  // braces over THAT.
  // (We can't access `event.account` from inside this function; the caller
  // does the cross-check below before delegating here. Kept as a comment
  // for future maintainers — see the case "payment_intent.succeeded" block.)

  if (!eventId || !customerEmail || !itemsJson) {
    console.error("Webhook missing required metadata:", metadata);
    logPaymentEvent({
      orgId,
      type: "webhook_error",
      severity: "critical",
      stripePaymentIntentId: paymentIntent.id,
      errorCode: "missing_metadata",
      errorMessage: `Required metadata missing — event_id=${!!eventId}, customer_email=${!!customerEmail}, items_json=${!!itemsJson}`,
      customerEmail,
    });
    return;
  }

  // Parse items — supports both compact format {t,q,s} (new) and full
  // format {ticket_type_id,qty,merch_size} (legacy).
  //
  // Defensive: a malformed items_json on a real charge would otherwise
  // throw and bubble up as a 500 → Stripe retries → orphan payment (money
  // taken, no ticket, no recovery without manual ops). Catch the JSON
  // failure, log it as a critical payment event so it surfaces in the
  // health dashboard, and return — Stripe stops retrying once we 200.
  let rawItems: Array<Record<string, unknown>>;
  try {
    rawItems = JSON.parse(itemsJson) as Array<Record<string, unknown>>;
  } catch (parseErr) {
    console.error("Webhook items_json parse failed:", parseErr, itemsJson);
    logPaymentEvent({
      orgId,
      type: "webhook_error",
      severity: "critical",
      stripePaymentIntentId: paymentIntent.id,
      errorCode: "items_json_malformed",
      errorMessage:
        parseErr instanceof Error ? parseErr.message : "JSON.parse failed",
      customerEmail,
      metadata: { items_json_preview: itemsJson.slice(0, 100) },
    });
    return;
  }
  const items: { ticket_type_id: string; qty: number; merch_size?: string }[] =
    rawItems.map((i) => ({
      ticket_type_id: (i.t as string) || (i.ticket_type_id as string),
      qty: (i.q as number) || (i.qty as number),
      ...(((i.s as string) || (i.merch_size as string)) ? { merch_size: (i.s as string) || (i.merch_size as string) } : {}),
    }));

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    console.error("Supabase not configured for webhook handler");
    return;
  }

  // Check if order already exists for this payment (idempotency)
  const { data: existingOrder } = await supabase
    .from(TABLES.ORDERS)
    .select("id, order_number, total, currency, event_id, metadata")
    .eq("payment_ref", paymentIntent.id)
    .eq("org_id", orgId)
    .single();

  if (existingOrder) {
    // Order already created — but check if confirmation email was sent.
    // If the confirm-order route created the order but its serverless
    // function was terminated before the email completed, send it now.
    const meta = (existingOrder.metadata || {}) as Record<string, unknown>;
    if (meta.email_sent !== true) {
      try {
        const { data: ev } = await supabase
          .from(TABLES.EVENTS)
          .select("id, name, slug, currency, venue_name, date_start, doors_time")
          .eq("id", existingOrder.event_id)
          .eq("org_id", orgId)
          .single();

        const { data: orderTickets } = await supabase
          .from(TABLES.TICKETS)
          .select("ticket_code, merch_size, ticket_type:ticket_types(name, merch_name, product:products(name))")
          .eq("order_id", existingOrder.id);

        if (ev && customerEmail && orderTickets) {
          await sendOrderConfirmationEmail({
            orgId,
            order: {
              id: existingOrder.id,
              order_number: existingOrder.order_number,
              total: Number(existingOrder.total),
              currency: (ev.currency || existingOrder.currency || "GBP").toUpperCase(),
            },
            customer: {
              first_name: customerFirstName || "",
              last_name: customerLastName || "",
              email: customerEmail,
            },
            event: {
              name: ev.name,
              slug: ev.slug,
              venue_name: ev.venue_name,
              date_start: ev.date_start,
              doors_time: ev.doors_time,
              currency: ev.currency,
            },
            tickets: (orderTickets as { ticket_code: string; merch_size?: string; ticket_type?: { name?: string; merch_name?: string; product?: { name?: string } | null } | null }[]).map((t) => ({
              ticket_code: t.ticket_code,
              ticket_type_name: t.ticket_type?.name || "Ticket",
              merch_size: t.merch_size,
              merch_name: t.merch_size
                ? t.ticket_type?.product?.name || t.ticket_type?.merch_name || undefined
                : undefined,
            })),
          });
          console.log(`[webhook] Safety net: sent missing email for existing order ${existingOrder.order_number}`);
        }
      } catch (emailErr) {
        console.error(`[webhook] Safety net: failed to send email for order ${existingOrder.order_number}:`, emailErr);
      }
    }
    return;
  }

  // Fetch event (include venue/date fields for order confirmation email)
  const { data: event } = await supabase
    .from(TABLES.EVENTS)
    .select("id, name, slug, currency, venue_name, date_start, doors_time")
    .eq("id", eventId)
    .eq("org_id", orgId)
    .single();

  if (!event) {
    console.error(`Event ${eventId} not found for webhook`);
    return;
  }

  // Extract VAT info from PaymentIntent metadata
  let vatInfo: OrderVat | undefined;
  if (metadata.vat_amount && Number(metadata.vat_amount) > 0) {
    vatInfo = {
      amount: Number(metadata.vat_amount),
      rate: Number(metadata.vat_rate || 0),
      inclusive: metadata.vat_inclusive === "true",
    };
  }

  // Extract discount info from PaymentIntent metadata
  let discountInfo: OrderDiscount | undefined;
  if (metadata.discount_code && metadata.discount_amount) {
    discountInfo = {
      code: metadata.discount_code,
      amount: Number(metadata.discount_amount),
      type: metadata.discount_type || undefined,
      value: metadata.discount_value ? Number(metadata.discount_value) : undefined,
    };
  }

  // Extract multi-currency conversion metadata
  let conversionInfo: {
    baseCurrency: string;
    baseTotal: number;
    exchangeRate: number;
    rateLocked: string;
  } | undefined;
  if (metadata.base_currency && metadata.exchange_rate) {
    conversionInfo = {
      baseCurrency: metadata.base_currency,
      baseTotal: Number(metadata.base_total || metadata.base_subtotal || 0),
      exchangeRate: Number(metadata.exchange_rate),
      rateLocked: metadata.rate_locked_at || new Date().toISOString(),
    };
  }

  const isTest = metadata.test_order === "true";

  try {
    const result = await createOrder({
      supabase,
      orgId,
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        currency: event.currency,
        venue_name: event.venue_name,
        date_start: event.date_start,
        doors_time: event.doors_time,
      },
      items,
      customer: {
        email: customerEmail,
        first_name: customerFirstName,
        last_name: customerLastName,
        phone: customerPhone,
      },
      payment: {
        method: "stripe",
        ref: paymentIntent.id,
        totalCharged: fromSmallestUnit(paymentIntent.amount, event.currency),
      },
      vat: vatInfo,
      sendEmail: !isTest,
      discountCode: metadata.discount_code || undefined,
      discount: discountInfo,
      conversion: conversionInfo,
      presentmentCurrency: metadata.presentment_currency || undefined,
      testOrder: isTest,
    });

    console.log(
      `Order ${result.order.order_number} created for PI ${paymentIntent.id} (${result.tickets.length} tickets)`
    );

    // Skip all tracking for test orders
    if (!isTest) {
      // ── Server-side traffic event for dashboard live activity (backup) ──
      // The confirm-order route also inserts this; Supabase will just add a row
      // (no unique constraint on session_id), so at worst we get a duplicate —
      // harmless and preferable to missing a purchase.
      supabase
        .from(TABLES.TRAFFIC_EVENTS)
        .insert({
          org_id: orgId,
          event_type: "purchase",
          page_path: `/event/${event.slug}/checkout/`,
          event_name: event.slug,
          session_id: `webhook_${result.order.order_number}`,
        })
        .then(() => {}, () => {});

      // Fire server-side CAPI Purchase event as backup
      // Uses deterministic event_id for dedup with client pixel + confirm-order CAPI
      fireWebhookPurchaseEvent(orgId, {
        orderNumber: result.order.order_number,
        total: fromSmallestUnit(paymentIntent.amount, event.currency),
        currency: event.currency || "GBP",
        ticketTypeIds: items.map((i) => i.ticket_type_id),
        numItems: items.reduce((sum, i) => sum + i.qty, 0),
        customerEmail,
        customerFirstName,
        customerLastName,
        customerPhone,
        customerId: result.order.customer_id,
        eventSlug: event.slug,
      }).catch((err) => console.error("[Meta CAPI] Webhook Purchase error:", err));
    }
  } catch (err) {
    Sentry.captureException(err);
    console.error("Failed to create order for PI:", paymentIntent.id, err);

    // If tickets sold out after payment succeeded, this is a critical orphan —
    // money taken but no ticket issued. Log it prominently for resolution.
    if (err instanceof OrderCreationError && err.statusCode === 409) {
      logPaymentEvent({
        orgId,
        type: "checkout_error",
        severity: "critical",
        stripePaymentIntentId: paymentIntent.id,
        errorCode: "sold_out_after_payment",
        errorMessage: err.message,
        customerEmail,
        metadata: { items: itemsJson, event_id: eventId },
      });
    }
  }
}

/**
 * Fire server-side CAPI Purchase from webhook (backup path).
 * Uses same deterministic event_id as confirm-order and client pixel.
 */
async function fireWebhookPurchaseEvent(orgId: string, data: {
  orderNumber: string;
  total: number;
  currency: string;
  ticketTypeIds: string[];
  numItems: number;
  customerEmail?: string;
  customerFirstName?: string;
  customerLastName?: string;
  customerPhone?: string;
  customerId?: string;
  eventSlug: string;
}) {
  const settings = await fetchMarketingSettings(orgId);
  if (!settings?.meta_tracking_enabled || !settings.meta_pixel_id || !settings.meta_capi_token) {
    return;
  }

  const eventId = `purchase-${data.orderNumber}`;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";

  const event: MetaEventPayload = {
    event_name: "Purchase",
    event_id: eventId,
    event_time: Math.floor(Date.now() / 1000),
    event_source_url: `${siteUrl}/event/${data.eventSlug}/checkout/`,
    action_source: "website",
    user_data: {
      ...(data.customerEmail && { em: hashSHA256(data.customerEmail) }),
      ...(data.customerFirstName && { fn: hashSHA256(data.customerFirstName) }),
      ...(data.customerLastName && { ln: hashSHA256(data.customerLastName) }),
      ...(data.customerPhone && { ph: hashSHA256(data.customerPhone) }),
      ...(data.customerId && { external_id: hashSHA256(data.customerId) }),
    },
    custom_data: {
      content_ids: data.ticketTypeIds,
      content_type: "product",
      content_category: "Events",
      value: data.total,
      currency: data.currency,
      num_items: data.numItems,
      order_id: data.orderNumber,
    },
  };

  const result = await sendMetaEvents(
    settings.meta_pixel_id,
    settings.meta_capi_token,
    [event],
    settings.meta_test_event_code || undefined
  );

  if (result?.error) {
    console.error("[Meta CAPI] Webhook Purchase failed:", result.error);
  } else {
    console.log("[Meta CAPI] Webhook Purchase sent:", eventId);
  }
}

// ---------------------------------------------------------------------------
// Charge refunded webhook handler — fires for refunds initiated either via
// our /api/orders/[id]/refund OR directly in the Stripe Dashboard. The
// shared applyRefundSideEffects() is idempotent (atomic status flip with
// .neq("status","refunded")), so the case where our route already synced
// the DB is a safe no-op.
// ---------------------------------------------------------------------------

async function handleChargeRefunded(
  charge: Stripe.Charge,
  event: Stripe.Event,
) {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;

  if (!paymentIntentId) {
    console.warn(
      "[webhook] charge.refunded with no payment_intent — ignoring",
      charge.id,
    );
    return;
  }

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    console.error(
      "[webhook] Supabase not configured for charge.refunded handler",
    );
    return;
  }

  // Find the order by payment_ref. Don't filter by org_id here — webhooks
  // come unscoped from Stripe; the order itself carries org_id which we
  // pass into applyRefundSideEffects for downstream tenant-scoped writes.
  const { data: order } = await supabase
    .from(TABLES.ORDERS)
    .select("id, org_id, status")
    .eq("payment_ref", paymentIntentId)
    .single();

  if (!order) {
    // No matching order — could be a non-Entry charge on the connected
    // account, or our own /api/stripe/confirm-order hasn't created the
    // order yet. Either way, nothing to do.
    console.log(
      "[webhook] charge.refunded — no matching order for PI",
      paymentIntentId,
    );
    return;
  }

  if (order.status === "refunded") {
    // Already synced (our /api/orders/[id]/refund did the work). No-op.
    return;
  }

  try {
    const result = await applyRefundSideEffects(order.id, order.org_id, {
      reason:
        (charge.refunds?.data?.[0]?.reason as string | undefined) ||
        "stripe_dashboard",
      adminUserId: null,
      source: "webhook",
    });
    console.log(
      `[webhook] charge.refunded synced for PI ${paymentIntentId}: applied=${result.applied}, email_sent=${result.email_sent}, account=${typeof event.account === "string" ? event.account : "platform"}`,
    );
  } catch (err) {
    Sentry.captureException(err);
    logPaymentEvent({
      orgId: order.org_id,
      type: "webhook_error",
      severity: "critical",
      stripePaymentIntentId: paymentIntentId,
      errorCode: "refund_sync_failed",
      errorMessage:
        err instanceof Error ? err.message : "Unknown error",
    });
  }
}

// ---------------------------------------------------------------------------
// Guest list application payment webhook handler
// ---------------------------------------------------------------------------

async function handleGuestListApplicationPayment(paymentIntent: Stripe.PaymentIntent) {
  const metadata = paymentIntent.metadata;
  const guestListId = metadata.guest_list_id;
  const orgId = metadata.org_id;

  if (!guestListId || !orgId) {
    console.error("[webhook] Guest list application missing metadata:", metadata);
    return;
  }

  const supabase = await getSupabaseAdmin();
  if (!supabase) return;

  // Check if ticket already issued (idempotent)
  const { data: guest } = await supabase
    .from(TABLES.GUEST_LIST)
    .select("*, event:events(id, name, slug, currency, venue_name, date_start, doors_time)")
    .eq("id", guestListId)
    .eq("org_id", orgId)
    .single();

  if (!guest) {
    console.error(`[webhook] Guest list entry not found: ${guestListId}`);
    return;
  }

  // Already has a ticket — nothing to do
  if (guest.order_id) {
    console.log(`[webhook] Guest list ${guestListId} already has order — skipping`);
    return;
  }

  const event = guest.event as {
    id: string; name: string; slug?: string; currency?: string;
    venue_name?: string; date_start?: string; doors_time?: string;
  } | null;

  if (!event) {
    console.error(`[webhook] Event not found for guest list ${guestListId}`);
    return;
  }

  try {
    const { issueGuestListTicket } = await import("@/lib/guest-list");
    await issueGuestListTicket(supabase, orgId, guest, event, "webhook");
    console.log(`[webhook] Guest list ticket issued for ${guestListId} via webhook backup`);
  } catch (err) {
    console.error(`[webhook] Failed to issue guest list ticket for ${guestListId}:`, err);
  }
}

// ---------------------------------------------------------------------------
// EP purchase — tenant's Stripe PaymentIntent succeeded, record it in the
// ledger so their float goes up by the purchased EP amount.
// Idempotent: looks up ep_tenant_purchases by stripe_payment_intent_id and
// short-circuits if status is not 'pending'.
// ---------------------------------------------------------------------------
async function handleEpPurchaseSuccess(paymentIntent: Stripe.PaymentIntent) {
  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    Sentry.captureMessage("[webhook/ep_purchase] Supabase not configured", "error");
    return;
  }

  const tenantOrgId = paymentIntent.metadata.tenant_org_id;
  const purchaseId = paymentIntent.metadata.purchase_id;

  if (!tenantOrgId || !purchaseId) {
    Sentry.captureMessage(
      "[webhook/ep_purchase] Missing metadata on PaymentIntent",
      { extra: { paymentIntentId: paymentIntent.id, metadata: paymentIntent.metadata } }
    );
    return;
  }

  // Look up the pending purchase row
  const { data: purchase, error: fetchErr } = await supabase
    .from("ep_tenant_purchases")
    .select("id, ep_amount, fiat_rate_pence, status")
    .eq("id", purchaseId)
    .eq("tenant_org_id", tenantOrgId)
    .single();

  if (fetchErr || !purchase) {
    Sentry.captureException(fetchErr ?? new Error("ep_tenant_purchases row missing"), {
      extra: { paymentIntentId: paymentIntent.id, purchaseId, tenantOrgId },
    });
    return;
  }

  if (purchase.status !== "pending") {
    // Already processed — idempotent no-op. Happens when Stripe retries a
    // webhook or we redeliver manually from the dashboard.
    console.log(
      `[webhook/ep_purchase] Purchase ${purchaseId} already ${purchase.status}; ignoring`
    );
    return;
  }

  // Transition: pending → succeeded + write ledger entry
  const { error: updateErr } = await supabase
    .from("ep_tenant_purchases")
    .update({ status: "succeeded", completed_at: new Date().toISOString() })
    .eq("id", purchase.id);

  if (updateErr) {
    Sentry.captureException(updateErr, {
      extra: { purchaseId, paymentIntentId: paymentIntent.id },
    });
    return;
  }

  // Write the tenant_purchase ledger entry — this is what credits the
  // tenant's float (ep_tenant_float view SUMs this up).
  const { error: ledgerErr } = await supabase.from("ep_ledger").insert({
    entry_type: "tenant_purchase",
    ep_amount: purchase.ep_amount,
    tenant_org_id: tenantOrgId,
    ep_purchase_id: purchase.id,
    fiat_rate_pence: purchase.fiat_rate_pence,
    notes: `Stripe PI ${paymentIntent.id}`,
  });

  if (ledgerErr) {
    // Ledger write failed — roll the purchase status back so we can retry.
    // If Stripe redelivers the webhook, the handler will see 'pending' again
    // and re-attempt. Sentry alerts on the drift.
    await supabase
      .from("ep_tenant_purchases")
      .update({ status: "pending" })
      .eq("id", purchase.id);
    Sentry.captureException(ledgerErr, {
      extra: { purchaseId, paymentIntentId: paymentIntent.id, epAmount: purchase.ep_amount },
    });
    return;
  }

  console.log(
    `[webhook/ep_purchase] +${purchase.ep_amount} EP to ${tenantOrgId} float (PI ${paymentIntent.id})`
  );
}
