/**
 * Country → default VAT/GST/sales-tax behaviour.
 *
 * Used at two points in onboarding:
 *  1. When provisioning a new org, to seed `{org_id}_vat` with a country-correct rate
 *     (so a German tenant who later flips "VAT registered" to true gets 19%, not the UK's 20%).
 *  2. In the wizard's VAT section, to drive copy ("VAT" vs "GST" vs "sales tax") and
 *     pre-fill the rate when the user toggles registered = true.
 *
 * IMPORTANT: `vat_registered` defaults to FALSE for every country. Most small/new promoters
 * are below the registration threshold; making them opt-in to charging tax is the safe path.
 *
 * Rates accurate as of 2026 standard rates. Reduced rates and edge cases (e.g. Canadian
 * provincial PST/HST, US state sales tax, Swiss reduced rates) are intentionally NOT modelled
 * — those tenants will need to override per-event or per-org.
 */

import type { VatSettings } from "@/types/settings";

export type TaxLabel = "VAT" | "GST" | "sales tax" | "consumption tax" | "MWST";

export interface CountryVatInfo {
  /** Standard rate in this country (%) — what most B2C transactions charge */
  default_rate: number;
  /** Local name for the tax — used in UI copy */
  tax_label: TaxLabel;
  /**
   * Whether listed prices typically include the tax in this country.
   * EU/UK/AU/NZ B2C: true (legally required to display gross). US/JP B2B-ish: false.
   */
  prices_include_default: boolean;
  /**
   * Does the country have a federal VAT/GST regime at all?
   * false for US (no federal sales tax) — onboarding should warn US tenants that
   * state sales tax is their responsibility outside this platform.
   */
  has_federal_tax: boolean;
}

/**
 * Standard VAT/GST/consumption-tax rates by ISO 3166-1 alpha-2 country code.
 * Mirrors the supported set in `country-currency-map.ts`.
 */
export const COUNTRY_VAT: Record<string, CountryVatInfo> = {
  // United Kingdom
  GB: { default_rate: 20, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },

  // EU member states (alphabetical)
  AT: { default_rate: 20, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  BE: { default_rate: 21, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  HR: { default_rate: 25, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  CY: { default_rate: 19, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  EE: { default_rate: 22, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  FI: { default_rate: 25.5, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  FR: { default_rate: 20, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  DE: { default_rate: 19, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  GR: { default_rate: 24, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  IE: { default_rate: 23, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  IT: { default_rate: 22, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  LV: { default_rate: 21, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  LT: { default_rate: 21, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  LU: { default_rate: 17, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  MT: { default_rate: 18, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  NL: { default_rate: 21, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  PT: { default_rate: 23, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  SK: { default_rate: 23, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  SI: { default_rate: 22, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  ES: { default_rate: 21, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },

  // Other Europe (non-EU)
  DK: { default_rate: 25, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  NO: { default_rate: 25, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  SE: { default_rate: 25, tax_label: "VAT", prices_include_default: true, has_federal_tax: true },
  CH: { default_rate: 8.1, tax_label: "MWST", prices_include_default: true, has_federal_tax: true },

  // APAC
  AU: { default_rate: 10, tax_label: "GST", prices_include_default: true, has_federal_tax: true },
  NZ: { default_rate: 15, tax_label: "GST", prices_include_default: true, has_federal_tax: true },
  JP: { default_rate: 10, tax_label: "consumption tax", prices_include_default: true, has_federal_tax: true },

  // North America
  CA: { default_rate: 5, tax_label: "GST", prices_include_default: false, has_federal_tax: true },
  US: { default_rate: 0, tax_label: "sales tax", prices_include_default: false, has_federal_tax: false },
};

/**
 * Fallback for countries not in the map. Safe defaults: no tax, exclusive pricing,
 * no federal regime assumed — the tenant has to opt in and supply rate manually.
 */
export const UNKNOWN_VAT: CountryVatInfo = {
  default_rate: 0,
  tax_label: "VAT",
  prices_include_default: false,
  has_federal_tax: false,
};

/**
 * Look up VAT info by country code. Case-insensitive. Falls back to UNKNOWN_VAT.
 */
export function getCountryVatInfo(countryCode: string | null | undefined): CountryVatInfo {
  if (!countryCode) return UNKNOWN_VAT;
  return COUNTRY_VAT[countryCode.toUpperCase()] ?? UNKNOWN_VAT;
}

/**
 * Build a fully-shaped `VatSettings` row for a new org based on country.
 *
 * Always returns `vat_registered: false` — the tenant opts in during onboarding's VAT step
 * (or later in /admin/settings/finance). The rate is pre-loaded so toggling registered = true
 * shows the right number for their country without further input.
 */
export function getDefaultVatSettings(countryCode: string | null | undefined): VatSettings {
  const info = getCountryVatInfo(countryCode);
  return {
    vat_registered: false,
    vat_number: "",
    vat_rate: info.default_rate,
    prices_include_vat: info.prices_include_default,
  };
}

/**
 * Local label for the tax — used in UI copy ("Are you VAT registered?" vs "Are you GST registered?").
 */
export function getTaxLabel(countryCode: string | null | undefined): TaxLabel {
  return getCountryVatInfo(countryCode).tax_label;
}
