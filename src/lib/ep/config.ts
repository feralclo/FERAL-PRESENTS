/**
 * EP economy config loader — single cached read per request of the
 * platform_ep_config singleton.
 *
 * Values are slow-moving (fiat rate, platform cut, min payout) so we cache
 * in-memory with a short TTL to avoid hammering the DB on every ledger write.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type EpConfig = {
  fiat_rate_pence: number; // e.g. 1 (1 EP = 1p)
  platform_cut_bps: number; // e.g. 1000 (10%)
  min_payout_pence: number;
  refund_window_days: number;
  default_bonus_ep_per_quest: number;
};

const DEFAULTS: EpConfig = {
  fiat_rate_pence: 1,
  platform_cut_bps: 1000,
  min_payout_pence: 5000,
  refund_window_days: 90,
  default_bonus_ep_per_quest: 0,
};

// 60-second TTL — config changes (via platform-owner UI) propagate in ≤1 min.
let cached: { value: EpConfig; expires_at: number } | null = null;
const TTL_MS = 60_000;

export async function getEpConfig(): Promise<EpConfig> {
  if (cached && cached.expires_at > Date.now()) {
    return cached.value;
  }

  const db = await getSupabaseAdmin();
  if (!db) return DEFAULTS;

  const { data } = await db
    .from("platform_ep_config")
    .select(
      "fiat_rate_pence, platform_cut_bps, min_payout_pence, refund_window_days, default_bonus_ep_per_quest"
    )
    .eq("id", 1)
    .single();

  const value: EpConfig = data
    ? {
        fiat_rate_pence: data.fiat_rate_pence ?? DEFAULTS.fiat_rate_pence,
        platform_cut_bps: data.platform_cut_bps ?? DEFAULTS.platform_cut_bps,
        min_payout_pence: data.min_payout_pence ?? DEFAULTS.min_payout_pence,
        refund_window_days:
          data.refund_window_days ?? DEFAULTS.refund_window_days,
        default_bonus_ep_per_quest:
          data.default_bonus_ep_per_quest ??
          DEFAULTS.default_bonus_ep_per_quest,
      }
    : DEFAULTS;

  cached = { value, expires_at: Date.now() + TTL_MS };
  return value;
}

/** Compute fiat pence equivalent of an EP amount at a given rate. */
export function epToPence(ep: number, ratePence: number): number {
  return Math.round(ep * ratePence);
}
