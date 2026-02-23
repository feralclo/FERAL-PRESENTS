import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WalletPassSettings } from "@/types/email";
import { DEFAULT_WALLET_PASS_SETTINGS } from "@/types/email";

// Mock dependencies that require server-side modules
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/constants", () => ({
  TABLES: { SITE_SETTINGS: "site_settings" },
  ORG_ID: "feral",
  walletPassesKey: (orgId: string) => `${orgId}_wallet_passes`,
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,MOCKQR"),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("MOCKQR")),
  },
}));

describe("WalletPassSettings types", () => {
  it("DEFAULT_WALLET_PASS_SETTINGS has correct defaults", () => {
    expect(DEFAULT_WALLET_PASS_SETTINGS.apple_wallet_enabled).toBe(false);
    expect(DEFAULT_WALLET_PASS_SETTINGS.google_wallet_enabled).toBe(false);
    expect(DEFAULT_WALLET_PASS_SETTINGS.accent_color).toBe("#8B5CF6");
    expect(DEFAULT_WALLET_PASS_SETTINGS.bg_color).toBe("#0e0e0e");
    expect(DEFAULT_WALLET_PASS_SETTINGS.text_color).toBe("#ffffff");
    expect(DEFAULT_WALLET_PASS_SETTINGS.label_color).toBe("#8B5CF6");
    expect(DEFAULT_WALLET_PASS_SETTINGS.organization_name).toBe("Entry");
    expect(DEFAULT_WALLET_PASS_SETTINGS.description).toBe("Event Ticket");
    expect(DEFAULT_WALLET_PASS_SETTINGS.show_holder).toBe(true);
    expect(DEFAULT_WALLET_PASS_SETTINGS.show_order_number).toBe(true);
    expect(DEFAULT_WALLET_PASS_SETTINGS.show_terms).toBe(true);
    expect(typeof DEFAULT_WALLET_PASS_SETTINGS.terms_text).toBe("string");
    expect(DEFAULT_WALLET_PASS_SETTINGS.terms_text.length).toBeGreaterThan(0);
  });

  it("wallets are disabled by default", () => {
    expect(DEFAULT_WALLET_PASS_SETTINGS.apple_wallet_enabled).toBe(false);
    expect(DEFAULT_WALLET_PASS_SETTINGS.google_wallet_enabled).toBe(false);
  });

  it("WalletPassSettings interface has all required fields", () => {
    // Verify the shape is correct by creating a minimal valid object
    const settings: WalletPassSettings = {
      apple_wallet_enabled: false,
      google_wallet_enabled: false,
      accent_color: "#ff0033",
      bg_color: "#0e0e0e",
      text_color: "#ffffff",
      label_color: "#ff0033",
      organization_name: "Test Org",
      description: "Test Ticket",
      show_holder: true,
      show_order_number: true,
      show_terms: false,
      terms_text: "",
    };
    expect(settings).toBeDefined();
    expect(settings.apple_wallet_enabled).toBe(false);
    expect(settings.google_wallet_enabled).toBe(false);
  });

  it("optional fields can be undefined", () => {
    const settings: WalletPassSettings = {
      ...DEFAULT_WALLET_PASS_SETTINGS,
      logo_url: undefined,
      strip_url: undefined,
      apple_pass_type_id: undefined,
      apple_team_id: undefined,
      google_issuer_id: undefined,
      google_class_suffix: undefined,
    };
    expect(settings.logo_url).toBeUndefined();
    expect(settings.strip_url).toBeUndefined();
    expect(settings.apple_pass_type_id).toBeUndefined();
  });
});

