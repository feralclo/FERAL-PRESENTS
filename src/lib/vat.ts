import type { VatSettings } from "@/types/settings";
import { isZeroDecimalCurrency } from "@/lib/stripe/config";

/** Default VAT settings (not registered — no VAT applied). */
export const DEFAULT_VAT_SETTINGS: VatSettings = {
  vat_registered: false,
  vat_number: "",
  vat_rate: 20,
  prices_include_vat: true,
};

/** VAT calculation result. All amounts in major currency units (pounds, not pence). */
export interface VatBreakdown {
  /** Net amount (excluding VAT) */
  net: number;
  /** VAT amount */
  vat: number;
  /** Gross amount (including VAT) — this is what the customer pays */
  gross: number;
}

/**
 * Calculate VAT for a given amount.
 *
 * @param amount   The price amount (either gross or net depending on `inclusive`)
 * @param rate     VAT rate as a percentage (e.g. 20 = 20%)
 * @param inclusive When true, `amount` already includes VAT (extract it).
 *                  When false, `amount` is the net price (add VAT on top).
 */
export function calculateVat(
  amount: number,
  rate: number,
  inclusive: boolean,
  currency?: string
): VatBreakdown {
  if (rate <= 0 || amount <= 0) {
    return { net: amount, vat: 0, gross: amount };
  }

  // Zero-decimal currencies (JPY) round to whole units; others round to 2 decimals
  const roundMoney = currency && isZeroDecimalCurrency(currency)
    ? (n: number) => Math.round(n)
    : (n: number) => Math.round(n * 100) / 100;

  if (inclusive) {
    // Price includes VAT — extract it: net = gross / (1 + rate/100)
    const gross = amount;
    const net = roundMoney(gross / (1 + rate / 100));
    const vat = roundMoney(gross - net);
    return { net, vat, gross };
  }

  // Price excludes VAT — add it on top
  const net = amount;
  const vat = roundMoney(net * (rate / 100));
  const gross = roundMoney(net + vat);
  return { net, vat, gross };
}

/**
 * Calculate VAT breakdown for a checkout total using the org's VAT settings.
 * Returns null if the org is not VAT-registered (no VAT to show).
 */
export function calculateCheckoutVat(
  subtotal: number,
  vatSettings: VatSettings | null,
  currency?: string
): VatBreakdown | null {
  if (!vatSettings?.vat_registered || !vatSettings.vat_rate) return null;
  return calculateVat(subtotal, vatSettings.vat_rate, vatSettings.prices_include_vat, currency);
}

/**
 * Validate a UK VAT number format.
 * Accepts: GB followed by 9 digits, or 9 digits alone, or EU formats.
 * Returns the cleaned number or null if invalid.
 */
export function validateVatNumber(input: string): string | null {
  const cleaned = input.replace(/\s+/g, "").toUpperCase();
  if (!cleaned) return null;

  // UK: GB + 9 digits (or 12 for government)
  if (/^GB\d{9}(\d{3})?$/.test(cleaned)) return cleaned;

  // EU 2-letter prefix + 2-15 alphanumeric
  if (/^[A-Z]{2}[A-Z0-9]{2,15}$/.test(cleaned)) return cleaned;

  return null;
}
