/**
 * Pure currency conversion functions — safe for client components.
 * No server-side imports (Supabase, next/headers, etc.)
 */

import type { ExchangeRates } from "./types";

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
  const RATE_LOCK_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
  const age = Date.now() - new Date(rates.fetched_at).getTime();
  return age < RATE_LOCK_MAX_AGE_MS;
}
