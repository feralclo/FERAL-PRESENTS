import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import { NextRequest } from "next/server";

const hoisted = vi.hoisted(() => {
  const mockSendDispatched = vi.fn().mockResolvedValue(true);
  const mockClaimMaybeSingle = vi.fn();
  const mockProductMaybeSingle = vi.fn();
  const mockVariantMaybeSingle = vi.fn();
  const mockUpdateEq = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockFrom = vi.fn((table: string) => {
    if (table === "platform_market_claims") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: mockClaimMaybeSingle })),
        })),
        update: vi.fn(() => ({ eq: mockUpdateEq })),
      };
    }
    if (table === "platform_market_products") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: mockProductMaybeSingle })),
        })),
      };
    }
    if (table === "platform_market_product_variants") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: mockVariantMaybeSingle })),
        })),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return {
    mockSendDispatched,
    mockClaimMaybeSingle,
    mockProductMaybeSingle,
    mockVariantMaybeSingle,
    mockUpdateEq,
    mockFrom,
  };
});
const {
  mockSendDispatched,
  mockClaimMaybeSingle,
  mockProductMaybeSingle,
  mockVariantMaybeSingle,
  mockUpdateEq,
  mockFrom,
} = hoisted;

vi.mock("@/lib/market/emails", () => ({
  sendClaimDispatched: hoisted.mockSendDispatched,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockResolvedValue({ from: hoisted.mockFrom }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { POST } from "@/app/api/webhooks/shopify-supplier/route";

const SECRET = "test_webhook_secret";

function signedRequest(body: object, opts: { topic?: string; badHmac?: boolean } = {}) {
  const json = JSON.stringify(body);
  const goodHmac = crypto
    .createHmac("sha256", SECRET)
    .update(json, "utf8")
    .digest("base64");
  const headers = new Headers({
    "Content-Type": "application/json",
    "X-Shopify-Topic": opts.topic ?? "orders/fulfilled",
    "X-Shopify-Hmac-Sha256": opts.badHmac ? "bogus" : goodHmac,
  });
  return new NextRequest("https://admin.entry.events/api/webhooks/shopify-supplier", {
    method: "POST",
    headers,
    body: json,
  });
}

const ORDER_FULFILLED_BASE = {
  id: 99887766,
  name: "#1042",
  note_attributes: [
    { name: "entry_claim_id", value: "claim-uuid-1" },
    { name: "entry_product_id", value: "prod-1" },
  ],
  fulfillments: [
    {
      tracking_number: "RM12345GB",
      tracking_url: "https://track.royalmail.com/RM12345GB",
      tracking_company: "Royal Mail",
    },
  ],
};

const CLAIM_BASE = {
  id: "claim-uuid-1",
  rep_id: "rep-1",
  product_id: "prod-1",
  variant_id: "variant-1",
  shipping_name: "Alex Smith",
  shipping_email: "rep@example.com",
  shipping_address: {
    line1: "12 Camden High St",
    city: "London",
    postcode: "NW1 0JH",
    country: "UK",
  },
  status: "submitted_to_supplier",
  dispatch_email_sent_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SHOPIFY_SUPPLIER_WEBHOOK_SECRET = SECRET;
  mockClaimMaybeSingle.mockResolvedValue({ data: CLAIM_BASE, error: null });
  mockProductMaybeSingle.mockResolvedValue({
    data: { title: "Feral Cap" },
    error: null,
  });
  mockVariantMaybeSingle.mockResolvedValue({
    data: { title: "One size", option1: null },
    error: null,
  });
});

describe("/api/webhooks/shopify-supplier — security", () => {
  it("rejects requests without a valid HMAC", async () => {
    const req = signedRequest(ORDER_FULFILLED_BASE, { badHmac: true });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockSendDispatched).not.toHaveBeenCalled();
  });

  it("returns 503 when SHOPIFY_SUPPLIER_WEBHOOK_SECRET is unset", async () => {
    delete process.env.SHOPIFY_SUPPLIER_WEBHOOK_SECRET;
    const req = signedRequest(ORDER_FULFILLED_BASE);
    const res = await POST(req);
    expect(res.status).toBe(503);
  });
});

describe("/api/webhooks/shopify-supplier — orders/fulfilled", () => {
  it("matches the claim, persists tracking, and fires the dispatch email", async () => {
    const req = signedRequest(ORDER_FULFILLED_BASE);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, claim_id: "claim-uuid-1" });

    // Tracking written to the claim row
    expect(mockUpdateEq).toHaveBeenCalled();

    // Email sent with the right payload
    expect(mockSendDispatched).toHaveBeenCalledOnce();
    const emailArg = mockSendDispatched.mock.calls[0][0];
    expect(emailArg.claimId).toBe("claim-uuid-1");
    expect(emailArg.recipientEmail).toBe("rep@example.com");
    expect(emailArg.trackingNumber).toBe("RM12345GB");
    expect(emailArg.trackingUrl).toBe("https://track.royalmail.com/RM12345GB");
    expect(emailArg.trackingCompany).toBe("Royal Mail");
    expect(emailArg.productTitle).toBe("Feral Cap");
    expect(emailArg.variantTitle).toBe("One size");
  });

  it("skips the email on redelivery (dispatch_email_sent_at already set)", async () => {
    mockClaimMaybeSingle.mockResolvedValue({
      data: { ...CLAIM_BASE, dispatch_email_sent_at: "2026-04-29T16:35:00Z" },
      error: null,
    });
    const req = signedRequest(ORDER_FULFILLED_BASE);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redelivery).toBe(true);
    expect(mockSendDispatched).not.toHaveBeenCalled();
  });

  it("acks 200 on unknown topics so Shopify doesn't retry", async () => {
    const req = signedRequest(ORDER_FULFILLED_BASE, { topic: "orders/created" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ignored).toBe(true);
    expect(mockSendDispatched).not.toHaveBeenCalled();
  });

  it("acks 200 with no_claim_matched when entry_claim_id is missing and external_order_id doesn't match", async () => {
    mockClaimMaybeSingle.mockResolvedValue({ data: null, error: null });
    const payload = {
      ...ORDER_FULFILLED_BASE,
      note_attributes: [],
    };
    const req = signedRequest(payload);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reason).toBe("no_claim_matched");
    expect(mockSendDispatched).not.toHaveBeenCalled();
  });

  it("falls back to external_order_id lookup when note_attributes lacks entry_claim_id", async () => {
    // No claim hint → only the external_order_id lookup runs (one DB call).
    mockClaimMaybeSingle.mockResolvedValueOnce({ data: CLAIM_BASE, error: null });
    const payload = {
      ...ORDER_FULFILLED_BASE,
      note_attributes: [],
    };
    const req = signedRequest(payload);
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockSendDispatched).toHaveBeenCalledOnce();
  });

  it("handles fulfillments using tracking_numbers[] / tracking_urls[] arrays", async () => {
    const payload = {
      ...ORDER_FULFILLED_BASE,
      fulfillments: [
        {
          tracking_numbers: ["DPD-A1B2C3"],
          tracking_urls: ["https://track.dpd.co.uk/A1B2C3"],
          tracking_company: "DPD",
        },
      ],
    };
    const req = signedRequest(payload);
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockSendDispatched.mock.calls[0][0].trackingNumber).toBe("DPD-A1B2C3");
    expect(mockSendDispatched.mock.calls[0][0].trackingUrl).toBe("https://track.dpd.co.uk/A1B2C3");
  });
});
