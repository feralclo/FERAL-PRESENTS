import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getWalletConfigStatus } from "@/lib/wallet-passes";
import type { WalletPassSettings } from "@/types/email";
import { DEFAULT_WALLET_PASS_SETTINGS } from "@/types/email";

/**
 * GET /api/wallet/status — Check wallet provider configuration status
 *
 * Protected endpoint — admin only.
 * Returns which providers are configured and what's missing.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    let walletSettings: WalletPassSettings = { ...DEFAULT_WALLET_PASS_SETTINGS };
    try {
      const supabase = await getSupabaseAdmin();
      if (supabase) {
        const { data: settingsRow } = await supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", `${orgId}_wallet_passes`)
          .single();
        if (settingsRow?.data && typeof settingsRow.data === "object") {
          walletSettings = { ...DEFAULT_WALLET_PASS_SETTINGS, ...(settingsRow.data as Partial<WalletPassSettings>) };
        }
      }
    } catch { /* use defaults */ }

    const status = getWalletConfigStatus(walletSettings);

    return NextResponse.json({
      ...status,
      settings: {
        apple_wallet_enabled: walletSettings.apple_wallet_enabled,
        google_wallet_enabled: walletSettings.google_wallet_enabled,
      },
    });
  } catch (err) {
    console.error("[wallet/status] Error:", err);
    return NextResponse.json({ error: "Failed to check wallet status" }, { status: 500 });
  }
}
