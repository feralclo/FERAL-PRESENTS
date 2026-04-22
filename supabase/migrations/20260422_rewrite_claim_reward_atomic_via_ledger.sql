-- Phase 3.7: rewrite claim_reward_atomic to go through the EP ledger
-- instead of directly mutating reps.currency_balance. The ledger trigger
-- (ep_ledger_rep_cache_sync) maintains the cache on rep_shop_debit inserts,
-- so any direct balance UPDATE here would double-count.
--
-- Key changes from the v1 RPC:
--   • Balance check reads from ep_rep_balances view (canonical) not the
--     reps.currency_balance cache (cache could drift; view is source of truth).
--   • Writes a rep_shop_debit ledger entry — one row affects BOTH the rep
--     (−ep_amount) AND the tenant_earned pot (+ep_amount).
--   • Populates the new rep_reward_claims.ep_spent column alongside legacy
--     points_spent.
--   • Uses claim_type='shop' (renamed from 'points_shop' in Phase 3.2).
--   • Decrements the new stock column, with fallback to total_available
--     for rewards that haven't been migrated yet.

CREATE OR REPLACE FUNCTION public.claim_reward_atomic(
  p_rep_id uuid,
  p_org_id text,
  p_reward_id uuid,
  p_points_cost integer  -- name kept for backwards-compat with callers; semantic = ep amount
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reward RECORD;
  v_rep_balance INTEGER;
  v_new_balance INTEGER;
  v_claim_id UUID;
  v_existing_claim_count INTEGER;
  v_max_claims INTEGER;
  v_fiat_rate INTEGER;
  v_stock_remaining INTEGER;
BEGIN
  -- Lock the rep row to serialise concurrent claims for the same rep.
  -- We read the cache + then cross-check with the ledger view below.
  PERFORM 1 FROM reps WHERE id = p_rep_id AND org_id = p_org_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Rep not found');
  END IF;

  -- Canonical balance comes from the ledger, not the cache.
  SELECT balance INTO v_rep_balance
  FROM ep_rep_balances
  WHERE rep_id = p_rep_id;
  v_rep_balance := COALESCE(v_rep_balance, 0);

  IF v_rep_balance < p_points_cost THEN
    RETURN jsonb_build_object('error', 'Insufficient balance', 'balance', v_rep_balance);
  END IF;

  -- Lock the reward row to serialise concurrent claims for limited stock.
  SELECT id, ep_cost, points_cost, total_available, total_claimed, stock, status, name, metadata, fulfillment_kind
  INTO v_reward
  FROM rep_rewards
  WHERE id = p_reward_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Reward not found');
  END IF;

  IF v_reward.status != 'active' THEN
    RETURN jsonb_build_object('error', 'Reward is not active');
  END IF;

  -- Stock check: prefer the new stock column, fall back to total_available
  -- for rewards not yet migrated to the new schema.
  IF v_reward.stock IS NOT NULL THEN
    IF v_reward.stock <= 0 THEN
      RETURN jsonb_build_object('error', 'Reward is sold out');
    END IF;
  ELSIF v_reward.total_available IS NOT NULL
    AND v_reward.total_claimed >= v_reward.total_available THEN
    RETURN jsonb_build_object('error', 'Reward is sold out');
  END IF;

  -- Multi-claim-per-rep cap (default 1 for backwards compat; metadata can widen)
  v_max_claims := COALESCE((v_reward.metadata->>'max_claims_per_rep')::INTEGER, 1);

  SELECT COUNT(*) INTO v_existing_claim_count
  FROM rep_reward_claims
  WHERE rep_id = p_rep_id
    AND reward_id = p_reward_id
    AND org_id = p_org_id
    AND claim_type = 'shop'
    AND status NOT IN ('cancelled', 'failed');

  IF v_max_claims > 0 AND v_existing_claim_count >= v_max_claims THEN
    RETURN jsonb_build_object('error', 'Already claimed');
  END IF;

  v_new_balance := v_rep_balance - p_points_cost;

  -- Snapshot the current EP-to-fiat rate for the ledger entry.
  SELECT fiat_rate_pence INTO v_fiat_rate FROM platform_ep_config WHERE id = 1;
  v_fiat_rate := COALESCE(v_fiat_rate, 1);

  -- Create the claim row first so we can reference it from the ledger entry.
  INSERT INTO rep_reward_claims (
    org_id, rep_id, reward_id, claim_type,
    points_spent, ep_spent, status
  )
  VALUES (
    p_org_id, p_rep_id, p_reward_id, 'shop',
    p_points_cost, p_points_cost, 'claimed'
  )
  RETURNING id INTO v_claim_id;

  -- Write the single rep_shop_debit ledger entry. Trigger
  -- ep_ledger_rep_cache_sync adjusts reps.currency_balance by -p_points_cost.
  -- This same row also credits the tenant's earned pot (via the SUM(CASE)
  -- expression in ep_tenant_earned view).
  INSERT INTO ep_ledger (
    entry_type, ep_amount,
    rep_id, tenant_org_id,
    reward_claim_id, fiat_rate_pence,
    notes
  )
  VALUES (
    'rep_shop_debit', p_points_cost,
    p_rep_id, p_org_id,
    v_claim_id, v_fiat_rate,
    'Reward claim: ' || v_reward.name
  );

  -- Legacy rep_points_log entry so v1 web rep-portal reports still show it.
  -- Writes currency_balance_after using the new cached value.
  INSERT INTO rep_points_log (
    org_id, rep_id, points, balance_after,
    currency_amount, currency_balance_after,
    source_type, source_id, description
  )
  VALUES (
    p_org_id, p_rep_id, 0,
    (SELECT points_balance FROM reps WHERE id = p_rep_id AND org_id = p_org_id),
    -p_points_cost, v_new_balance,
    'reward_spend', p_reward_id,
    'Claimed reward: ' || v_reward.name
  );

  -- Stock bookkeeping — decrement new stock col AND bump legacy total_claimed
  -- so both read paths stay correct.
  IF v_reward.stock IS NOT NULL THEN
    v_stock_remaining := v_reward.stock - 1;
    UPDATE rep_rewards
    SET stock = v_stock_remaining,
        total_claimed = COALESCE(total_claimed, 0) + 1
    WHERE id = p_reward_id AND org_id = p_org_id;
  ELSE
    UPDATE rep_rewards
    SET total_claimed = COALESCE(total_claimed, 0) + 1
    WHERE id = p_reward_id AND org_id = p_org_id;
    v_stock_remaining := NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', v_claim_id,
    'new_balance', v_new_balance,
    'stock_remaining', v_stock_remaining
  );
