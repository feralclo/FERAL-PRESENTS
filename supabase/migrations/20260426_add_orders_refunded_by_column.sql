-- Refunder identity at the schema level for clean reporting.
--
-- Was: stored in orders.metadata->>'refunded_by' as JSONB. Works, but
-- makes 'who refunded the most this month' queries needlessly painful
-- and prevents indexing or FK constraints.
--
-- The column is nullable because:
--   - existing refunds (pre this column) won't have it set
--   - webhook-initiated refunds (Stripe Dashboard) have no admin user —
--     applyRefundSideEffects() passes adminUserId: null in that case
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refunded_by uuid;

COMMENT ON COLUMN orders.refunded_by IS
  'auth.users.id of the admin who issued the refund. NULL for webhook-initiated refunds (Stripe Dashboard, etc.) and for refunds that pre-date this column.';
