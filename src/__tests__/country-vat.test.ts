import { describe, it, expect } from "vitest";
import {
  COUNTRY_VAT,
  UNKNOWN_VAT,
  getCountryVatInfo,
  getDefaultVatSettings,
  getTaxLabel,
} from "@/lib/country-vat";

describe("getCountryVatInfo", () => {
  it("returns UK info for GB", () => {
    const info = getCountryVatInfo("GB");
    expect(info.default_rate).toBe(20);
    expect(info.tax_label).toBe("VAT");
    expect(info.prices_include_default).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(getCountryVatInfo("gb").default_rate).toBe(20);
    expect(getCountryVatInfo("De").default_rate).toBe(19);
  });

  it("returns Australia GST at 10% inclusive", () => {
    const info = getCountryVatInfo("AU");
    expect(info.default_rate).toBe(10);
    expect(info.tax_label).toBe("GST");
    expect(info.prices_include_default).toBe(true);
  });

  it("returns US with 0% and no federal tax flag", () => {
    const info = getCountryVatInfo("US");
    expect(info.default_rate).toBe(0);
    expect(info.tax_label).toBe("sales tax");
    expect(info.has_federal_tax).toBe(false);
    expect(info.prices_include_default).toBe(false);
  });

  it("returns Canada with federal GST only (5%)", () => {
    const info = getCountryVatInfo("CA");
    expect(info.default_rate).toBe(5);
    expect(info.tax_label).toBe("GST");
    expect(info.prices_include_default).toBe(false);
  });

  it("returns Switzerland with MWST 8.1% inclusive", () => {
    const info = getCountryVatInfo("CH");
    expect(info.default_rate).toBe(8.1);
    expect(info.tax_label).toBe("MWST");
    expect(info.prices_include_default).toBe(true);
  });

  it("returns Japan consumption tax at 10%", () => {
    const info = getCountryVatInfo("JP");
    expect(info.default_rate).toBe(10);
    expect(info.tax_label).toBe("consumption tax");
  });

  it("falls back to UNKNOWN_VAT for unsupported countries", () => {
    expect(getCountryVatInfo("ZZ")).toEqual(UNKNOWN_VAT);
    expect(getCountryVatInfo("CN")).toEqual(UNKNOWN_VAT);
  });

  it("falls back to UNKNOWN_VAT for null/undefined/empty", () => {
    expect(getCountryVatInfo(null)).toEqual(UNKNOWN_VAT);
    expect(getCountryVatInfo(undefined)).toEqual(UNKNOWN_VAT);
    expect(getCountryVatInfo("")).toEqual(UNKNOWN_VAT);
  });

  it("covers every country in the supported map with non-negative rates", () => {
    Object.entries(COUNTRY_VAT).forEach(([code, info]) => {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(info.default_rate).toBeGreaterThanOrEqual(0);
      expect(info.default_rate).toBeLessThan(100);
    });
  });
});

describe("getDefaultVatSettings", () => {
  it("always returns vat_registered: false (safe default)", () => {
    expect(getDefaultVatSettings("GB").vat_registered).toBe(false);
    expect(getDefaultVatSettings("DE").vat_registered).toBe(false);
    expect(getDefaultVatSettings("US").vat_registered).toBe(false);
    expect(getDefaultVatSettings(null).vat_registered).toBe(false);
  });

  it("pre-loads UK rate at 20% inclusive", () => {
    expect(getDefaultVatSettings("GB")).toEqual({
      vat_registered: false,
      vat_number: "",
      vat_rate: 20,
      prices_include_vat: true,
    });
  });

  it("pre-loads German rate at 19% inclusive", () => {
    const settings = getDefaultVatSettings("DE");
    expect(settings.vat_rate).toBe(19);
    expect(settings.prices_include_vat).toBe(true);
  });

  it("pre-loads US rate at 0% exclusive", () => {
    const settings = getDefaultVatSettings("US");
    expect(settings.vat_rate).toBe(0);
    expect(settings.prices_include_vat).toBe(false);
  });

  it("returns UNKNOWN defaults for unsupported countries", () => {
    const settings = getDefaultVatSettings("ZZ");
    expect(settings.vat_rate).toBe(0);
    expect(settings.prices_include_vat).toBe(false);
    expect(settings.vat_number).toBe("");
  });
});

describe("getTaxLabel", () => {
  it("returns VAT for UK and EU countries", () => {
    expect(getTaxLabel("GB")).toBe("VAT");
    expect(getTaxLabel("DE")).toBe("VAT");
    expect(getTaxLabel("FR")).toBe("VAT");
  });

  it("returns GST for Australia, New Zealand, Canada", () => {
    expect(getTaxLabel("AU")).toBe("GST");
    expect(getTaxLabel("NZ")).toBe("GST");
    expect(getTaxLabel("CA")).toBe("GST");
  });

  it("returns sales tax for US", () => {
    expect(getTaxLabel("US")).toBe("sales tax");
  });

  it("returns consumption tax for Japan", () => {
    expect(getTaxLabel("JP")).toBe("consumption tax");
  });

  it("returns MWST for Switzerland", () => {
    expect(getTaxLabel("CH")).toBe("MWST");
  });
});
