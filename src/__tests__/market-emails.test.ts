import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => {
  const mockResendSend = vi.fn();
  const mockClaimSelectMaybeSingle = vi.fn();
  const mockClaimUpdate = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  }));
  const mockFrom = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle: mockClaimSelectMaybeSingle })),
    })),
    update: mockClaimUpdate,
  }));
  return { mockResendSend, mockClaimSelectMaybeSingle, mockClaimUpdate, mockFrom };
});
const { mockResendSend, mockClaimSelectMaybeSingle, mockClaimUpdate, mockFrom } = hoisted;

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: hoisted.mockResendSend };
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockResolvedValue({ from: hoisted.mockFrom }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  }),
) as unknown as typeof fetch;

import {
  sendClaimConfirmation,
  sendClaimDispatched,
} from "@/lib/market/emails";

const baseShipping = {
  line1: "12 Camden High St",
  line2: null,
  city: "London",
  region: null,
  postcode: "NW1 0JH",
  country: "UK",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = "test-key";
  mockResendSend.mockResolvedValue({ data: { id: "msg-1" }, error: null });
  mockClaimSelectMaybeSingle.mockResolvedValue({
    data: { confirmation_email_sent_at: null, dispatch_email_sent_at: null },
    error: null,
  });
});

describe("sendClaimConfirmation", () => {
  it("sends a confirmation email and stamps confirmation_email_sent_at", async () => {
    const ok = await sendClaimConfirmation({
      claimId: "claim-1",
      recipientEmail: "rep@example.com",
      recipientName: "Alex Smith",
      productTitle: "Feral Cap — Black",
      variantTitle: "One size",
      epSpent: 1500,
      shippingAddress: baseShipping,
      orderNumber: "#1042",
    });

    expect(ok).toBe(true);
    expect(mockResendSend).toHaveBeenCalledOnce();
    const arg = mockResendSend.mock.calls[0][0];
    expect(arg.from).toContain("Entry");
    expect(arg.to).toEqual(["rep@example.com"]);
    expect(arg.subject).toContain("Feral Cap");
    expect(arg.html).toContain("1,500 EP");
    expect(arg.html).toContain("Alex");
    expect(arg.html).toContain("12 Camden High St");
    expect(arg.text).toContain("1,500 EP");
    expect(mockClaimUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmation_email_sent_at: expect.any(String),
      }),
    );
  });

  it("is idempotent — bails out if confirmation_email_sent_at is set", async () => {
    mockClaimSelectMaybeSingle.mockResolvedValue({
      data: { confirmation_email_sent_at: "2026-04-29T16:35:00Z" },
      error: null,
    });

    const ok = await sendClaimConfirmation({
      claimId: "claim-1",
      recipientEmail: "rep@example.com",
      recipientName: "Alex",
      productTitle: "Feral Cap",
      epSpent: 1500,
      shippingAddress: baseShipping,
    });

    expect(ok).toBe(false);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("returns false (skip) when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const ok = await sendClaimConfirmation({
      claimId: "claim-1",
      recipientEmail: "rep@example.com",
      recipientName: "Alex",
      productTitle: "Feral Cap",
      epSpent: 1500,
      shippingAddress: baseShipping,
    });
    expect(ok).toBe(false);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("does not stamp the success timestamp when Resend rejects", async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: { message: "rate limited", name: "rate_limit_exceeded" },
    });

    const ok = await sendClaimConfirmation({
      claimId: "claim-1",
      recipientEmail: "rep@example.com",
      recipientName: "Alex",
      productTitle: "Feral Cap",
      epSpent: 1500,
      shippingAddress: baseShipping,
    });

    expect(ok).toBe(false);
    expect(mockClaimUpdate).not.toHaveBeenCalled();
  });
});

describe("sendClaimDispatched", () => {
  it("includes tracking number + URL CTA when available", async () => {
    const ok = await sendClaimDispatched({
      claimId: "claim-1",
      recipientEmail: "rep@example.com",
      recipientName: "Alex",
      productTitle: "Feral Cap",
      variantTitle: "One size",
      trackingNumber: "RM12345GB",
      trackingUrl: "https://track.royalmail.com/RM12345GB",
      trackingCompany: "Royal Mail",
      shippingAddress: baseShipping,
    });

    expect(ok).toBe(true);
    const arg = mockResendSend.mock.calls[0][0];
    expect(arg.subject).toContain("On its way");
    expect(arg.html).toContain("RM12345GB");
    expect(arg.html).toContain("Royal Mail");
    expect(arg.html).toContain("https://track.royalmail.com/RM12345GB");
    expect(arg.html).toContain("Track your order");
    expect(arg.text).toContain("RM12345GB");
  });

  it("omits the CTA gracefully when tracking URL is absent", async () => {
    const ok = await sendClaimDispatched({
      claimId: "claim-1",
      recipientEmail: "rep@example.com",
      recipientName: "Alex",
      productTitle: "Feral Cap",
      trackingNumber: null,
      trackingUrl: null,
      trackingCompany: null,
      shippingAddress: baseShipping,
    });

    expect(ok).toBe(true);
    const arg = mockResendSend.mock.calls[0][0];
    expect(arg.html).not.toContain("Track your order");
  });

  it("is idempotent on dispatch_email_sent_at", async () => {
    mockClaimSelectMaybeSingle.mockResolvedValue({
      data: { dispatch_email_sent_at: "2026-04-29T16:35:00Z" },
      error: null,
    });

    const ok = await sendClaimDispatched({
      claimId: "claim-1",
      recipientEmail: "rep@example.com",
      recipientName: "Alex",
      productTitle: "Feral Cap",
      trackingNumber: "RM12345GB",
      trackingUrl: "https://example.com/track",
      trackingCompany: "Royal Mail",
      shippingAddress: baseShipping,
    });

    expect(ok).toBe(false);
    expect(mockResendSend).not.toHaveBeenCalled();
  });
});
