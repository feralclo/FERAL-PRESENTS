-- Pre-ledger genesis: any existing reps.currency_balance > 0 was set
-- directly before the ledger existed. Preserve that balance by writing a
-- one-time platform_bonus entry so the ledger-view matches the cache going
-- forward.
--
-- Done atomically: zero the cache first, then let the insert trigger
-- restore it — keeps the cache-vs-view invariant intact with no manual
-- dual-write.

DO $$
BEGIN
  -- Snapshot
  CREATE TEMP TABLE _preledger_snapshot ON COMMIT DROP AS
  SELECT id, currency_balance
  FROM public.reps
  WHERE currency_balance > 0;

  -- Zero out (trigger will restore via the insert below)
  UPDATE public.reps
  SET currency_balance = 0
  WHERE id IN (SELECT id FROM _preledger_snapshot);

  -- Insert genesis ledger entries; trigger rebuilds currency_balance.
  INSERT INTO public.ep_ledger (entry_type, ep_amount, rep_id, fiat_rate_pence, notes)
  SELECT
    'platform_bonus',
    s.currency_balance,
    s.id,
    (SELECT fiat_rate_pence FROM public.platform_ep_config WHERE id = 1),
    'Pre-ledger genesis — balance migrated from reps.currency_balance at 2026-04-22 EP launch.'
  FROM _preledger_snapshot s;
END $$;

-- Post-condition: drift view should be empty
DO $$
DECLARE drift_count INT;
BEGIN
  SELECT COUNT(*) INTO drift_count FROM public.ep_rep_balance_drift;
  IF drift_count > 0 THEN
    RAISE EXCEPTION 'Post-migration drift: % rows. Ledger does not match reps.currency_balance.', drift_count;
  END IF;
END $$;
