import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendClaimDispatched } from "@/lib/market/emails";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/webhooks/shopify-supplier
 *
 * Receives webhooks from the supplier Shopify (Entry Market source store).
 * Today we only act on `orders/fulfilled` — when the supplier marks an
 * order shipped, we pull tracking off the fulfillment, persist it on the
 * matching platform_market_claims row, and send the rep a dispatch email
 * with the tracking link.
 *
 * Security: every request is HMAC-SHA256 verified against
 * SHOPIFY_SUPPLIER_WEBHOOK_SECRET. Mismatches return 401. We also reject
 * payloads larger than 1MB.
 *
 * Idempotency: Shopify retries on non-2xx, so we ack 200 even on cases
 * where the claim already has dispatch_email_sent_at set (the email
 * helper itself is idempotent). Errors that should trigger a redelivery
 * (DB outage etc.) return 500.
 *
 * Claim lookup: Shopify orders we created carry a `note_attributes`
 * entry `entry_claim_id`. We try that first, then fall back to matching
 * `external_order_id` against the order's GraphQL admin id.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_000_000;

interface ShopifyTracking {
  number: string | null;
  url: string | null;
  company: string | null;
}

interface ShopifyFulfillment {
  tracking_number?: string | null;
  tracking_numbers?: string[] | null;
  tracking_url?: string | null;
  tracking_urls?: string[] | null;
  tracking_company?: string | null;
}

interface ShopifyOrderPayload {
  id?: number;
  name?: string;
  note_attributes?: Array<{ name?: string; value?: string }>;
  fulfillments?: ShopifyFulfillment[];
  email?: string;
  shipping_address?: Record<string, unknown> | null;
}

