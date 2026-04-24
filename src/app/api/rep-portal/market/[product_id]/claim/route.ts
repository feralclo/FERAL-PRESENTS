import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { submitShopifyOrder } from "@/lib/market/shopify";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/rep-portal/market/:product_id/claim
 *
 * Rep redeems EP for an Entry Market product variant. Atomic: balance
 * check + stock decrement + ledger write happen inside
 * claim_market_product_atomic. On success we hand off to the Shopify
 * supplier integration — failure there does NOT roll back the ledger;
 * the claim flips to 'failed' and platform staff can retry or refund.
 *
 * Body:
 *   {
 *     variant_id: uuid,
 *     shipping_name, shipping_email,
 *     shipping_phone?,
 *     shipping_address: { line1, line2?, city, region?, postcode, country }
 *   }
 *
 * Response: 201 {
 *   data: { claim_id, new_balance, stock_remaining, status,
 *           external_order_id?, external_order_number?, external_order_url?,
 *           supplier_stubbed }
 * }
 *
 * Errors (400 unless noted):
 *   rep_not_found (404), product_not_found (404), variant_not_found (404),
 *   product_unavailable / variant_unavailable (410),
 *   out_of_stock (409), insufficient_balance (402, returns balance).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ShippingAddress {
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postcode: string;
  country: string;
}

function validateShipping(body: Record<string, unknown>):
  | { ok: true; name: string; email: string; phone: string | null; address: ShippingAddress }
  | { ok: false; error: string } {
  const name = typeof body.shipping_name === "string" ? body.shipping_name.trim() : "";
  if (name.length < 2 || name.length > 120) return { ok: false, error: "shipping_name required (2–120 chars)" };

  const email = typeof body.shipping_email === "string" ? body.shipping_email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return { ok: false, error: "shipping_email must be a valid email" };
  }

  const phoneRaw = typeof body.shipping_phone === "string" ? body.shipping_phone.trim() : "";
  const phone = phoneRaw || null;
  if (phone && phone.length > 40) return { ok: false, error: "shipping_phone too long" };

  const addr = body.shipping_address as Record<string, unknown> | undefined;
  if (!addr || typeof addr !== "object") {
    return { ok: false, error: "shipping_address is required" };
  }
  const line1 = typeof addr.line1 === "string" ? addr.line1.trim() : "";
  const city = typeof addr.city === "string" ? addr.city.trim() : "";
  const postcode = typeof addr.postcode === "string" ? addr.postcode.trim() : "";
  const country = typeof addr.country === "string" ? addr.country.trim() : "";
  if (!line1 || line1.length > 200) return { ok: false, error: "shipping_address.line1 required" };
  if (!city  || city.length  > 120) return { ok: false, error: "shipping_address.city required" };
  if (!postcode || postcode.length > 32) return { ok: false, error: "shipping_address.postcode required" };
  if (!country  || country.length  > 80) return { ok: false, error: "shipping_address.country required" };
  const line2 = typeof addr.line2 === "string" && addr.line2.trim() ? addr.line2.trim() : null;
  const region = typeof addr.region === "string" && addr.region.trim() ? addr.region.trim() : null;

  return {
    ok: true,
    name,
    email,
    phone,
    address: { line1, line2, city, region, postcode, country },
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ product_id: string }> }
) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const { product_id: productId } = await params;
    if (!UUID_RE.test(productId)) {
      return NextResponse.json({ error: "product_id must be a valid UUID" }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const variantId = typeof body.variant_id === "string" ? body.variant_id : "";
    if (!UUID_RE.test(variantId)) {
      return NextResponse.json({ error: "variant_id must be a valid UUID" }, { status: 400 });
    }

    const validated = validateShipping(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const db = await getSupabaseAdmin();
    if (!db) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

    const { data: rpcData, error: rpcError } = await db.rpc("claim_market_product_atomic", {
      p_rep_id: auth.rep.id,
      p_product_id: productId,
      p_variant_id: variantId,
      p_shipping_name: validated.name,
      p_shipping_email: validated.email,
      p_shipping_phone: validated.phone,
      p_shipping_address: validated.address,
    });

    if (rpcError) {
      Sentry.captureException(rpcError, {
        extra: { repId: auth.rep.id, productId, variantId },
      });
      return NextResponse.json({ error: "Failed to claim" }, { status: 500 });
    }

    const result = rpcData as
      | { success: true; claim_id: string; new_balance: number; stock_remaining: number | null }
      | { error: string; balance?: number; status?: string };

    if ("error" in result) {
      const statusMap: Record<string, number> = {
        rep_not_found: 404,
        product_not_found: 404,
        variant_not_found: 404,
        product_unavailable: 410,
        variant_unavailable: 410,
        out_of_stock: 409,
        insufficient_balance: 402,
      };
      const httpStatus = statusMap[result.error] ?? 400;
      return NextResponse.json(result, { status: httpStatus });
    }

    // Fetch product + variant for the Shopify submission payload.
    // Done after the atomic claim succeeds so Shopify work never happens
    // for a claim that's not in the ledger.
    const [{ data: product }, { data: variant }] = await Promise.all([
      db
        .from("platform_market_products")
        .select("id, title, external_product_id, source")
        .eq("id", productId)
        .maybeSingle(),
      db
        .from("platform_market_product_variants")
        .select("id, title, external_variant_id, ep_price")
        .eq("id", variantId)
        .maybeSingle(),
    ]);

    let externalOrderId: string | null = null;
    let externalOrderNumber: string | null = null;
    let externalOrderUrl: string | null = null;
    // supplier_stubbed is only true if the stub code path actually ran.
    // A failed live submission is NOT stubbed — initialize to false.
    let supplierStubbed = false;
    let nextStatus: "submitted_to_supplier" | "failed" = "submitted_to_supplier";
    let errorMessage: string | null = null;

    try {
      const submission = await submitShopifyOrder({
        claim_id: result.claim_id,
        product: {
          id: (product as { id?: string } | null)?.id ?? productId,
          title: (product as { title?: string } | null)?.title ?? "Entry Market item",
          external_product_id:
            (product as { external_product_id?: string | null } | null)?.external_product_id ?? null,
          external_variant_id:
            (variant as { external_variant_id?: string | null } | null)?.external_variant_id ?? null,
          ep_price: (variant as { ep_price?: number } | null)?.ep_price ?? 0,
        },
        shipping: {
          name: validated.name,
          email: validated.email,
          phone: validated.phone,
          address: validated.address,
        },
      });
      externalOrderId = submission.external_order_id;
      externalOrderNumber = submission.external_order_number;
      externalOrderUrl = submission.external_order_url;
      supplierStubbed = submission.stub;
    } catch (err) {
      nextStatus = "failed";
      errorMessage = err instanceof Error ? err.message : String(err);
      Sentry.captureException(err, {
        extra: { step: "submitShopifyOrder", claimId: result.claim_id },
      });
    }

    await db
      .from("platform_market_claims")
      .update({
        status: nextStatus,
        external_order_id: externalOrderId,
        external_order_number: externalOrderNumber,
        external_order_url: externalOrderUrl,
        error_message: errorMessage,
      })
      .eq("id", result.claim_id);

    return NextResponse.json(
      {
        data: {
          claim_id: result.claim_id,
          new_balance: result.new_balance,
          stock_remaining: result.stock_remaining,
          status: nextStatus,
          external_order_id: externalOrderId,
          external_order_number: externalOrderNumber,
          external_order_url: externalOrderUrl,
          supplier_stubbed: supplierStubbed,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/market/[product_id]/claim] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
