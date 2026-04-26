-- Atomic ticket-type sold decrement with floor at zero.
--
-- Mirror of increment_sold() but for refunds. Read-then-write in app code
-- is racy at scale (concurrent purchase + refund can lose decrements);
-- this keeps the operation atomic at the DB level, and GREATEST(0, ...)
-- protects against any prior corruption pushing sold negative.
CREATE OR REPLACE FUNCTION public.decrement_sold(
  p_ticket_type_id uuid,
  p_qty integer
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE ticket_types
  SET sold = GREATEST(0, COALESCE(sold, 0) - p_qty),
      updated_at = NOW()
  WHERE id = p_ticket_type_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;
