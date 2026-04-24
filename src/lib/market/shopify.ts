/**
 * Shopify supplier integration for Entry Market.
 *
 * Phase 1 supplier is the user's external techno clothing Shopify store —
 * NOT this platform's tenants. When a rep redeems EP for a market product,
 * we create an order on that Shopify so the brand fulfils and ships.
 *
 * Runs in two modes:
 *   - **live** when SHOPIFY_SUPPLIER_SHOP_DOMAIN + SHOPIFY_SUPPLIER_ADMIN_TOKEN
 *     are set — submits a real Admin API POST /orders.
 *   - **stub** when either env var is missing — logs the payload, returns a
 *     fake external_order_id. Used for previews / local dev without creds.
 *
 * The claim's status lifecycle is:
 *   claimed → submitted_to_supplier → fulfilled
 *                ↘ failed → (cancellable via cancel_market_claim_and_refund)
 *
 * Failures here never roll back the ledger — the EP debit already happened
 * inside claim_market_product_atomic. If Shopify rejects the order, the
 * claim row is marked 'failed' and platform staff decide: retry or refund.
 */

const SHOPIFY_API_VERSION = "2024-10";
const SHOPIFY_API_TIMEOUT_MS = 15_000;

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

function getShopDomain(): string | null {
  const domain = process.env.SHOPIFY_SUPPLIER_SHOP_DOMAIN?.trim();
  return domain && domain.length > 0 ? domain : null;
}

function getAdminToken(): string | null {
  const token = process.env.SHOPIFY_SUPPLIER_ADMIN_TOKEN?.trim();
  return token && token.length > 0 ? token : null;
}

function isLiveIntegrationConfigured(): boolean {
  return Boolean(getShopDomain() && getAdminToken());
}

/**
 * Split a single full name into first / last for Shopify's address shape.
 * Shopify accepts "first_name" only, but the admin UX reads better with
 * both, so we do a simple whitespace split (last word = last name). If
 * the name is single-token, last_name stays empty.
 */
function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

/**
 * Map our internal shipping address shape to Shopify's.
 */
function toShopifyAddress(
  name: string,
  phone: string | null,
  a: ShopifyShippingAddress
): Record<string, unknown> {
  const { first, last } = splitName(name);
  return {
    first_name: first,
    last_name: last,
    address1: a.line1,
    address2: a.line2 ?? undefined,
    city: a.city,
    province: a.region ?? undefined,
    zip: a.postcode,
    country: a.country,
    phone: phone ?? undefined,
  };
}

/**
 * Submit a redeemed claim to the supplier Shopify. In stub mode, logs the
 * payload and returns a deterministic fake order id. In live mode, POSTs
 * to the Shopify Admin Orders endpoint and returns the real order info.
 *
 * The submitted order is marked `financial_status: 'paid'` — we already
 * settled with the rep in EP, and we don't want Shopify chasing the
 * customer for payment.
 *
 * Tagged `entry-market` so the supplier can filter Entry-originated
 * orders in their Shopify admin. Also writes `entry_claim_id` as a
 * note_attribute so a Shopify order can be traced back to this claim.
 */
export async function submitShopifyOrder(
  input: SubmitShopifyOrderInput
): Promise<SubmitShopifyOrderResult> {
  if (!isLiveIntegrationConfigured()) {
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

  const shop = getShopDomain()!;
  const token = getAdminToken()!;

  if (!input.product.external_variant_id) {
    throw new Error(
      `Product ${input.product.id} is missing external_variant_id — cannot create Shopify order`
    );
  }

  const addressObj = toShopifyAddress(
    input.shipping.name,
    input.shipping.phone,
    input.shipping.address
  );

  const payload = {
    order: {
      email: input.shipping.email,
      phone: input.shipping.phone ?? undefined,
      financial_status: "paid",
      // Inventory we already decremented on our side; don't have Shopify
      // touch its own inventory here (otherwise we'd double-decrement).
      inventory_behaviour: "bypass",
      // Mark as processed so it doesn't sit as an unfulfilled "pending"
      // order until someone manually captures payment.
      send_receipt: false,
      send_fulfillment_receipt: false,
      line_items: [
        {
          variant_id: Number(input.product.external_variant_id),
          quantity: 1,
          price: "0.00",             // rep paid in EP, not £
          requires_shipping: true,
        },
      ],
      shipping_address: addressObj,
      billing_address: addressObj,
      customer: {
        email: input.shipping.email,
        first_name: addressObj.first_name,
        last_name: addressObj.last_name,
        phone: input.shipping.phone ?? undefined,
      },
      tags: "entry-market",
      note: `Entry Market redemption — EP price: ${input.product.ep_price}`,
      note_attributes: [
        { name: "entry_claim_id", value: input.claim_id },
        { name: "entry_product_id", value: input.product.id },
        { name: "entry_ep_price", value: String(input.product.ep_price) },
      ],
    },
  };

  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/orders.json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHOPIFY_API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Shopify request failed: ${msg}`);
  }
  clearTimeout(timeout);

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Shopify ${response.status} ${response.statusText}: ${bodyText.slice(0, 500)}`
    );
  }

  let parsed: { order?: { id?: number; name?: string; order_status_url?: string } };
  try {
    parsed = JSON.parse(bodyText) as typeof parsed;
  } catch {
    throw new Error(`Shopify returned non-JSON body: ${bodyText.slice(0, 200)}`);
  }

  const order = parsed.order ?? {};
  if (!order.id) {
    throw new Error("Shopify response missing order.id");
  }

  return {
    stub: false,
    external_order_id: String(order.id),
    external_order_number: order.name ?? null,
    external_order_url: order.order_status_url ?? null,
  };
}

/**
 * Cancel a Shopify order by external_order_id. Used when the rep cancels
 * via cancel_market_claim_and_refund AND the claim had a successful
 * Shopify submission (i.e. we need to call off the shipment too).
 *
 * Silently returns in stub mode. In live mode, marks the order cancelled
 * with refund=false (we handle the EP refund on our side, not at
 * Shopify).
 */
export async function cancelShopifyOrder(externalOrderId: string): Promise<void> {
  if (!isLiveIntegrationConfigured()) return;
  if (externalOrderId.startsWith("STUB-")) return;

  const shop = getShopDomain()!;
  const token = getAdminToken()!;
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/orders/${externalOrderId}/cancel.json`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHOPIFY_API_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        reason: "other",
        email: false,
        refund: false,
        restock: true,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Shopify cancel ${response.status}: ${text.slice(0, 300)}`
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * True when the configured Shopify store is responsive. Used by the
 * products GET endpoint + platform admin dashboards.
 */
export async function isSupplierHealthy(): Promise<boolean> {
  if (!isLiveIntegrationConfigured()) return true;
  const shop = getShopDomain()!;
  const token = getAdminToken()!;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/shop.json`,
      {
        headers: { "X-Shopify-Access-Token": token },
        signal: controller.signal,
      }
    );
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function getIntegrationStatus(): { mode: "stub" | "live"; reason?: string } {
  return isLiveIntegrationConfigured()
    ? { mode: "live" }
    : { mode: "stub", reason: "SHOPIFY_SUPPLIER_* env vars unset" };
}
