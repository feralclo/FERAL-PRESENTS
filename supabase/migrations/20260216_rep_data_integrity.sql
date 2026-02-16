-- ============================================================================
-- Rep Data Integrity Migration
-- 1. Ensure refund is in rep_points_log source_type CHECK constraint
-- 2. Atomic reward claim RPC (deduct points + create claim in one transaction)
-- 3. Unique constraint on quest submissions to prevent duplicates
-- ============================================================================

-- 1. Update CHECK constraint on rep_points_log.source_type to include 'refund'
-- Drop existing constraint if it exists and re-create with all valid types
DO $$
BEGIN
  -- Try to drop existing constraint (may have different names depending on creation)
  BEGIN
    ALTER TABLE rep_points_log DROP CONSTRAINT IF EXISTS rep_points_log_source_type_check;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  BEGIN
    ALTER TABLE rep_points_log DROP CONSTRAINT IF EXISTS check_source_type;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END $$;

ALTER TABLE rep_points_log ADD CONSTRAINT rep_points_log_source_type_check
  CHECK (source_type IN ('sale', 'quest', 'manual', 'reward_spend', 'revocation', 'refund'));


-- 2. Atomic reward claim RPC: deduct points + create claim in single transaction
-- Prevents race conditions where points are deducted but claim insert fails
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
  v_new_balance INTEGER;
  v_claim_id UUID;
  v_existing_claim UUID;
BEGIN
  -- Lock the rep row to prevent concurrent balance modifications
  SELECT id, points_balance INTO v_rep
  FROM reps
  WHERE id = p_rep_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Rep not found');
  END IF;

  IF v_rep.points_balance < p_points_cost THEN
    RETURN jsonb_build_object('error', 'Insufficient points', 'balance', v_rep.points_balance);
  END IF;

  -- Lock the reward row to prevent concurrent claims exceeding availability
  SELECT id, total_available, total_claimed, status, name INTO v_reward
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

  -- Check for existing active claim
  SELECT id INTO v_existing_claim
  FROM rep_reward_claims
  WHERE rep_id = p_rep_id
    AND reward_id = p_reward_id
    AND org_id = p_org_id
    AND claim_type = 'points_shop'
    AND status != 'cancelled'
  LIMIT 1;

  IF v_existing_claim IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Already claimed');
  END IF;

  -- Calculate new balance
  v_new_balance := v_rep.points_balance - p_points_cost;

  -- Insert points ledger entry
  INSERT INTO rep_points_log (org_id, rep_id, points, balance_after, source_type, source_id, description)
  VALUES (p_org_id, p_rep_id, -p_points_cost, v_new_balance, 'reward_spend', p_reward_id,
          'Claimed reward: ' || v_reward.name);

  -- Update rep balance
  UPDATE reps
  SET points_balance = v_new_balance, updated_at = NOW()
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
    'new_balance', v_new_balance
  );
END;
$$;


-- 3. Unique partial index on quest submissions to prevent duplicate pending/approved submissions
-- for the same rep + quest (allows re-submission after rejection)
CREATE UNIQUE INDEX IF NOT EXISTS uq_rep_quest_pending_approved
  ON rep_quest_submissions (rep_id, quest_id)
  WHERE status IN ('pending', 'approved');


