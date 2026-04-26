import { describe, it, expect } from "vitest";
import { previewTakeHome } from "@/lib/fee-preview";
import type { VatSettings } from "@/types/settings";

const VAT_INCLUSIVE_20: VatSettings = {
  vat_registered: true,
  vat_number: "GB123456789",
  vat_rate: 20,
  prices_include_vat: true,
};

const VAT_EXCLUSIVE_20: VatSettings = {
  ...VAT_INCLUSIVE_20,
  prices_include_vat: false,
};

const NOT_REGISTERED: VatSettings = {
  vat_registered: false,
  vat_number: "",
  vat_rate: 20,
  prices_include_vat: true,
};

describe("previewTakeHome — Starter plan, GBP, no VAT", () => {
  it("£20 ticket → ~£18.93 take-home (3.5% + 30p Entry, 1.5% + 20p Stripe)", () => {
    const r = previewTakeHome({ ticket_price: 20, currency: "GBP", plan_id: "starter" });
    expect(r.customer_pays).toBe(20);
    expect(r.entry_fee).toBe(0.7); // 3.5% of 20 = 0.70 (>= 0.30 min)
    expect(r.stripe_fee_estimate).toBeCloseTo(0.5, 2); // 1.5% of 20 + 0.20 = 0.50
    expect(r.vat_to_hmrc).toBe(0);
    expect(r.take_home).toBeCloseTo(18.8, 2);
    expect(r.stripe_fee_is_estimate).toBe(true);
  });

  it("£1 ticket → min fee floor applies (entry £0.30; stripe rounds to whole pence)", () => {
    const r = previewTakeHome({ ticket_price: 1, currency: "GBP", plan_id: "starter" });
    // entry_fee = max(30, 1*100*3.5/100=3.5) → 30p (min applies)
    expect(r.entry_fee).toBe(0.3);
    // stripe = round(100 * 1.5/100) + 20 = round(1.5) + 20 = 2 + 20 = 22p → £0.22
    expect(r.stripe_fee_estimate).toBe(0.22);
  });
});

describe("previewTakeHome — Pro plan, GBP, no VAT", () => {
  it("£20 ticket → smaller Entry cut (2% + 10p min)", () => {
    const starter = previewTakeHome({ ticket_price: 20, currency: "GBP", plan_id: "starter" });
    const pro = previewTakeHome({ ticket_price: 20, currency: "GBP", plan_id: "pro" });
    expect(pro.entry_fee).toBeLessThan(starter.entry_fee);
    expect(pro.entry_fee).toBe(0.4); // 2% of 20 = 0.40
    expect(pro.take_home).toBeGreaterThan(starter.take_home);
  });
});

describe("previewTakeHome — VAT scenarios", () => {
  it("inclusive VAT: gross stays at ticket_price, VAT subtracted from take-home", () => {
    const r = previewTakeHome({
      ticket_price: 20,
      currency: "GBP",
      plan_id: "starter",
      vat: VAT_INCLUSIVE_20,
    });
    expect(r.customer_pays).toBe(20);
    // VAT inclusive at 20%: gross 20 → net ~16.67, VAT ~3.33
    expect(r.vat_to_hmrc).toBeCloseTo(3.33, 2);
    expect(r.take_home).toBeCloseTo(20 - r.entry_fee - r.stripe_fee_estimate - r.vat_to_hmrc, 2);
  });

  it("exclusive VAT: customer pays ticket_price + VAT, fees calculated on gross", () => {
    const r = previewTakeHome({
      ticket_price: 20,
      currency: "GBP",
      plan_id: "starter",
      vat: VAT_EXCLUSIVE_20,
    });
    expect(r.customer_pays).toBe(24); // 20 + 4 VAT
    expect(r.vat_to_hmrc).toBe(4);
    // Entry fee on 24 (gross): 24*3.5% = 0.84
    expect(r.entry_fee).toBeCloseTo(0.84, 2);
  });

  it("not VAT registered: VAT to HMRC = 0 even when settings have a rate", () => {
    const r = previewTakeHome({
      ticket_price: 20,
      currency: "GBP",
      plan_id: "starter",
      vat: NOT_REGISTERED,
    });
    expect(r.vat_to_hmrc).toBe(0);
  });
});

describe("previewTakeHome — multi-currency", () => {
  it("EUR ticket — Entry % stays the same, Stripe estimate uses 1.5% + €0.20", () => {
    const r = previewTakeHome({ ticket_price: 25, currency: "EUR", plan_id: "starter" });
    // 25.00 * 3.5% = €0.875 → rounds to 88c
    expect(r.entry_fee).toBe(0.88);
    // 25.00 * 1.5% + 0.20 = 0.575 → rounds to 58c
    expect(r.stripe_fee_estimate).toBe(0.58);
    expect(r.currency).toBe("EUR");
  });

  it("JPY (zero-decimal) — fees apply in whole-yen units", () => {
    const r = previewTakeHome({ ticket_price: 5000, currency: "JPY", plan_id: "starter" });
    expect(r.customer_pays).toBe(5000);
    // 5000 * 3.5% = 175 yen (above min 30 in our config — but Plan min is in smallest unit)
    // Note: PLANS.starter.min_fee = 30 (smallest unit). For JPY that's 30 yen.
    // 3.5% of 5000 yen = 175 yen, well above min 30
    expect(r.entry_fee).toBe(175);
    // Stripe: 5000 * 1.5% + 50 = 75 + 50 = 125
    expect(r.stripe_fee_estimate).toBe(125);
  });
});

describe("previewTakeHome — invariants", () => {
  it("take_home + entry_fee + stripe_fee + vat = customer_pays (rounding aside)", () => {
    const r = previewTakeHome({
      ticket_price: 30,
      currency: "GBP",
      plan_id: "starter",
      vat: VAT_INCLUSIVE_20,
    });
    const sum = r.take_home + r.entry_fee + r.stripe_fee_estimate + r.vat_to_hmrc;
    expect(sum).toBeCloseTo(r.customer_pays, 2);
  });

  it("defaults to Starter when plan_id omitted", () => {
    const r = previewTakeHome({ ticket_price: 20, currency: "GBP" });
    const explicit = previewTakeHome({ ticket_price: 20, currency: "GBP", plan_id: "starter" });
    expect(r.take_home).toBe(explicit.take_home);
  });
});
