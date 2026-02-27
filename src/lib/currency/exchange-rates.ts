/**
 * Exchange rate fetching, caching, and conversion.
 *
 * Rates are stored as USD-based (1 USD = X target currency).
 * Conversion between any two supported currencies goes through USD as the pivot.
 *
 * Cache layers:
 *   1. Module-level in-memory cache (1h TTL) — fastest, per-instance
 *   2. Supabase site_settings row "platform_exchange_rates" — shared, persistent
 *   3. External API fetch — fallback when cache is stale (>48h)
 *
 * If all layers fail, conversion is disabled (callers show base currency).
 */

import type { ExchangeRates } from "./types";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h in-memory
const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48h max age for DB cache
const RATE_LOCK_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h max for checkout

/** Module-level cache */
let memoryCache: { rates: ExchangeRates; expiry: number } | null = null;

/**
 * Fetch fresh exchange rates from the external API and store in DB.
 * Called by the cron job every 6h.
 */
export async function refreshExchangeRates(): Promise<ExchangeRates | null> {
  try {
    const apiKey = process.env.EXCHANGE_RATE_API_KEY;

    // exchangerate-api.com free tier (no key needed) or Open Exchange Rates
    let url: string;
    let parseResponse: (data: unknown) => Record<string, number>;

    if (apiKey) {
      // Open Exchange Rates (free tier: 1000 req/mo)
      url = `https://openexchangerates.org/api/latest.json?app_id=${apiKey}`;
      parseResponse = (data) => {
        const d = data as { rates?: Record<string, number> };
        return d.rates || {};
      };
    } else {
      // exchangerate-api.com free tier (no key required)
      url = "https://open.er-api.com/v6/latest/USD";
      parseResponse = (data) => {
        const d = data as { rates?: Record<string, number> };
        return d.rates || {};
      };
    }

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`[exchange-rates] API returned ${res.status}`);
      return null;
    }

    const json = await res.json();
    const allRates = parseResponse(json);

    // Filter to our supported currencies only
    const SUPPORTED = ["GBP", "EUR", "USD", "CAD", "AUD", "CHF", "SEK", "NOK", "DKK"];
    const rates: Record<string, number> = {};
    for (const code of SUPPORTED) {
      if (allRates[code] != null) {
        rates[code] = allRates[code];
      }
    }
    // USD is always 1
    rates.USD = 1;

    const exchangeRates: ExchangeRates = {
      base: "USD",
      rates,
      fetched_at: new Date().toISOString(),
    };

    // Store in DB
    await storeRatesInDB(exchangeRates);

    // Update memory cache
    memoryCache = { rates: exchangeRates, expiry: Date.now() + CACHE_TTL_MS };

    return exchangeRates;
  } catch (err) {
    console.error("[exchange-rates] Failed to refresh:", err);
    return null;
  }
}

/**
 * Get exchange rates (cached). Returns null if unavailable.
 */
export async function getExchangeRates(): Promise<ExchangeRates | null> {
  // 1. Check memory cache
  if (memoryCache && Date.now() < memoryCache.expiry) {
    return memoryCache.rates;
  }

  // 2. Check DB cache
  try {
    const rates = await loadRatesFromDB();
    if (rates) {
      const age = Date.now() - new Date(rates.fetched_at).getTime();
      if (age < STALE_THRESHOLD_MS) {
        memoryCache = { rates, expiry: Date.now() + CACHE_TTL_MS };
        return rates;
      }
    }
  } catch {
    // DB unavailable — fall through
  }

  // 3. All caches miss — return null (callers disable conversion)
  return null;
}

/**
 * Convert an amount from one currency to another using USD as pivot.
 * Returns the converted amount (not rounded).
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRates
): number {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  if (from === to) return amount;

  const fromRate = rates.rates[from];
  const toRate = rates.rates[to];

  if (!fromRate || !toRate) {
    // Unknown currency — return original amount
    return amount;
  }

  // Convert: from → USD → to
  const usdAmount = amount / fromRate;
  return usdAmount * toRate;
}

/**
 * Round a converted price to the nearest whole number.
 * Converted prices show whole numbers to avoid false precision.
 * Base-currency prices keep their original decimals.
 */
export function roundPresentmentPrice(amount: number): number {
  return Math.round(amount);
}

/**
 * Check if exchange rates are fresh enough for checkout (< 24h old).
 */
export function areRatesFreshForCheckout(rates: ExchangeRates): boolean {
  const age = Date.now() - new Date(rates.fetched_at).getTime();
  return age < RATE_LOCK_MAX_AGE_MS;
}

// ── DB persistence ────────────────────────────────────────────────

const SETTINGS_KEY = "platform_exchange_rates";

async function storeRatesInDB(rates: ExchangeRates): Promise<void> {
  // Dynamic import to avoid circular deps at module load time
  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const supabase = await getSupabaseAdmin();
  if (!supabase) return;

  await supabase
    .from("site_settings")
    .upsert(
      { key: SETTINGS_KEY, data: rates, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
}

async function loadRatesFromDB(): Promise<ExchangeRates | null> {
  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const supabase = await getSupabaseAdmin();
  if (!supabase) return null;

  const { data } = await supabase
    .from("site_settings")
    .select("data")
    .eq("key", SETTINGS_KEY)
    .single();

  if (!data?.data) return null;
  return data.data as ExchangeRates;
}