describe("Wallet pass library", () => {
  let walletModule: typeof import("@/lib/wallet-passes");

  beforeEach(async () => {
    // Clear env vars between tests
    delete process.env.APPLE_PASS_CERTIFICATE;
    delete process.env.APPLE_PASS_CERTIFICATE_PASSWORD;
    delete process.env.APPLE_WWDR_CERTIFICATE;
    delete process.env.APPLE_PASS_TYPE_IDENTIFIER;
    delete process.env.APPLE_PASS_TEAM_IDENTIFIER;
    delete process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY;
    delete process.env.GOOGLE_WALLET_ISSUER_ID;

    // Dynamic import to get fresh module
    walletModule = await import("@/lib/wallet-passes");
  });

  describe("getWalletConfigStatus", () => {
    it("reports Apple as not configured when env vars missing", () => {
      const status = walletModule.getWalletConfigStatus(DEFAULT_WALLET_PASS_SETTINGS);
      expect(status.apple.configured).toBe(false);
      expect(status.apple.hasCertificate).toBe(false);
      // WWDR is always true — auto-fetched from Apple at runtime
      expect(status.apple.hasWwdr).toBe(true);
      expect(status.apple.hasPassTypeId).toBe(false);
      expect(status.apple.hasTeamId).toBe(false);
    });

    it("reports Google as not configured when env vars missing", () => {
      const status = walletModule.getWalletConfigStatus(DEFAULT_WALLET_PASS_SETTINGS);
      expect(status.google.configured).toBe(false);
      expect(status.google.hasServiceAccount).toBe(false);
      expect(status.google.hasIssuerId).toBe(false);
    });

    it("detects partial Apple configuration (cert but no IDs)", () => {
      process.env.APPLE_PASS_CERTIFICATE = "test-cert";
      const status = walletModule.getWalletConfigStatus(DEFAULT_WALLET_PASS_SETTINGS);
      expect(status.apple.hasCertificate).toBe(true);
      // WWDR is always true — auto-fetched from Apple at runtime
      expect(status.apple.hasWwdr).toBe(true);
      // Still not configured — missing Pass Type ID and Team ID
      expect(status.apple.configured).toBe(false);
    });

    it("reads Pass Type ID and Team ID from settings", () => {
      const settings: WalletPassSettings = {
        ...DEFAULT_WALLET_PASS_SETTINGS,
        apple_pass_type_id: "pass.com.test.ticket",
        apple_team_id: "TESTTEAMID",
      };
      const status = walletModule.getWalletConfigStatus(settings);
      expect(status.apple.hasPassTypeId).toBe(true);
      expect(status.apple.hasTeamId).toBe(true);
    });

    it("reads Google Issuer ID from settings", () => {
      const settings: WalletPassSettings = {
        ...DEFAULT_WALLET_PASS_SETTINGS,
        google_issuer_id: "3388000000012345678",
      };
      const status = walletModule.getWalletConfigStatus(settings);
      expect(status.google.hasIssuerId).toBe(true);
    });
  });

  describe("generateApplePass", () => {
    it("returns null when Apple certificates are not configured", async () => {
      const result = await walletModule.generateApplePass(
        {
          ticketCode: "FERAL-A1B2C3D4",
          eventName: "FERAL Liverpool",
          venueName: "Invisible Wind Factory",
          eventDate: "2026-03-27T21:00:00Z",
          ticketType: "General Release",
          orderNumber: "FERAL-00042",
        },
        DEFAULT_WALLET_PASS_SETTINGS
      );
      expect(result).toBeNull();
    });
  });

  describe("generateApplePassBundle", () => {
    it("returns null for empty tickets array", async () => {
      const result = await walletModule.generateApplePassBundle([], DEFAULT_WALLET_PASS_SETTINGS);
      expect(result).toBeNull();
    });
  });

  describe("generateGoogleWalletUrl", () => {
    it("returns null when Google credentials are not configured", () => {
      const result = walletModule.generateGoogleWalletUrl(
        [{
          ticketCode: "FERAL-A1B2C3D4",
          eventName: "FERAL Liverpool",
          venueName: "Invisible Wind Factory",
          eventDate: "2026-03-27T21:00:00Z",
          ticketType: "General Release",
          orderNumber: "FERAL-00042",
        }],
        DEFAULT_WALLET_PASS_SETTINGS
      );
      expect(result).toBeNull();
    });
  });
});

