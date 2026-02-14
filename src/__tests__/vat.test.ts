import { describe, it, expect } from "vitest";
import {
  calculateVat,
  calculateCheckoutVat,
  validateVatNumber,
  DEFAULT_VAT_SETTINGS,
} from "@/lib/vat";
import type { VatSettings } from "@/types/settings";

describe("calculateVat", () => {
  it("returns zero VAT for zero rate", () => {
    const result = calculateVat(100, 0, true);
    expect(result).toEqual({ net: 100, vat: 0, gross: 100 });
  });

  it("returns zero VAT for zero amount", () => {
    const result = calculateVat(0, 20, true);
    expect(result).toEqual({ net: 0, vat: 0, gross: 0 });
  });

  it("extracts VAT from inclusive price (20%)", () => {
    // £26.50 inclusive → net = 26.50/1.20 = 22.08, vat = 4.42
    const result = calculateVat(26.5, 20, true);
    expect(result.gross).toBe(26.5);
    expect(result.net).toBe(22.08);
    expect(result.vat).toBe(4.42);
    expect(result.net + result.vat).toBeCloseTo(result.gross, 2);
  });

  it("extracts VAT from inclusive price (5%)", () => {
    const result = calculateVat(10.5, 5, true);
    expect(result.gross).toBe(10.5);
    expect(result.net).toBe(10);
    expect(result.vat).toBe(0.5);
  });

  it("adds VAT on top for exclusive price (20%)", () => {
    const result = calculateVat(26.5, 20, false);
    expect(result.net).toBe(26.5);
    expect(result.vat).toBe(5.3);
    expect(result.gross).toBe(31.8);
  });

  it("adds VAT on top for exclusive price (5%)", () => {
    const result = calculateVat(100, 5, false);
    expect(result.net).toBe(100);
    expect(result.vat).toBe(5);
    expect(result.gross).toBe(105);
  });

  it("handles small amounts correctly", () => {
    const result = calculateVat(0.99, 20, true);
    expect(result.gross).toBe(0.99);
    expect(result.net + result.vat).toBeCloseTo(0.99, 2);
  });

  it("handles large amounts", () => {
    const result = calculateVat(1000, 20, false);
    expect(result.vat).toBe(200);
    expect(result.gross).toBe(1200);
  });
});

describe("calculateCheckoutVat", () => {
  it("returns null when VAT not registered", () => {
    const settings: VatSettings = { ...DEFAULT_VAT_SETTINGS, vat_registered: false };
    expect(calculateCheckoutVat(100, settings)).toBeNull();
  });

  it("returns null when settings are null", () => {
    expect(calculateCheckoutVat(100, null)).toBeNull();
  });

  it("returns null when VAT rate is 0", () => {
    const settings: VatSettings = {
      vat_registered: true,
      vat_number: "GB123456789",
      vat_rate: 0,
      prices_include_vat: true,
    };
    expect(calculateCheckoutVat(100, settings)).toBeNull();
  });

  it("returns VAT breakdown for inclusive pricing", () => {
    const settings: VatSettings = {
      vat_registered: true,
      vat_number: "GB123456789",
      vat_rate: 20,
      prices_include_vat: true,
    };
    const result = calculateCheckoutVat(120, settings);
    expect(result).not.toBeNull();
    expect(result!.gross).toBe(120);
    expect(result!.net).toBe(100);
    expect(result!.vat).toBe(20);
  });

  it("returns VAT breakdown for exclusive pricing", () => {
    const settings: VatSettings = {
      vat_registered: true,
      vat_number: "GB123456789",
      vat_rate: 20,
      prices_include_vat: false,
    };
    const result = calculateCheckoutVat(100, settings);
    expect(result).not.toBeNull();
    expect(result!.net).toBe(100);
    expect(result!.vat).toBe(20);
    expect(result!.gross).toBe(120);
  });
});

describe("validateVatNumber", () => {
  it("validates standard UK VAT number (GB + 9 digits)", () => {
    expect(validateVatNumber("GB123456789")).toBe("GB123456789");
  });

  it("validates UK VAT number with spaces", () => {
    expect(validateVatNumber("GB 123 456 789")).toBe("GB123456789");
  });

  it("validates UK government VAT number (12 digits)", () => {
    expect(validateVatNumber("GB123456789012")).toBe("GB123456789012");
  });

  it("validates lowercase input", () => {
    expect(validateVatNumber("gb123456789")).toBe("GB123456789");
  });

  it("validates EU VAT number (e.g. German)", () => {
    expect(validateVatNumber("DE123456789")).toBe("DE123456789");
  });

  it("validates French VAT number", () => {
    expect(validateVatNumber("FR12345678901")).toBe("FR12345678901");
  });

  it("rejects empty string", () => {
    expect(validateVatNumber("")).toBeNull();
  });

  it("rejects plain digits (no country code)", () => {
    expect(validateVatNumber("123456789")).toBeNull();
  });

  it("rejects single letter prefix", () => {
    expect(validateVatNumber("G123456789")).toBeNull();
  });

  it("rejects too short", () => {
    expect(validateVatNumber("GB1")).toBeNull();
  });
});
