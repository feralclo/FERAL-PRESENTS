import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { epBillingKey } from "@/lib/constants";
import type Stripe from "stripe";

/**
 * Tenant EP-billing helpers — lives on TOP of Stripe, so tenants don't
 * re-enter their card every time they top up.
 *
 * Data shape stored in site_settings under epBillingKey(orgId):
 *   {
 *     customer_id: "cus_xxx",
 *     payment_method_id: "pm_xxx" | null,
 *     card: { brand, last4, exp_month, exp_year } | null
 *   }
 *
 * customer_id sticks forever (so we don't create duplicates). payment_method_id
 * + card are cleared when the tenant removes their saved card.
 */

export interface EpBillingRecord {
  customer_id: string;
  payment_method_id: string | null;
  card: SavedCard | null;
}

export interface SavedCard {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
}

async function readBillingSettings(orgId: string): Promise<EpBillingRecord | null> {
  const db = await getSupabaseAdmin();
  if (!db) return null;
  const { data } = await db
    .from("site_settings")
    .select("value")
    .eq("key", epBillingKey(orgId))
    .maybeSingle();
  const record = (data?.value ?? null) as EpBillingRecord | null;
  return record ?? null;
}

async function writeBillingSettings(
  orgId: string,
  record: EpBillingRecord
): Promise<void> {
  const db = await getSupabaseAdmin();
  if (!db) return;
  await db
    .from("site_settings")
    .upsert(
      { key: epBillingKey(orgId), value: record },
      { onConflict: "key" }
    );
}

/**
 * Returns the tenant's Stripe Customer ID for EP billing. Creates one on
 * first call and persists it so future calls are cheap. We never delete
 * the Customer — detaching a saved card clears payment_method_id but the
 * Customer stays so the next card-save doesn't create a duplicate.
 */
export async function getOrCreateEpCustomer(
  orgId: string,
  email: string | null | undefined
): Promise<string> {
  const existing = await readBillingSettings(orgId);
  if (existing?.customer_id) return existing.customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    description: `Entry EP billing for ${orgId}`,
    metadata: { tenant_org_id: orgId, purpose: "ep_billing" },
  });

  await writeBillingSettings(orgId, {
    customer_id: customer.id,
    payment_method_id: null,
    card: null,
  });
  return customer.id;
}

/**
 * Returns the saved card public details for the admin UI. Never returns the
 * raw PaymentMethod ID to the client — the card object is display-only.
 */
export async function getSavedCard(orgId: string): Promise<SavedCard | null> {
  const record = await readBillingSettings(orgId);
  return record?.card ?? null;
}

export async function getEpBillingRecord(
  orgId: string
): Promise<EpBillingRecord | null> {
  return readBillingSettings(orgId);
}

/**
 * Reads a PaymentMethod from Stripe, pulls the card details, and stores
 * them against the tenant's billing settings. Call after a SetupIntent
 * succeeds or after a PaymentIntent with setup_future_usage captures a card.
 *
 * Returns the SavedCard shape so the caller can return it to the client.
 */
export async function savePaymentMethodForTenant(
  orgId: string,
  paymentMethodId: string
): Promise<SavedCard | null> {
  const stripe = getStripe();
  const record = (await readBillingSettings(orgId)) ?? null;
  if (!record?.customer_id) {
    // Shouldn't happen — Customer should have been created before the
    // SetupIntent. Fail quietly; caller can re-initiate.
    return null;
  }

  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  if (pm.type !== "card" || !pm.card) return null;

  // If the PM isn't attached to our Customer yet, attach it. Stripe attaches
  // automatically when a SetupIntent completes, but PaymentIntents with
  // setup_future_usage may leave them detached until confirmation.
  if (pm.customer !== record.customer_id) {
    try {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: record.customer_id,
      });
    } catch {
      // If it's already attached to this customer Stripe throws; retrieve
      // again to confirm state before giving up.
      const reloaded = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (reloaded.customer !== record.customer_id) return null;
    }
  }

  const card: SavedCard = {
    brand: pm.card.brand,
    last4: pm.card.last4,
    exp_month: pm.card.exp_month,
    exp_year: pm.card.exp_year,
  };

  // Also set as the Customer's default so off-session confirmations find it
  await stripe.customers.update(record.customer_id, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  await writeBillingSettings(orgId, {
    customer_id: record.customer_id,
    payment_method_id: paymentMethodId,
    card,
  });

  return card;
}

/**
 * Detaches the saved PaymentMethod from the Stripe Customer and clears it
 * from tenant settings. The Customer itself stays so a future save doesn't
 * create a duplicate.
 */
export async function detachSavedCard(orgId: string): Promise<void> {
  const record = await readBillingSettings(orgId);
  if (!record) return;
  if (record.payment_method_id) {
    const stripe = getStripe();
    try {
      await stripe.paymentMethods.detach(record.payment_method_id);
    } catch {
      // PM may have been detached out of band; ignore
    }
  }
  await writeBillingSettings(orgId, {
    customer_id: record.customer_id,
    payment_method_id: null,
    card: null,
  });
}

/**
 * Pulls the PaymentMethod ID off a confirmed SetupIntent and saves it.
 * Used by the /payment-method/confirm endpoint after Stripe Elements
 * completes the SetupIntent flow on the client.
 */
export async function savePaymentMethodFromSetupIntent(
  orgId: string,
  setupIntentId: string
): Promise<SavedCard | null> {
  const stripe = getStripe();
  const si = await stripe.setupIntents.retrieve(setupIntentId);
  if (si.status !== "succeeded") return null;
  const pmId =
    typeof si.payment_method === "string"
      ? si.payment_method
      : (si.payment_method as Stripe.PaymentMethod | null)?.id;
  if (!pmId) return null;
  return savePaymentMethodForTenant(orgId, pmId);
}

/**
 * Same idea for a PaymentIntent — used when the first Buy EP completes with
 * setup_future_usage="off_session" so we can auto-save the card the tenant
 * just entered without requiring a separate "save card" step.
 */
export async function savePaymentMethodFromPaymentIntent(
  orgId: string,
  paymentIntentId: string
): Promise<SavedCard | null> {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.status !== "succeeded") return null;
  const pmId =
    typeof pi.payment_method === "string"
      ? pi.payment_method
      : (pi.payment_method as Stripe.PaymentMethod | null)?.id;
  if (!pmId) return null;
  return savePaymentMethodForTenant(orgId, pmId);
}
