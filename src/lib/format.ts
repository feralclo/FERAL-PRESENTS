/**
 * Shared formatting utilities.
 */

import { getCurrencySymbol, isZeroDecimalCurrency } from "@/lib/stripe/config";

/**
 * Format a monetary amount for display (e.g. "£26.50", "$100.00", "¥1,000").
 * Shows 2 decimal places for standard currencies, 0 for zero-decimal (JPY etc).
 */
export function fmtMoney(amount: number, currency: string = "GBP"): string {
  const symbol = getCurrencySymbol(currency);
  const decimals = isZeroDecimalCurrency(currency) ? 0 : 2;
  return `${symbol}${Number(amount).toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
