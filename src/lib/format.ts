/**
 * Shared formatting utilities.
 */

import { getCurrencySymbol } from "@/lib/stripe/config";

/**
 * Format a monetary amount for display (e.g. "£26.50", "$100.00", "€15.00").
 * Always shows 2 decimal places for consistency in admin/order contexts.
 */
export function fmtMoney(amount: number, currency: string = "GBP"): string {
  const symbol = getCurrencySymbol(currency);
  return `${symbol}${Number(amount).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
