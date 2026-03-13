-- Atomic increment of discount used_count.
-- Prevents race conditions where two concurrent checkouts both read the same
-- used_count and only increment by 1 instead of 2.
-- Returns the new used_count so the caller can verify it didn't exceed max_uses.
CREATE OR REPLACE FUNCTION increment_discount_used(
  p_code TEXT,
  p_org_id TEXT
)
RETURNS INT
LANGUAGE sql
AS $$
  UPDATE discounts
  SET used_count = used_count + 1,
      updated_at = NOW()
  WHERE code ILIKE p_code
    AND org_id = p_org_id
  RETURNING used_count;
$$;
