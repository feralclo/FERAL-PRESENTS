/**
 * Shopify supplier integration for Entry Market.
 *
 * Phase 1 supplier is Harry's external techno clothing Shopify store — NOT
 * this platform's tenants. When a rep redeems EP for a market product, we
 * create an order on that Shopify so the brand fulfils and ships.
 *
 * This module is currently **stubbed**. The live integration lands when
 * Harry hands over the Shopify store's API credentials (planned path:
 * Admin API access token + store domain env vars). Until then every
 * submitShopifyOrder call logs the payload and returns a fake external
 * order ID so the claim row has something to reference.
 *
 * The claim's status lifecycle is:
 *   claimed → submitted_to_supplier → fulfilled
 *                ↘ failed → (cancellable via cancel_market_claim_and_refund RPC)
 *
 * When wiring the real integration:
 * 1. Set SHOPIFY_SUPPLIER_SHOP_DOMAIN + SHOPIFY_SUPPLIER_ADMIN_TOKEN env vars
 *    on Vercel (all envs) and locally via `vercel env pull`.
 * 2. Replace submitShopifyOrder's stub branch with a POST to
 *    `https://{shop}/admin/api/2024-10/orders.json` using the admin token.
 * 3. Propagate the returned order id/name/url back into platform_market_claims.
 * 4. Transition claim.status to 'submitted_to_supplier' on 2xx, 'failed' on error.
 */

export interface ShopifyShippingAddress {
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postcode: string;
  country: string;
}

export interface SubmitShopifyOrderInput {
  claim_id: string;
  product: {
    id: string;
    title: string;
    external_product_id: string | null;
    external_variant_id: string | null;
    ep_price: number;
  };
  shipping: {
    name: string;
    email: string;
    phone: string | null;
    address: ShopifyShippingAddress;
  };
}

export interface SubmitShopifyOrderResult {
  stub: boolean;
  external_order_id: string;
  external_order_number: string | null;
  external_order_url: string | null;
}

/**
 * Returns true when the live Shopify integration has the env vars it
 * needs to run. Currently both vars are absent, so this returns false
 * and callers fall through to the stub.
 */
function isLiveIntegrationConfigured(): boolean {
  return Boolean(
    process.env.SHOPIFY_SUPPLIER_SHOP_DOMAIN &&
      process.env.SHOPIFY_SUPPLIER_ADMIN_TOKEN
  );
}

/**
 * Submit a redeemed claim to the supplier Shopify. In stub mode, logs
 * the payload and returns a deterministic fake order id so callers can
 * store *something* in platform_market_claims.external_order_id for the
 * audit trail. The stub never throws.
 */
export async function submitShopifyOrder(
  input: SubmitShopifyOrderInput
): Promise<SubmitShopifyOrderResult> {
  if (!isLiveIntegrationConfigured()) {
    // Stub — print what we *would* send so the user can eyeball the
    // payload shape on their way to wiring Shopify.
    console.log("[market/shopify STUB] submitShopifyOrder", {
      claim_id: input.claim_id,
      product: input.product,
      shipping_name: input.shipping.name,
      shipping_country: input.shipping.address.country,
    });
    return {
      stub: true,
      external_order_id: `STUB-${input.claim_id}`,
      external_order_number: null,
      external_order_url: null,
    };
  }

  // Live integration — deliberately unimplemented. When we flip this on,
  // the shape of the Shopify Admin Orders POST is:
  //
  //   POST https://{shop}.myshopify.com/admin/api/2024-10/orders.json
  //   X-Shopify-Access-Token: {admin token}
  //   Body: {
  //     order: {
  //       email, phone,
  //       line_items: [{ variant_id | product_id, quantity: 1 }],
  //       shipping_address: {...}, customer: {...},
  //       financial_status: 'paid',      // we already settled EP with the rep
  //       tags: 'entry-market',
  //       note_attributes: [{ name: 'entry_claim_id', value: claim.id }]
  //     }
  //   }
  //
  // Keeping the throw here so any accidental "it's live now!" misconfig
  // surfaces loudly rather than silently fulfilling as stub.
  throw new Error(
    "Shopify supplier integration is configured but not yet implemented. " +
      "Contact backend before flipping SHOPIFY_SUPPLIER_* env vars."
  );
}

/**
 * True when the configured Shopify store is considered healthy and
 * available to take new orders. Used by the products GET endpoint so
 * iOS can surface a "market temporarily unavailable" state if the
 * supplier goes down. Stub always returns true.
 */
export async function isSupplierHealthy(): Promise<boolean> {
  if (!isLiveIntegrationConfigured()) return true;
  // Real impl will ping Shopify /shop.json and return false on non-2xx.
  return true;
}

/**
 * Surface a boolean + reason for admin dashboards. Today: stubbed.
 * Future: read the supplier health cache populated by a cron.
 */
export function getIntegrationStatus(): { mode: "stub" | "live"; reason?: string } {
  return isLiveIntegrationConfigured()
    ? { mode: "live" }
    : { mode: "stub", reason: "SHOPIFY_SUPPLIER_* env vars unset" };
}
