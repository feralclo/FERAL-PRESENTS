/**
 * Multi-currency types.
 *
 * Exchange rates are fetched from an external API, cached in site_settings,
 * and used to convert prices from an event's base currency to the buyer's
 * presentment currency.
 */

/** Cached exchange rates (base: USD). Stored in site_settings. */
export interface ExchangeRates {
  base: "USD";
  rates: Record<string, number>; // e.g. { GBP: 0.79, EUR: 0.92 }
  fetched_at: string; // ISO timestamp
}

/** Conversion context attached to an order for audit trail. */
export interface CurrencyConversion {
  presentment_currency: string; // e.g. "EUR"
  base_currency: string; // e.g. "GBP"
  exchange_rate: number; // 1 base unit = rate * presentment units
  rate_locked_at: string; // ISO timestamp when rate was locked
}

/** Supported currencies with display metadata. */
export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
}
