-- ep_ledger.reward_claim_id has an FK to rep_reward_claims (tenant shops).
-- Market redemptions point at a different table (platform_market_claims),
-- so they need their own linkage column.

ALTER TABLE public.ep_ledger
  ADD COLUMN IF NOT EXISTS market_claim_id uuid
    REFERENCES public.platform_market_claims(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS ep_ledger_market_claim_idx
  ON public.ep_ledger(market_claim_id)
  WHERE market_claim_id IS NOT NULL;

-- RPC rewrites to use market_claim_id live in
-- 20260424_market_parent_variants.sql (that one re-runs after this on a
-- fresh apply). This migration is kept minimal so the column/index lands
-- even if the claim RPC version lags behind the rebuild.
