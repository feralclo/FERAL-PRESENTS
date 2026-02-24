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
  feePercent: number = DEFAULT_PLATFORM_FEE_PERCENT,
  minFee: number = MIN_PLATFORM_FEE
): number {
  const fee = Math.round(amountInSmallestUnit * (feePercent / 100));
  return Math.max(fee, minFee);
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

/**
 * Map Stripe error codes / decline codes to user-friendly messages.
 * Stripe's default `error.message` is often just "Your card has been declined"
 * — this gives buyers actionable feedback so they can fix the issue.
 */
export function getPaymentErrorMessage(error: { message?: string; code?: string; decline_code?: string }): string {
  const code = error.code;
  const decline = error.decline_code;

  // Stripe validation errors (client-side)
  if (code === "incomplete_number") return "Your card number is incomplete.";
  if (code === "invalid_number" || code === "incorrect_number")
    return "Your card number is invalid. Please check and try again.";
  if (code === "incomplete_expiry" || code === "invalid_expiry_month" || code === "invalid_expiry_year")
    return "Your card's expiry date is incomplete.";
  if (code === "expired_card" || decline === "expired_card")
    return "Your card has expired. Please use a different card.";
  if (code === "incorrect_cvc" || code === "invalid_cvc" || code === "incomplete_cvc")
    return "Your card's security code is incorrect.";
  if (code === "incorrect_zip" || code === "postal_code_invalid")
    return "Your postal code doesn't match your card. Please check and try again.";

  // Card declined — check specific decline reason
  if (code === "card_declined" || decline) {
    if (decline === "insufficient_funds")
      return "Insufficient funds. Please use a different card or payment method.";
    if (decline === "lost_card" || decline === "stolen_card")
      return "This card cannot be used. Please try a different card.";
    if (decline === "card_not_supported")
      return "This card type is not supported. Please try a different card.";
    if (decline === "do_not_honor")
      return "Your bank declined this transaction. Please contact your bank or try a different card.";
    if (decline === "try_again_later")
      return "Your bank couldn't process this right now. Please try again in a moment.";
    if (decline === "currency_not_supported")
      return "Your card doesn't support this currency. Please try a different card.";
    if (decline === "duplicate_transaction")
      return "A duplicate transaction was detected. Please wait a moment before trying again.";
    if (decline === "fraudulent")
      return "This transaction was declined. Please try a different card.";
    if (decline === "generic_decline")
      return "Your card was declined. Please contact your bank or try a different card.";
    if (decline === "withdrawal_count_limit_exceeded")
      return "You've exceeded your card's transaction limit. Please try a different card.";
    return "Your card was declined. Please contact your bank or try a different card.";
  }

  if (code === "processing_error")
    return "An error occurred while processing your card. Please try again.";
  if (code === "rate_limit")
    return "Too many attempts. Please wait a moment and try again.";

  return error.message || "Payment failed. Please try again.";
}