END;
$$;

-- Companion: cancel a claim and refund via ledger reversal (instead of
-- direct balance mutation). Called from cancelClaimAndRefund() in
-- lib/rep-reward-fulfillment.ts when synchronous fulfillment fails.
CREATE OR REPLACE FUNCTION public.cancel_claim_and_refund(
  p_claim_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claim RECORD;
  v_fiat_rate INTEGER;
BEGIN
  SELECT id, org_id, rep_id, reward_id, ep_spent, points_spent, status
  INTO v_claim
  FROM rep_reward_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Claim not found');
  END IF;

  IF v_claim.status IN ('cancelled', 'failed') THEN
    RETURN jsonb_build_object('error', 'Already cancelled');
  END IF;

  SELECT fiat_rate_pence INTO v_fiat_rate FROM platform_ep_config WHERE id = 1;
  v_fiat_rate := COALESCE(v_fiat_rate, 1);

  -- Reversal ledger entry — +rep balance, -tenant earned
  INSERT INTO ep_ledger (
    entry_type, ep_amount,
    rep_id, tenant_org_id,
    reward_claim_id, fiat_rate_pence,
    notes
  )
  VALUES (
    'rep_shop_reversal',
    COALESCE(v_claim.ep_spent, v_claim.points_spent),
    v_claim.rep_id, v_claim.org_id,
    v_claim.id, v_fiat_rate,
    'Claim cancelled: ' || p_reason
  );

  UPDATE rep_reward_claims
  SET status = 'cancelled',
      notes = p_reason
  WHERE id = p_claim_id;

  -- Restore stock
  UPDATE rep_rewards
  SET stock = CASE WHEN stock IS NOT NULL THEN stock + 1 ELSE stock END,
      total_claimed = GREATEST(COALESCE(total_claimed, 0) - 1, 0)
  WHERE id = v_claim.reward_id AND org_id = v_claim.org_id;

  RETURN jsonb_build_object('success', true, 'claim_id', p_claim_id);
END;
$$;

COMMENT ON FUNCTION public.claim_reward_atomic IS
  'Atomic reward claim: locks rep + reward, verifies ledger balance, writes rep_shop_debit ledger entry (trigger updates cache), creates claim row. Stock decremented transactionally.';

COMMENT ON FUNCTION public.cancel_claim_and_refund IS
  'Reverses a reward claim: writes rep_shop_reversal ledger entry, restores stock, marks claim cancelled. Used by fulfillment failure path.';
