import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_ACCOUNT_TYPE } from "@/lib/stripe/config";
import { requireAuth } from "@/lib/auth";
import { TABLES, stripeAccountKey, generalKey } from "@/lib/constants";
import { getDefaultCurrency } from "@/lib/country-currency-map";
import { isOAuthConfigured } from "@/lib/stripe/oauth";
import * as Sentry from "@sentry/nextjs";

// CRITICAL: this route returns the tenant's connected-Stripe account info,
// scoped by auth.orgId. Without these the Vercel Data Cache will key the
// JSON response by URL alone and serve one tenant's account data to every
// other admin who hits the same URL. See commits 9da97ba / e54e284.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, must-revalidate",
} as const;

function noStoreJson(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: { ...(init?.headers || {}), ...NO_STORE_HEADERS },
  });
}

/**
 * POST /api/stripe/connect/my-account — Create a Stripe Connect account for the tenant.
 *
 * Uses requireAuth() so any admin can set up payments for their own org.
 * Scoped to auth.orgId — a tenant can only create one account per org.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const stripe = getStripe();
    const db = await getSupabaseAdmin();
    if (!db) {
      return noStoreJson(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Check if this org already has a connected account
    const { data: existing } = await db
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", stripeAccountKey(auth.orgId))
      .single();

    if (existing?.data?.account_id) {
      // Verify the existing account is still accessible
      try {
        const acc = await stripe.accounts.retrieve(existing.data.account_id);
        return noStoreJson({
          account_id: acc.id,
          account_type: existing.data.account_type || "custom",
          already_exists: true,
          charges_enabled: acc.charges_enabled,
          payouts_enabled: acc.payouts_enabled,
          details_submitted: acc.details_submitted,
        });
      } catch {
        // Account no longer accessible — allow creating a new one
      }
    }

    const body = await request.json();
    const {
      email,
      business_name,
      country = "GB",
      account_type = DEFAULT_ACCOUNT_TYPE,
      business_type = "individual",
      // Pre-fill fields (all optional). Drop into Stripe's individual.* / company.*
      // shape based on business_type so the hosted Account Link starts pre-populated.
      first_name,
      last_name,
      phone,
      address,
    } = body as {
      email?: string;
      business_name?: string;
      country?: string;
      account_type?: string;
      business_type?: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
      address?: {
        line1?: string;
        line2?: string;
        city?: string;
        state?: string;
        postal_code?: string;
      };
    };

    if (!email) {
      return noStoreJson(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (account_type !== "custom") {
      return noStoreJson(
        { error: "Only custom accounts are supported" },
        { status: 400 }
      );
    }

    const validBusinessTypes = ["individual", "company", "non_profit"] as const;
    type BusinessType = (typeof validBusinessTypes)[number];
    if (!validBusinessTypes.includes(business_type as BusinessType)) {
      return noStoreJson(
        { error: "Invalid business type" },
        { status: 400 }
      );
    }

    // Resolve the tenant's domain for the business profile URL.
    //
    // Order of preference:
    //   1. Custom primary domain (acmetickets.com)        ← if set up
    //   2. Their entry.events subdomain (acme.entry.events) ← always works
    //   3. Platform URL (entry.events)                      ← test orgs only
    //
    // We CAN'T fall back to the platform URL for real tenants — Stripe uses
    // business_profile.url for fraud screening and may crawl it. A generic
    // marketing site is a yellow flag in their algorithm; their own subdomain
    // (which renders their actual event listings) is much cleaner.
    const { data: domainRow } = await db
      .from(TABLES.DOMAINS)
      .select("hostname")
      .eq("org_id", auth.orgId)
      .eq("status", "active")
      .eq("is_primary", true)
      .single();

    const platformHost = (process.env.NEXT_PUBLIC_SITE_URL || "https://entry.events")
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");

    const businessUrl = domainRow?.hostname
      ? `https://${domainRow.hostname}`
      : auth.orgId.startsWith("__")
        ? `https://${platformHost}` // Test/fixture orgs — no real subdomain
        : `https://${auth.orgId}.${platformHost}`;

    // Build optional Stripe address payload. Only include fields we have.
    const stripeAddress = address
      ? {
          ...(address.line1 ? { line1: address.line1 } : {}),
          ...(address.line2 ? { line2: address.line2 } : {}),
          ...(address.city ? { city: address.city } : {}),
          ...(address.state ? { state: address.state } : {}),
          ...(address.postal_code ? { postal_code: address.postal_code } : {}),
          country,
        }
      : undefined;

    // For Individual accounts, populate `individual.*`. For Company / Non-profit,
    // the same person becomes the representative — Stripe still wants their KYC.
    type IndividualPrefill = {
      first_name?: string;
      last_name?: string;
      email?: string;
      phone?: string;
      address?: typeof stripeAddress;
    };
    const individualPrefill: IndividualPrefill = {
      ...(first_name ? { first_name } : {}),
      ...(last_name ? { last_name } : {}),
      email,
      ...(phone ? { phone } : {}),
      ...(stripeAddress && Object.keys(stripeAddress).length > 1 ? { address: stripeAddress } : {}),
    };
    const hasIndividualPrefill = Object.keys(individualPrefill).length > 1; // > email alone

    // For company/non-profit, also pre-fill `company.*` (name, phone, address).
    type CompanyPrefill = {
      name?: string;
      phone?: string;
      address?: typeof stripeAddress;
    };
    const companyPrefill: CompanyPrefill = {
      ...(business_name ? { name: business_name } : {}),
      ...(phone ? { phone } : {}),
      ...(stripeAddress && Object.keys(stripeAddress).length > 1 ? { address: stripeAddress } : {}),
    };
    const hasCompanyPrefill = Object.keys(companyPrefill).length > 0;

    const account = await stripe.accounts.create({
      type: "custom",
      country,
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: business_type as BusinessType,
      business_profile: {
        name: business_name || undefined,
        mcc: "7922", // Theatrical Producers and Ticket Agencies
        url: businessUrl,
      },
      // For individual accounts, pre-fill the person record.
      // For company / non-profit, the same person is treated as the representative
      // by Stripe's hosted onboarding — they still need to identify themselves.
      ...(hasIndividualPrefill ? { individual: individualPrefill } : {}),
      ...(business_type !== "individual" && hasCompanyPrefill
        ? { company: companyPrefill }
        : {}),
      settings: {
        payouts: {
          schedule: {
            interval: "daily",
          },
        },
      },
    });

    // Save to site_settings so payment-intent route auto-detects it
    await db.from(TABLES.SITE_SETTINGS).upsert(
      {
        key: stripeAccountKey(auth.orgId),
        data: {
          account_id: account.id,
          account_type: "custom",
          country,
          connected_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    // Sync country + base_currency to org general settings
    await syncGeneralSettings(db, auth.orgId, country);

    return noStoreJson({
      account_id: account.id,
      account_type: "custom",
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[my-account] Stripe Connect creation error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to create account";
    return noStoreJson({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/stripe/connect/my-account — Get the tenant's own account status.
 *
 * Reads the account_id from site_settings scoped to auth.orgId,
 * then fetches the full account details from Stripe.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const stripe = getStripe();
    const db = await getSupabaseAdmin();
    if (!db) {
      return noStoreJson(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Read account_id from site_settings for this org
    const { data: setting } = await db
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", stripeAccountKey(auth.orgId))
      .single();

    const accountId = setting?.data?.account_id;
    if (!accountId) {
      return noStoreJson({
        connected: false,
        oauth_available: isOAuthConfigured(),
      });
    }

    // Retrieve the full account from Stripe
    try {
      const account = await stripe.accounts.retrieve(accountId);

      // Lazy backfill: if stored settings don't have country, save it + sync general
      const storedCountry = setting?.data?.country;
      if (!storedCountry && account.country) {
        await db.from(TABLES.SITE_SETTINGS).upsert(
          {
            key: stripeAccountKey(auth.orgId),
            data: { ...setting.data, country: account.country },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
        await syncGeneralSettings(db, auth.orgId, account.country);
      }

      const accountType =
        setting?.data?.account_type ||
        (account.type === "standard" ? "standard" : "custom");

      const payoutSchedule = account.settings?.payouts?.schedule;
      const livemode = !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_");

      return noStoreJson({
        connected: true,
        account_id: account.id,
        account_type: accountType,
        email: account.email,
        business_name: account.business_profile?.name || null,
        business_type: account.business_type || null,
        country: account.country,
        default_currency: account.default_currency || null,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        livemode,
        payout_schedule: payoutSchedule
          ? {
              interval: payoutSchedule.interval,
              delay_days: payoutSchedule.delay_days,
              weekly_anchor: payoutSchedule.weekly_anchor || null,
              monthly_anchor: payoutSchedule.monthly_anchor || null,
            }
          : null,
        requirements: {
          currently_due: account.requirements?.currently_due || [],
          eventually_due: account.requirements?.eventually_due || [],
          past_due: account.requirements?.past_due || [],
          disabled_reason: account.requirements?.disabled_reason || null,
        },
        capabilities: {
          card_payments: account.capabilities?.card_payments || "inactive",
          transfers: account.capabilities?.transfers || "inactive",
        },
      });
    } catch {
      // Account no longer accessible — clear the stored reference
      return noStoreJson({
        connected: false,
        stale_account: true,
        oauth_available: isOAuthConfigured(),
      });
    }
  } catch (err) {
    Sentry.captureException(err);
    console.error("[my-account] Stripe Connect status error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to check account status";
    return noStoreJson({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/stripe/connect/my-account — Unlink the tenant's connected account.
 *
 * For Standard accounts, also deauthorizes the OAuth grant so the platform
 * loses permission to charge on the user's existing Stripe (clean revoke).
 * For Custom accounts, the linked account remains in the platform's Connect
 * directory; this just removes the per-org pointer so a fresh setup can begin.
 */
