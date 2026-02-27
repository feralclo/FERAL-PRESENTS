"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getCurrencySymbol, formatPriceIntl } from "@/lib/stripe/config";
import {
  convertCurrency,
  roundPresentmentPrice,
} from "@/lib/currency/conversion";
import type { ExchangeRates } from "@/lib/currency/types";

const LOCAL_STORAGE_KEY = "entry_currency_pref";

/**
 * Read a cookie by name (client-side).
 */
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, maxAge: number): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
}

export interface UseCurrencyResult {
  /** Active presentment currency (uppercase) */
  currency: string;
  /** Event's base currency (uppercase) */
  baseCurrency: string;
  /** True if showing converted prices (currency !== baseCurrency) */
  isConverted: boolean;
  /** Switch presentment currency */
  setCurrency: (c: string) => void;
  /** Convert a base-currency price to presentment currency (rounds if converted).
   *  When `overrides` contains the current currency, uses that exact price instead. */
  convertPrice: (basePrice: number, overrides?: Record<string, number> | null) => number;
  /** Format a price with the presentment currency symbol */
  formatPrice: (amount: number) => string;
  /** Current exchange rate (1 base = rate * presentment) */
  exchangeRate: number;
  /** Whether exchange rates have loaded */
  ratesLoaded: boolean;
}

/**
 * Hook for multi-currency price display.
 *
 * Priority for initial currency:
 *   1. localStorage "entry_currency_pref" (user explicitly chose)
 *   2. "buyer_currency" cookie (geo-detected by middleware)
 *   3. baseCurrency (event's default)
 *
 * Fetches exchange rates from /api/currency/rates on mount.
 * When currency === baseCurrency, convertPrice is identity (no rounding).
 *
 * @param enabled - When false, skips rate fetching and geo-detection.
 *   All functions return base currency values unchanged (feature flag off).
 */
export function useCurrency(baseCurrency: string, enabled: boolean = true): UseCurrencyResult {
  const base = baseCurrency.toUpperCase();

  // Resolve initial currency (only read geo-detection when enabled)
  const [currency, setCurrencyState] = useState<string>(() => {
    if (!enabled) return base;
    if (typeof window === "undefined") return base;
    try {
      const pref = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (pref) return pref.toUpperCase();
    } catch { /* ignore */ }
    const cookie = getCookie("buyer_currency");
    if (cookie) return cookie.toUpperCase();
    return base;
  });

  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [ratesLoaded, setRatesLoaded] = useState(false);

  // Fetch rates on mount (skip when feature flag is off)
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function fetchRates() {
      try {
        const res = await fetch("/api/currency/rates");
        if (!res.ok) {
          setRatesLoaded(true);
          return;
        }
        const data: ExchangeRates = await res.json();
        if (!cancelled) {
          setRates(data);
          setRatesLoaded(true);
        }
      } catch {
        if (!cancelled) setRatesLoaded(true);
      }
    }

    fetchRates();
    return () => { cancelled = true; };
  }, [enabled]);

  const setCurrency = useCallback((c: string) => {
    const upper = c.toUpperCase();
    setCurrencyState(upper);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, upper);
    } catch { /* ignore */ }
    // Update cookie so middleware doesn't override on next navigation
    setCookie("buyer_currency", upper, 86400 * 30);
  }, []);

  const exchangeRate = useMemo(() => {
    if (!rates || currency === base) return 1;
    const fromRate = rates.rates[base];
    const toRate = rates.rates[currency];
    if (!fromRate || !toRate) return 1;
    return toRate / fromRate;
  }, [rates, currency, base]);

  const isConverted = currency !== base && rates !== null && exchangeRate !== 1;

  const convertPrice = useCallback(
    (basePrice: number, overrides?: Record<string, number> | null): number => {
      // Manual override takes priority — already in target currency
      if (overrides && currency in overrides) {
        return overrides[currency];
      }
      if (!isConverted || !rates) return basePrice;
      const converted = convertCurrency(basePrice, base, currency, rates);
      return roundPresentmentPrice(converted);
    },
    [isConverted, rates, base, currency]
  );

  const formatPrice = useCallback(
    (amount: number): string => {
      // For converted prices (whole numbers), use simple format
      if (isConverted) {
        return formatPriceIntl(amount, currency);
      }
      // For base currency, use original format (preserves decimals)
      const symbol = getCurrencySymbol(currency);
      return amount % 1 === 0
        ? `${symbol}${amount}`
        : `${symbol}${amount.toFixed(2)}`;
    },
    [currency, isConverted]
  );

  return {
    currency,
    baseCurrency: base,
    isConverted,
    setCurrency,
    convertPrice,
    formatPrice,
    exchangeRate,
    ratesLoaded,
  };
}