-- 4. Reverse rep attribution RPC: atomically reverses all rep stats for a refunded order
CREATE OR REPLACE FUNCTION reverse_rep_attribution(
  p_order_id UUID,
  p_org_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_rep_id UUID;
  v_points_awarded INTEGER;
  v_rep RECORD;
  v_new_balance INTEGER;
  v_ticket_count INTEGER;
  v_order_total NUMERIC;
  v_rep_event RECORD;
BEGIN
  -- Get order metadata
  SELECT id, metadata, event_id, total INTO v_order
  FROM orders
  WHERE id = p_order_id AND org_id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  -- Extract rep_id from metadata
  v_rep_id := (v_order.metadata->>'rep_id')::UUID;
  IF v_rep_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'No rep attribution');
  END IF;

  -- Check if already reversed (look for existing refund log entry for this order)
  IF EXISTS (
    SELECT 1 FROM rep_points_log
    WHERE source_id = p_order_id
      AND source_type = 'refund'
      AND org_id = p_org_id
      AND rep_id = v_rep_id
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'Already reversed');
  END IF;

  -- Get points originally awarded
  v_points_awarded := COALESCE((v_order.metadata->>'rep_points_awarded')::INTEGER, 0);
  IF v_points_awarded = 0 THEN
    -- Fallback: look up the original sale log entry
    SELECT points INTO v_points_awarded
    FROM rep_points_log
    WHERE source_id = p_order_id
      AND source_type = 'sale'
      AND org_id = p_org_id
      AND rep_id = v_rep_id
    LIMIT 1;

    v_points_awarded := COALESCE(v_points_awarded, 0);
  END IF;

  -- Get ticket count from order items
  SELECT COALESCE(SUM(qty), 0) INTO v_ticket_count
  FROM order_items
  WHERE order_id = p_order_id;

  v_order_total := v_order.total;

  -- Lock the rep row
  SELECT id, points_balance, total_sales, total_revenue INTO v_rep
  FROM reps
  WHERE id = v_rep_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Rep not found');
  END IF;

  -- Deduct points
  v_new_balance := GREATEST(0, v_rep.points_balance - v_points_awarded);

  -- Insert refund ledger entry
  INSERT INTO rep_points_log (org_id, rep_id, points, balance_after, source_type, source_id, description)
  VALUES (p_org_id, v_rep_id, -v_points_awarded, v_new_balance, 'refund', p_order_id,
          'Refund: order refunded (' || v_ticket_count || ' ticket' ||
          CASE WHEN v_ticket_count != 1 THEN 's' ELSE '' END || ')');

  -- Update rep totals
  UPDATE reps
  SET points_balance = v_new_balance,
      total_sales = GREATEST(0, total_sales - v_ticket_count),
      total_revenue = GREATEST(0, total_revenue - v_order_total),
      updated_at = NOW()
  WHERE id = v_rep_id AND org_id = p_org_id;

  -- Update rep_events stats if assignment exists
  SELECT id, sales_count, revenue INTO v_rep_event
  FROM rep_events
  WHERE rep_id = v_rep_id
    AND event_id = v_order.event_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE rep_events
    SET sales_count = GREATEST(0, v_rep_event.sales_count - v_ticket_count),
        revenue = GREATEST(0, v_rep_event.revenue - v_order_total)
    WHERE id = v_rep_event.id AND org_id = p_org_id;
  END IF;

  -- Recalculate level (same logic as calculateLevel in TypeScript)
  -- We don't do this in SQL because level thresholds are in site_settings JSON
  -- The caller should recalculate level after this RPC

  RETURN jsonb_build_object(
    'success', true,
    'rep_id', v_rep_id,
    'points_deducted', v_points_awarded,
    'new_balance', v_new_balance,
    'sales_reversed', v_ticket_count,
    'revenue_reversed', v_order_total
  );
END;
$$;


-- 5. Aggregate function for rep program stats (avoids fetching all rows client-side)
CREATE OR REPLACE FUNCTION get_rep_program_stats(p_org_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_total_reps BIGINT;
  v_active_reps BIGINT;
  v_pending BIGINT;
  v_total_sales BIGINT;
  v_total_revenue NUMERIC;
  v_active_quests BIGINT;
  v_pending_submissions BIGINT;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status = 'active'),
         COUNT(*) FILTER (WHERE status = 'pending'),
         COALESCE(SUM(total_sales), 0),
         COALESCE(SUM(total_revenue), 0)
  INTO v_total_reps, v_active_reps, v_pending, v_total_sales, v_total_revenue
  FROM reps
  WHERE org_id = p_org_id;

  SELECT COUNT(*) INTO v_active_quests
  FROM rep_quests
  WHERE org_id = p_org_id AND status = 'active';

  SELECT COUNT(*) INTO v_pending_submissions
  FROM rep_quest_submissions
  WHERE org_id = p_org_id AND status = 'pending';

  RETURN jsonb_build_object(
    'total_reps', v_total_reps,
    'active_reps', v_active_reps,
    'pending_applications', v_pending,
    'total_sales_via_reps', v_total_sales,
    'total_revenue_via_reps', v_total_revenue,
    'active_quests', v_active_quests,
    'pending_submissions', v_pending_submissions
  );
END;
$$;