function verifyHmac(rawBody: string, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader) return false;
  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");
  // Use timingSafeEqual on equal-length buffers; differing lengths trip a
  // throw if we don't size-check first.
  const a = Buffer.from(computed);
  const b = Buffer.from(hmacHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function pickTracking(fulfillments: ShopifyFulfillment[] | undefined): ShopifyTracking {
  if (!fulfillments || fulfillments.length === 0) {
    return { number: null, url: null, company: null };
  }
  // Use the most recent fulfillment that has any tracking info — Shopify
  // appends new fulfillments rather than mutating, and a partially-shipped
  // order may have multiple. We pick the last one.
  for (let i = fulfillments.length - 1; i >= 0; i--) {
    const f = fulfillments[i];
    const number =
      f.tracking_number ??
      (Array.isArray(f.tracking_numbers) && f.tracking_numbers.length > 0
        ? f.tracking_numbers[0]
        : null);
    const url =
      f.tracking_url ??
      (Array.isArray(f.tracking_urls) && f.tracking_urls.length > 0
        ? f.tracking_urls[0]
        : null);
    const company = f.tracking_company ?? null;
    if (number || url || company) {
      return { number: number ?? null, url: url ?? null, company };
    }
  }
  return { number: null, url: null, company: null };
}

function findClaimIdInNoteAttributes(
  noteAttributes: ShopifyOrderPayload["note_attributes"],
): string | null {
  if (!Array.isArray(noteAttributes)) return null;
  for (const a of noteAttributes) {
    if (a?.name === "entry_claim_id" && typeof a.value === "string" && a.value) {
      return a.value;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  // Read body as text first so we can both verify the HMAC and parse JSON.
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const secret = process.env.SHOPIFY_SUPPLIER_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(
      "[shopify-webhook] SHOPIFY_SUPPLIER_WEBHOOK_SECRET not set — rejecting all webhooks",
    );
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }

  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  if (!verifyHmac(rawBody, hmacHeader, secret)) {
    console.warn("[shopify-webhook] HMAC verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const topic = request.headers.get("x-shopify-topic") ?? "";

  // Acknowledge unrelated topics with 200 so Shopify doesn't retry. We
  // only need orders/fulfilled today; any other topic is a config-side
  // accident the platform owner will sort out in their Shopify admin.
  if (topic !== "orders/fulfilled") {
    console.log(`[shopify-webhook] Ignoring topic: ${topic}`);
    return NextResponse.json({ ignored: true, topic }, { status: 200 });
  }

  let payload: ShopifyOrderPayload;
  try {
    payload = JSON.parse(rawBody) as ShopifyOrderPayload;
  } catch {
    // Malformed payloads from a verified sender are still acknowledged
    // — retrying won't help.
    console.warn("[shopify-webhook] Invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 200 });
  }

  const claimIdHint = findClaimIdInNoteAttributes(payload.note_attributes);
  const externalOrderId = payload.id ? String(payload.id) : null;

  if (!claimIdHint && !externalOrderId) {
    console.log("[shopify-webhook] No claim hint + no external order id — nothing to match");
    return NextResponse.json({ ignored: true, reason: "no_match_hint" }, { status: 200 });
  }

  const db = await getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 500 });
  }

  // Look up the claim — note attribute is authoritative; fall back to
  // external_order_id if note didn't survive (manual orders, edits).
  type ClaimRow = {
    id: string;
    rep_id: string;
    product_id: string;
    variant_id: string | null;
    shipping_name: string;
    shipping_email: string;
    shipping_address: Record<string, unknown>;
    status: string;
    dispatch_email_sent_at: string | null;
  };
  const CLAIM_COLS =
    "id, rep_id, product_id, variant_id, shipping_name, shipping_email, shipping_address, status, dispatch_email_sent_at";
  let claim: ClaimRow | null = null;

  if (claimIdHint) {
    const { data } = await db
      .from("platform_market_claims")
      .select(CLAIM_COLS)
      .eq("id", claimIdHint)
      .maybeSingle();
    claim = (data as unknown as ClaimRow | null) ?? null;
  }
  if (!claim && externalOrderId) {
    const { data } = await db
      .from("platform_market_claims")
      .select(CLAIM_COLS)
      .eq("external_order_id", externalOrderId)
      .maybeSingle();
    claim = (data as unknown as ClaimRow | null) ?? null;
  }

  if (!claim) {
    console.log(
      `[shopify-webhook] No claim matched (hint=${claimIdHint ?? "—"}, externalOrderId=${externalOrderId ?? "—"})`,
    );
    return NextResponse.json({ ignored: true, reason: "no_claim_matched" }, { status: 200 });
  }

  const tracking = pickTracking(payload.fulfillments);

  const updates: Record<string, unknown> = {
    status: "fulfilled",
    fulfilled_at: new Date().toISOString(),
    tracking_number: tracking.number,
    tracking_url: tracking.url,
    tracking_company: tracking.company,
  };
  // Don't trample external_order_number if it was already set at claim time.
  if (!externalOrderId && payload.id) {
    updates.external_order_id = String(payload.id);
  }
  if (payload.name) {
    updates.external_order_number = payload.name;
  }

  const { error: updateError } = await db
    .from("platform_market_claims")
    .update(updates)
    .eq("id", claim.id);
  if (updateError) {
    Sentry.captureException(updateError, {
      extra: { step: "update_claim_on_fulfilled", claimId: claim.id },
    });
    return NextResponse.json({ error: "Failed to update claim" }, { status: 500 });
  }

  // Already-dispatched? Acknowledge but skip the email — sendClaimDispatched
  // is idempotent too, but checking here saves a DB read + Resend call.
  if (claim.dispatch_email_sent_at) {
    return NextResponse.json({ ok: true, redelivery: true }, { status: 200 });
  }

  // Fetch product + variant titles for the email body. Done after the
  // claim update so the tracking row state is correct even if these
  // reads fail.
  const [{ data: product }, variantRes] = await Promise.all([
    db
      .from("platform_market_products")
      .select("title")
      .eq("id", claim.product_id)
      .maybeSingle(),
    claim.variant_id
      ? db
          .from("platform_market_product_variants")
          .select("title, option1")
          .eq("id", claim.variant_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const variantData = (variantRes as { data: { title?: string | null; option1?: string | null } | null }).data;

  const shipping = claim.shipping_address as {
    line1: string;
    line2?: string | null;
    city: string;
    region?: string | null;
    postcode: string;
    country: string;
  };

  // Fire-and-forget — the webhook 200 must not depend on Resend latency,
  // and the helper records its own success state for retry semantics.
  void sendClaimDispatched({
    claimId: claim.id,
    recipientEmail: claim.shipping_email,
    recipientName: claim.shipping_name,
    productTitle: (product as { title?: string } | null)?.title ?? "Entry Market item",
    variantTitle: variantData?.title ?? variantData?.option1 ?? null,
    trackingNumber: tracking.number,
    trackingUrl: tracking.url,
    trackingCompany: tracking.company,
    shippingAddress: shipping,
  }).catch((err) => {
    Sentry.captureException(err, {
      extra: { step: "sendClaimDispatched", claimId: claim?.id },
    });
  });

  return NextResponse.json({ ok: true, claim_id: claim.id }, { status: 200 });
}
