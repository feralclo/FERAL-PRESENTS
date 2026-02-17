/**
 * Stripe Connect configuration.
 *
 * Platform fee structure:
 * - application_fee_percent: percentage of each transaction taken as platform fee
 * - This is configurable per-event in the admin, but defaults to the value below
 *
 * Architecture:
 * - Direct charges: payment is created on the connected account
 * - Platform takes application_fee_amount on each charge
 * - Connected account is the merchant of record
 * - Buyer's bank statement shows the promoter's business name
 *
 * Account types supported:
 * - "custom": Fully white-labeled, promoter never sees Stripe (default)
 * - "express": Stripe-hosted onboarding, some Stripe branding (future option)
 * - "standard": Promoter has their own Stripe dashboard (future option)
 */

/** Default platform fee as a percentage (e.g., 5 = 5%) */
export const DEFAULT_PLATFORM_FEE_PERCENT = 5;

/** Minimum platform fee in the smallest currency unit (e.g., 50 = £0.50) */
export const MIN_PLATFORM_FEE = 50;

/** Supported currencies */
export const SUPPORTED_CURRENCIES = ["gbp", "eur", "usd"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Default connected account type */
export const DEFAULT_ACCOUNT_TYPE = "custom" as const;

/**
 * Calculate the application fee for a given amount.
 * Amount and return value are in smallest currency unit (pence/cents).
 */
export function calculateApplicationFee(
  amountInSmallestUnit: number,
  feePercent: number = DEFAULT_PLATFORM_FEE_PERCENT
): number {
  const fee = Math.round(amountInSmallestUnit * (feePercent / 100));
  return Math.max(fee, MIN_PLATFORM_FEE);
}

/**
 * Convert a display price (e.g., 26.50) to smallest currency unit (e.g., 2650).
 */
export function toSmallestUnit(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Convert smallest currency unit (e.g., 2650) to display price (e.g., 26.50).
 */
export function fromSmallestUnit(amount: number): number {
  return amount / 100;
}

/**
 * Get the currency symbol for display.
 */
export function getCurrencySymbol(currency: string): string {
  switch (currency.toLowerCase()) {
    case "gbp":
      return "£";
    case "eur":
      return "€";
    case "usd":
      return "$";
    default:
      return currency.toUpperCase();
  }
}

/**
 * Format a price for display (e.g., "26" or "26.50").
 * Drops decimal places when the price is a whole number.
 */
export function formatPrice(price: number, currency?: string): string {
  const symbol = currency ? getCurrencySymbol(currency) : "";
  const display = price % 1 === 0 ? String(price) : price.toFixed(2);
  return `${symbol}${display}`;
}