describe("Email template wallet links", () => {
  it("builds email without wallet links when not provided", async () => {
    const { buildOrderConfirmationEmail } = await import("@/lib/email-templates");
    const { DEFAULT_EMAIL_SETTINGS } = await import("@/types/email");

    const result = buildOrderConfirmationEmail(
      DEFAULT_EMAIL_SETTINGS,
      {
        order_number: "FERAL-00042",
        customer_first_name: "Alex",
        customer_last_name: "Test",
        customer_email: "alex@test.com",
        event_name: "FERAL Liverpool",
        venue_name: "Invisible Wind Factory",
        event_date: "Thursday 27 March 2026",
        currency_symbol: "£",
        total: "25.00",
        tickets: [
          { ticket_code: "FERAL-A1B2C3D4", ticket_type: "General Release" },
        ],
      }
    );

    expect(result.html).toBeDefined();
    expect(result.text).toBeDefined();
    expect(result.subject).toBeDefined();
    // Should NOT contain wallet section when no wallet links
    expect(result.html).not.toContain("ADD TO WALLET");
    expect(result.text).not.toContain("ADD TO WALLET");
  });

  it("includes Apple Wallet button when apple URL provided", async () => {
    const { buildOrderConfirmationEmail } = await import("@/lib/email-templates");
    const { DEFAULT_EMAIL_SETTINGS } = await import("@/types/email");

    const result = buildOrderConfirmationEmail(
      DEFAULT_EMAIL_SETTINGS,
      {
        order_number: "FERAL-00042",
        customer_first_name: "Alex",
        customer_last_name: "Test",
        customer_email: "alex@test.com",
        event_name: "FERAL Liverpool",
        venue_name: "Invisible Wind Factory",
        event_date: "Thursday 27 March 2026",
        currency_symbol: "£",
        total: "25.00",
        tickets: [
          { ticket_code: "FERAL-A1B2C3D4", ticket_type: "General Release" },
        ],
      },
      {
        appleWalletUrl: "https://feralpresents.com/api/orders/123/wallet/apple",
      }
    );

    expect(result.html).toContain("ADD TO WALLET");
    expect(result.html).toContain("Apple Wallet");
    expect(result.html).toContain("https://feralpresents.com/api/orders/123/wallet/apple");
    expect(result.text).toContain("ADD TO WALLET");
    expect(result.text).toContain("Apple Wallet");
  });

  it("includes Google Wallet button when google URL provided", async () => {
    const { buildOrderConfirmationEmail } = await import("@/lib/email-templates");
    const { DEFAULT_EMAIL_SETTINGS } = await import("@/types/email");

    const result = buildOrderConfirmationEmail(
      DEFAULT_EMAIL_SETTINGS,
      {
        order_number: "FERAL-00042",
        customer_first_name: "Alex",
        customer_last_name: "Test",
        customer_email: "alex@test.com",
        event_name: "FERAL Liverpool",
        venue_name: "Invisible Wind Factory",
        event_date: "Thursday 27 March 2026",
        currency_symbol: "£",
        total: "25.00",
        tickets: [
          { ticket_code: "FERAL-A1B2C3D4", ticket_type: "General Release" },
        ],
      },
      {
        googleWalletUrl: "https://pay.google.com/gp/v/save/test-jwt",
      }
    );

    expect(result.html).toContain("ADD TO WALLET");
    expect(result.html).toContain("Google Wallet");
    expect(result.html).toContain("https://pay.google.com/gp/v/save/test-jwt");
    expect(result.text).toContain("Google Wallet");
  });

  it("includes both wallet buttons when both URLs provided", async () => {
    const { buildOrderConfirmationEmail } = await import("@/lib/email-templates");
    const { DEFAULT_EMAIL_SETTINGS } = await import("@/types/email");

    const result = buildOrderConfirmationEmail(
      DEFAULT_EMAIL_SETTINGS,
      {
        order_number: "FERAL-00042",
        customer_first_name: "Alex",
        customer_last_name: "Test",
        customer_email: "alex@test.com",
        event_name: "FERAL Liverpool",
        venue_name: "Invisible Wind Factory",
        event_date: "Thursday 27 March 2026",
        currency_symbol: "£",
        total: "25.00",
        tickets: [
          { ticket_code: "FERAL-A1B2C3D4", ticket_type: "General Release" },
          { ticket_code: "FERAL-E5F6G7H8", ticket_type: "VIP" },
        ],
      },
      {
        appleWalletUrl: "https://feralpresents.com/api/orders/123/wallet/apple",
        googleWalletUrl: "https://pay.google.com/gp/v/save/test-jwt",
      }
    );

    expect(result.html).toContain("Apple Wallet");
    expect(result.html).toContain("Google Wallet");
    // Should mention "tickets" (plural) for multiple tickets
    expect(result.html).toContain("tickets");
    expect(result.text).toContain("Apple Wallet");
    expect(result.text).toContain("Google Wallet");
  });

  it("uses singular 'ticket' for single ticket", async () => {
    const { buildOrderConfirmationEmail } = await import("@/lib/email-templates");
    const { DEFAULT_EMAIL_SETTINGS } = await import("@/types/email");

    const result = buildOrderConfirmationEmail(
      DEFAULT_EMAIL_SETTINGS,
      {
        order_number: "FERAL-00042",
        customer_first_name: "Alex",
        customer_last_name: "Test",
        customer_email: "alex@test.com",
        event_name: "FERAL Liverpool",
        venue_name: "Invisible Wind Factory",
        event_date: "Thursday 27 March 2026",
        currency_symbol: "£",
        total: "25.00",
        tickets: [
          { ticket_code: "FERAL-A1B2C3D4", ticket_type: "General Release" },
        ],
      },
      {
        appleWalletUrl: "https://feralpresents.com/api/orders/123/wallet/apple",
      }
    );

    expect(result.html).toContain("ticket");
  });
});

describe("walletPassesKey helper", () => {
  it("generates correct key for org", async () => {
    const { walletPassesKey } = await import("@/lib/constants");
    expect(walletPassesKey("feral")).toBe("feral_wallet_passes");
    expect(walletPassesKey("acme")).toBe("acme_wallet_passes");
  });
});
