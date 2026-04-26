-- Atomic discount used_count decrement, floored at zero.
--
-- Mirror of increment_discount_used() but for refunds. Limited-use codes
-- (e.g. max_uses: 50) need to recover their slot when an order using them
-- is refunded — otherwise the counter ratchets up and tenants run out of
-- slots they shouldn't have lost.
--
-- Floored at zero defensively: if app code somehow calls this twice for
-- the same refund, used_count won't go negative.
CREATE OR REPLACE FUNCTION public.decrement_discount_used(
  p_code text,
  p_org_id text
)
RETURNS integer
LANGUAGE sql
AS $$
  UPDATE discounts
  SET used_count = GREATEST(0, used_count - 1),
      updated_at = NOW()
  WHERE code ILIKE p_code
    AND org_id = p_org_id
  RETURNING used_count;
$$;
