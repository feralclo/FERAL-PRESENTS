/**
 * Pure mapping helper: copy main branding visuals into wallet-pass settings.
 *
 * Lives in its own file (no Supabase / node-forge / crypto imports) so unit
 * tests can exercise it without dragging the whole wallet-passes pipeline —
 * which uses node:crypto and breaks vitest's browser-style resolver.
 *
 * The async writer `syncBrandToWalletPasses(orgId)` lives in wallet-passes.ts.
 */

import type { BrandingSettings } from "@/types/settings";
import type { WalletPassSettings } from "@/types/email";
import { DEFAULT_WALLET_PASS_SETTINGS } from "@/types/email";

/**
 * Map a `BrandingSettings` row onto a `WalletPassSettings` shape.
 * Merges over an existing wallet settings row to preserve tenant-set fields
 * (terms_text, descriptions, enabled toggles, certs).
 */
export function applyBrandingToWalletPasses(
  branding: BrandingSettings,
  existing?: Partial<WalletPassSettings> | null
): WalletPassSettings {
  const base: WalletPassSettings = {
    ...DEFAULT_WALLET_PASS_SETTINGS,
    ...(existing ?? {}),
  };

  return {
    ...base,
    organization_name: branding.org_name || base.organization_name,
    logo_url: branding.logo_url || base.logo_url,
    accent_color: branding.accent_color || base.accent_color,
    label_color: branding.accent_color || base.label_color,
    bg_color: branding.background_color || base.bg_color,
    text_color: branding.text_color || base.text_color,
  };
}
