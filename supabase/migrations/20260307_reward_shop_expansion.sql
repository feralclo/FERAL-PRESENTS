-- ============================================================================
-- Reward Shop Expansion Migration
-- 1. Add metadata JSONB to rep_rewards
-- 2. Add metadata JSONB to rep_reward_claims
-- 3. Add customer_id to reps
-- 4. Update claim_reward_atomic RPC (fix currency bug + multi-claim support)
-- 5. Backfill existing reps → customers
-- ============================================================================

-- 1. Add metadata JSONB to rep_rewards
ALTER TABLE rep_rewards ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 2. Add metadata JSONB to rep_reward_claims
ALTER TABLE rep_reward_claims ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 3. Add customer_id to reps
ALTER TABLE reps ADD COLUMN IF NOT EXISTS customer_id UUID;
CREATE INDEX IF NOT EXISTS idx_reps_customer_id ON reps(customer_id);

-- 4. Update claim_reward_atomic RPC
-- Fixes: deducts from currency_balance (FRL) instead of points_balance (XP)
-- Adds: max_claims_per_rep support from reward metadata (default 1 for backward compat)
CREATE OR REPLACE FUNCTION claim_reward_atomic(
  p_rep_id UUID,
  p_org_id TEXT,
  p_reward_id UUID,
  p_points_cost INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rep RECORD;
  v_reward RECORD;
  v_new_currency_balance INTEGER;
  v_claim_id UUID;
  v_existing_claim_count INTEGER;
  v_max_claims INTEGER;
BEGIN
  -- Lock the rep row to prevent concurrent balance modifications
  SELECT id, currency_balance INTO v_rep
  FROM reps
  WHERE id = p_rep_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Rep not found');
  END IF;

  -- Check CURRENCY balance (FRL), not points_balance (XP)
  IF v_rep.currency_balance < p_points_cost THEN
    RETURN jsonb_build_object('error', 'Insufficient balance', 'balance', v_rep.currency_balance);
  END IF;

  -- Lock the reward row to prevent concurrent claims exceeding availability
  SELECT id, total_available, total_claimed, status, name, metadata INTO v_reward
  FROM rep_rewards
  WHERE id = p_reward_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Reward not found');
  END IF;

  IF v_reward.status != 'active' THEN
    RETURN jsonb_build_object('error', 'Reward is not active');
  END IF;

  IF v_reward.total_available IS NOT NULL AND v_reward.total_claimed >= v_reward.total_available THEN
    RETURN jsonb_build_object('error', 'Reward is sold out');
  END IF;

  -- Multi-claim support: check max_claims_per_rep from metadata (default 1 for backward compat)
  v_max_claims := COALESCE((v_reward.metadata->>'max_claims_per_rep')::INTEGER, 1);

  -- Count existing active claims for this rep + reward
  SELECT COUNT(*) INTO v_existing_claim_count
  FROM rep_reward_claims
  WHERE rep_id = p_rep_id
    AND reward_id = p_reward_id
    AND org_id = p_org_id
    AND claim_type = 'points_shop'
    AND status != 'cancelled';

  -- v_max_claims = 0 or NULL in metadata means unlimited; positive integer = limit
  IF v_max_claims > 0 AND v_existing_claim_count >= v_max_claims THEN
    RETURN jsonb_build_object('error', 'Already claimed');
  END IF;

  -- Calculate new CURRENCY balance
  v_new_currency_balance := v_rep.currency_balance - p_points_cost;

  -- Insert points ledger entry (currency deduction, 0 XP change)
  INSERT INTO rep_points_log (org_id, rep_id, points, balance_after, currency_amount, currency_balance_after, source_type, source_id, description)
  VALUES (p_org_id, p_rep_id, 0, (SELECT points_balance FROM reps WHERE id = p_rep_id AND org_id = p_org_id),
          -p_points_cost, v_new_currency_balance, 'reward_spend', p_reward_id,
          'Claimed reward: ' || v_reward.name);

  -- Update rep currency balance (XP unchanged)
  UPDATE reps
  SET currency_balance = v_new_currency_balance, updated_at = NOW()
  WHERE id = p_rep_id AND org_id = p_org_id;

  -- Create claim row
  INSERT INTO rep_reward_claims (org_id, rep_id, reward_id, claim_type, points_spent, status)
  VALUES (p_org_id, p_rep_id, p_reward_id, 'points_shop', p_points_cost, 'claimed')
  RETURNING id INTO v_claim_id;

  -- Increment total_claimed on reward
  UPDATE rep_rewards
  SET total_claimed = total_claimed + 1
  WHERE id = p_reward_id AND org_id = p_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', v_claim_id,
    'new_balance', v_new_currency_balance
  );
END;
$$;

-- 5. Backfill existing reps → customers by matching (org_id, email)
UPDATE reps r SET customer_id = c.id
FROM customers c
WHERE r.org_id = c.org_id AND lower(r.email) = lower(c.email)
AND r.customer_id IS NULL;
