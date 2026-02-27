/**
 * Maps ISO 3166-1 alpha-2 country codes to their default currency
 * from our supported set (GBP, EUR, USD, CAD, AUD, CHF, SEK, NOK, DKK).
 *
 * Countries not in this map fall back to USD.
 */

const COUNTRY_CURRENCY: Record<string, string> = {
  // GBP
  GB: "GBP",
  IM: "GBP", // Isle of Man
  JE: "GBP", // Jersey
  GG: "GBP", // Guernsey

  // EUR (Eurozone)
  AT: "EUR", // Austria
  BE: "EUR", // Belgium
  CY: "EUR", // Cyprus
  EE: "EUR", // Estonia
  FI: "EUR", // Finland
  FR: "EUR", // France
  DE: "EUR", // Germany
  GR: "EUR", // Greece
  IE: "EUR", // Ireland
  IT: "EUR", // Italy
  LV: "EUR", // Latvia
  LT: "EUR", // Lithuania
  LU: "EUR", // Luxembourg
  MT: "EUR", // Malta
  NL: "EUR", // Netherlands
  PT: "EUR", // Portugal
  SK: "EUR", // Slovakia
  SI: "EUR", // Slovenia
  ES: "EUR", // Spain
  HR: "EUR", // Croatia

  // USD
  US: "USD",
  PR: "USD", // Puerto Rico
  GU: "USD", // Guam
  VI: "USD", // US Virgin Islands
  AS: "USD", // American Samoa
  EC: "USD", // Ecuador (dollarized)
  SV: "USD", // El Salvador (dollarized)
  PA: "USD", // Panama (uses USD alongside Balboa)

  // CAD
  CA: "CAD",

  // AUD
  AU: "AUD",
  NZ: "AUD", // NZD not in our set, closest is AUD

  // CHF
  CH: "CHF",
  LI: "CHF", // Liechtenstein

  // SEK
  SE: "SEK",

  // NOK
  NO: "NOK",
  SJ: "NOK", // Svalbard

  // DKK
  DK: "DKK",
  FO: "DKK", // Faroe Islands
  GL: "DKK", // Greenland
};

/**
 * Get the default display currency for a given ISO country code.
 * Returns uppercase currency code. Falls back to "USD".
 */
export function getDefaultCurrency(countryCode: string | null | undefined): string {
  if (!countryCode) return "USD";
  return COUNTRY_CURRENCY[countryCode.toUpperCase()] || "USD";
}