export async function DELETE() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const db = await getSupabaseAdmin();
    if (!db) {
      return noStoreJson({ error: "Service unavailable" }, { status: 503 });
    }

    const { data: setting } = await db
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", stripeAccountKey(auth.orgId))
      .single();

    const accountId: string | undefined = setting?.data?.account_id;
    const accountType: string = setting?.data?.account_type || "custom";

    if (accountId && accountType === "standard" && process.env.STRIPE_CONNECT_CLIENT_ID) {
      try {
        const stripe = getStripe();
        await stripe.oauth.deauthorize({
          client_id: process.env.STRIPE_CONNECT_CLIENT_ID,
          stripe_user_id: accountId,
        });
      } catch (err) {
        // Already deauthorized or revoked from Stripe's side — log and continue
        console.warn("[my-account DELETE] deauthorize failed (continuing):", err);
      }
    }

    await db
      .from(TABLES.SITE_SETTINGS)
      .delete()
      .eq("key", stripeAccountKey(auth.orgId));

    return noStoreJson({ disconnected: true });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[my-account DELETE] error:", err);
    const message = err instanceof Error ? err.message : "Failed to disconnect";
    return noStoreJson({ error: message }, { status: 500 });
  }
}

/**
 * Sync country + derived base_currency to the org's general settings.
 * Merges with existing settings so other fields (org_name, timezone, etc.) are preserved.
 */
async function syncGeneralSettings(
  db: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  orgId: string,
  country: string
) {
  if (!db) return;
  const key = generalKey(orgId);
  const { data: existing } = await db
    .from(TABLES.SITE_SETTINGS)
    .select("data")
    .eq("key", key)
    .single();

  const merged = {
    ...(existing?.data || {}),
    country,
    base_currency: getDefaultCurrency(country),
  };

  await db.from(TABLES.SITE_SETTINGS).upsert(
    { key, data: merged, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
}
