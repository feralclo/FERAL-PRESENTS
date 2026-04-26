import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { syncBrandToWalletPasses } from "@/lib/wallet-passes";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

/**
 * POST /api/branding/sync-wallet
 *
 * Copy the org's main branding (logo, colors, org name) onto its wallet pass
 * settings so Apple/Google passes look like the tenant brand. Doesn't enable
 * wallet passes — that's a separate explicit toggle in /admin/communications.
 *
 * Called from the onboarding wizard's branding section ("Use my brand on
 * wallet passes" toggle) and from the branding settings page.
 */
export async function POST() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    await syncBrandToWalletPasses(auth.orgId);
    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[branding/sync-wallet] error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
