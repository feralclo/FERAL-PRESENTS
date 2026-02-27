"use client";

import { createContext, useContext } from "react";
import { useCurrency, type UseCurrencyResult } from "@/hooks/useCurrency";
import { getCurrencySymbol } from "@/lib/stripe/config";

const CurrencyContext = createContext<UseCurrencyResult | null>(null);

/**
 * Provides multi-currency context to event page components.
 * Wraps useCurrency hook and makes it available via useCurrencyContext().
 *
 * When `enabled` is false (feature flag off), the hook skips rate fetching
 * and geo-detection — all prices display in baseCurrency unchanged.
 */
export function CurrencyProvider({
  baseCurrency,
  enabled = true,
  children,
}: {
  baseCurrency: string;
  enabled?: boolean;
  children: React.ReactNode;
}) {
  const currencyState = useCurrency(baseCurrency, enabled);

  return (
    <CurrencyContext.Provider value={currencyState}>
      {children}
    </CurrencyContext.Provider>
  );
}

/**
 * Access multi-currency conversion functions.
 * Must be used within a CurrencyProvider.
 *
 * Returns null-safe fallback when called outside a provider
 * (e.g., admin pages, non-event contexts).
 */
export function useCurrencyContext(): UseCurrencyResult {
  const ctx = useContext(CurrencyContext);
  if (ctx) return ctx;

  // Fallback: no provider, return GBP identity context
  return {
    currency: "GBP",
    baseCurrency: "GBP",
    isConverted: false,
    setCurrency: () => {},
    convertPrice: (p) => p,
    formatPrice: (a) => {
      const symbol = getCurrencySymbol("GBP");
      return a % 1 === 0 ? `${symbol}${a}` : `${symbol}${a.toFixed(2)}`;
    },
    exchangeRate: 1,
    ratesLoaded: false,
  };
}
