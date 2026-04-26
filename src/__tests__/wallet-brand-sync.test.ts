import { describe, it, expect } from "vitest";
import { applyBrandingToWalletPasses } from "@/lib/wallet-brand-sync";
import type { BrandingSettings } from "@/types/settings";
import type { WalletPassSettings } from "@/types/email";

describe("applyBrandingToWalletPasses", () => {
  it("copies org_name, logo, and colors from branding", () => {
    const branding: BrandingSettings = {
      org_name: "ACME Events",
      logo_url: "https://example.com/logo.png",
      accent_color: "#FF0066",
      background_color: "#000000",
      text_color: "#FFFFFF",
    };
    const result = applyBrandingToWalletPasses(branding);

    expect(result.organization_name).toBe("ACME Events");
    expect(result.logo_url).toBe("https://example.com/logo.png");
    expect(result.accent_color).toBe("#FF0066");
    expect(result.label_color).toBe("#FF0066"); // mirrors accent
    expect(result.bg_color).toBe("#000000");
    expect(result.text_color).toBe("#FFFFFF");
  });

  it("preserves existing tenant-set fields (terms, enabled toggles, certs)", () => {
    const branding: BrandingSettings = {
      org_name: "ACME",
      accent_color: "#FF0066",
    };
    const existing: Partial<WalletPassSettings> = {
      apple_wallet_enabled: true,
      google_wallet_enabled: true,
      terms_text: "Custom terms text from tenant",
      apple_pass_type_id: "pass.com.acme.ticket",
      apple_team_id: "TEAM123",
      description: "Custom event ticket",
    };
    const result = applyBrandingToWalletPasses(branding, existing);

    expect(result.apple_wallet_enabled).toBe(true);
    expect(result.google_wallet_enabled).toBe(true);
    expect(result.terms_text).toBe("Custom terms text from tenant");
    expect(result.apple_pass_type_id).toBe("pass.com.acme.ticket");
    expect(result.apple_team_id).toBe("TEAM123");
    expect(result.description).toBe("Custom event ticket");
  });

  it("falls back to defaults when branding fields are missing", () => {
    const branding: BrandingSettings = {};
    const result = applyBrandingToWalletPasses(branding);

    expect(result.organization_name).toBe("Entry"); // DEFAULT_WALLET_PASS_SETTINGS
    expect(result.accent_color).toBe("#8B5CF6");
    expect(result.bg_color).toBe("#0e0e0e");
  });

  it("does not enable wallet passes (sync is visual-only)", () => {
    const branding: BrandingSettings = { org_name: "ACME" };
    const result = applyBrandingToWalletPasses(branding);

    expect(result.apple_wallet_enabled).toBe(false);
    expect(result.google_wallet_enabled).toBe(false);
  });
});
