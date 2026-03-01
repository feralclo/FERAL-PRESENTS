/**
 * Country → currency mapping for supported countries.
 * Used in onboarding and general settings to derive an org's base currency.
 */

export interface CountryInfo {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  currency: string; // ISO 4217
  currencySymbol: string;
}

/**
 * Curated list of supported countries.
 * Sorted alphabetically by name for dropdown display.
 */
export const COUNTRIES: CountryInfo[] = [
  { code: "AU", name: "Australia", currency: "AUD", currencySymbol: "A$" },
  { code: "AT", name: "Austria", currency: "EUR", currencySymbol: "€" },
  { code: "BE", name: "Belgium", currency: "EUR", currencySymbol: "€" },
  { code: "CA", name: "Canada", currency: "CAD", currencySymbol: "CA$" },
  { code: "HR", name: "Croatia", currency: "EUR", currencySymbol: "€" },
  { code: "CY", name: "Cyprus", currency: "EUR", currencySymbol: "€" },
  { code: "DK", name: "Denmark", currency: "DKK", currencySymbol: "kr" },
  { code: "EE", name: "Estonia", currency: "EUR", currencySymbol: "€" },
  { code: "FI", name: "Finland", currency: "EUR", currencySymbol: "€" },
  { code: "FR", name: "France", currency: "EUR", currencySymbol: "€" },
  { code: "DE", name: "Germany", currency: "EUR", currencySymbol: "€" },
  { code: "GR", name: "Greece", currency: "EUR", currencySymbol: "€" },
  { code: "IE", name: "Ireland", currency: "EUR", currencySymbol: "€" },
  { code: "IT", name: "Italy", currency: "EUR", currencySymbol: "€" },
  { code: "LV", name: "Latvia", currency: "EUR", currencySymbol: "€" },
  { code: "LT", name: "Lithuania", currency: "EUR", currencySymbol: "€" },
  { code: "LU", name: "Luxembourg", currency: "EUR", currencySymbol: "€" },
  { code: "MT", name: "Malta", currency: "EUR", currencySymbol: "€" },
  { code: "NL", name: "Netherlands", currency: "EUR", currencySymbol: "€" },
  { code: "NZ", name: "New Zealand", currency: "NZD", currencySymbol: "NZ$" },
  { code: "NO", name: "Norway", currency: "NOK", currencySymbol: "kr" },
  { code: "PT", name: "Portugal", currency: "EUR", currencySymbol: "€" },
  { code: "SK", name: "Slovakia", currency: "EUR", currencySymbol: "€" },
  { code: "SI", name: "Slovenia", currency: "EUR", currencySymbol: "€" },
  { code: "ES", name: "Spain", currency: "EUR", currencySymbol: "€" },
  { code: "SE", name: "Sweden", currency: "SEK", currencySymbol: "kr" },
  { code: "CH", name: "Switzerland", currency: "CHF", currencySymbol: "CHF" },
  { code: "GB", name: "United Kingdom", currency: "GBP", currencySymbol: "£" },
  { code: "US", name: "United States", currency: "USD", currencySymbol: "$" },
];

/** Map country code → CountryInfo for fast lookup */
const COUNTRY_MAP = new Map(COUNTRIES.map((c) => [c.code, c]));

/**
 * Get the default currency for a country code.
 * Falls back to GBP for unknown countries.
 */
export function getDefaultCurrency(countryCode: string): string {
  return COUNTRY_MAP.get(countryCode.toUpperCase())?.currency ?? "GBP";
}

/**
 * Get the currency symbol for a currency code.
 * Falls back to the uppercase code itself.
 */
export function getCurrencySymbolFromMap(currency: string): string {
  const entry = COUNTRIES.find((c) => c.currency === currency.toUpperCase());
  return entry?.currencySymbol ?? currency.toUpperCase();
}

/**
 * Get full country info by code.
 */
export function getCountryInfo(countryCode: string): CountryInfo | undefined {
  return COUNTRY_MAP.get(countryCode.toUpperCase());
}

/**
 * Detect country code from browser locale string.
 * e.g. "en-GB" → "GB", "de-DE" → "DE", "en" → "GB" (fallback)
 */
export function detectCountryFromLocale(locale?: string): string {
  if (!locale) return "GB";
  const parts = locale.split("-");
  if (parts.length >= 2) {
    const region = parts[parts.length - 1].toUpperCase();
    if (COUNTRY_MAP.has(region)) return region;
  }
  // Language-only fallbacks
  const lang = parts[0].toLowerCase();
  const langMap: Record<string, string> = {
    en: "GB", de: "DE", fr: "FR", es: "ES", it: "IT", nl: "NL",
    pt: "PT", sv: "SE", da: "DK", nb: "NO", nn: "NO", fi: "FI",
  };
  return langMap[lang] ?? "GB";
}
