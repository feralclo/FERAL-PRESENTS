/**
 * Fee transparency preview.
 *
 * Used in onboarding's payments section to show a tenant what they'll actually
 * keep on a sale. Numbers are deliberately APPROXIMATE — the Stripe processing
 * cut varies (European card vs international, AmEx, currency) so we use the
 * standard UK domestic estimate (1.5% + 20p) and call it out as an estimate.
 *
 * Math:
 *   gross         = what the customer pays (the ticket price for inclusive VAT;
 *                   ticket_price + vat for exclusive)
 *   entry_fee     = plan.fee_percent% of gross, min plan.min_fee
 *   stripe_fee    = ~1.5% of gross + 20p (UK domestic card estimate)
 *   vat_to_hmrc   = the VAT portion (0 if not VAT-registered)
 *   take_home     = gross − entry_fee − stripe_fee − vat_to_hmrc
 *
 * For zero-decimal currencies (JPY) all fee minimums and the +20p Stripe component
 * are scaled accordingly (¥50 ≈ 20p; we use ¥50 as a sane proxy).
 */

import { PLANS } from "@/lib/plans-data";
import type { PlanId } from "@/types/plans";
import type { VatSettings } from "@/types/settings";
import { calculateCheckoutVat } from "@/lib/vat";
import { isZeroDecimalCurrency, toSmallestUnit, fromSmallestUnit } from "@/lib/stripe/config";

/** Stripe's UK domestic card processing — used as a transparent estimate. */
const STRIPE_FEE_PERCENT_UK = 1.5;
const STRIPE_FEE_FIXED_PENCE = 20;
/** Zero-decimal currency proxy for the Stripe fixed fee (¥50 ≈ £0.40). */
const STRIPE_FEE_FIXED_ZERO_DECIMAL = 50;

export interface FeePreviewInput {
  /** Customer-facing ticket price in MAJOR units (e.g. 20 for £20.00, 1000 for ¥1000) */
  ticket_price: number;
  /** ISO 4217 currency code (e.g. "GBP", "EUR", "JPY") */
  currency: string;
  /** Plan id — defaults to starter */
  plan_id?: PlanId;
  /**
   * VAT settings (org-level). When `vat_registered: true`, VAT amount is
   * subtracted from take-home (it's owed to the tax authority, not the tenant).
   */
  vat?: VatSettings | null;
}

export interface FeePreviewOutput {
  /** What the customer pays (gross of VAT, fees on top of this) — major units */
  customer_pays: number;
  /** VAT portion the tenant collects on behalf of the tax authority (0 if not registered) — major units */
  vat_to_hmrc: number;
  /** Entry's application_fee — major units */
  entry_fee: number;
  /** Stripe's processing cut (estimate, UK domestic) — major units */
  stripe_fee_estimate: number;
  /** Net to the tenant — major units */
  take_home: number;
  /** True if the Stripe fee number is a rough estimate (always true today). */
  stripe_fee_is_estimate: true;
  /** Currency echoed back for downstream formatting */
  currency: string;
}

/**
 * Compute the take-home preview for a single ticket sale.
 *
 * All inputs in major units. All outputs in major units. Rounding done in
 * smallest-unit space to avoid float drift, then converted back.
 */
export function previewTakeHome(input: FeePreviewInput): FeePreviewOutput {
  const currency = input.currency.toUpperCase();
  const plan = PLANS[input.plan_id ?? "starter"] ?? PLANS.starter;
  const isZeroDecimal = isZeroDecimalCurrency(currency);

  // Compute gross (what the customer actually pays).
  // For VAT-inclusive (default UK B2C), gross == ticket_price.
  // For VAT-exclusive, VAT is added on top.
  const vatBreakdown = calculateCheckoutVat(input.ticket_price, input.vat ?? null, currency);
  const gross =
    vatBreakdown && !input.vat?.prices_include_vat
      ? vatBreakdown.gross
      : input.ticket_price;
  const vatToHmrc = vatBreakdown?.vat ?? 0;

  const grossMinor = toSmallestUnit(gross, currency);

  // Entry application_fee — uses plan-defined % and min, both in smallest unit.
  const entryFeeMinor = Math.max(
    plan.min_fee,
    Math.round(grossMinor * (plan.fee_percent / 100))
  );

  // Stripe fee estimate — % + fixed. For zero-decimal currencies use the proxy.
  const stripeFixed = isZeroDecimal ? STRIPE_FEE_FIXED_ZERO_DECIMAL : STRIPE_FEE_FIXED_PENCE;
  const stripeFeeMinor =
    Math.round(grossMinor * (STRIPE_FEE_PERCENT_UK / 100)) + stripeFixed;

  const vatToHmrcMinor = toSmallestUnit(vatToHmrc, currency);
  const takeHomeMinor = grossMinor - entryFeeMinor - stripeFeeMinor - vatToHmrcMinor;

  return {
    customer_pays: fromSmallestUnit(grossMinor, currency),
    vat_to_hmrc: fromSmallestUnit(vatToHmrcMinor, currency),
    entry_fee: fromSmallestUnit(entryFeeMinor, currency),
    stripe_fee_estimate: fromSmallestUnit(stripeFeeMinor, currency),
    take_home: fromSmallestUnit(takeHomeMinor, currency),
    stripe_fee_is_estimate: true,
    currency,
  };
}
