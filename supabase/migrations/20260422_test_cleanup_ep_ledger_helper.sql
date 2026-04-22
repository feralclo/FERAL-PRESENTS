-- Test-only helper: allow integration tests to reset ep_ledger rows scoped
-- to the integration test org. Guard rails:
--   • hard-coded tenant_org_id parameter — can't wipe anything else
--   • refuses unless p_tenant_org_id starts with '__test_' — extra insurance
--     against accidental use against a real org
--   • bypasses the append-only trigger for the duration of the DELETE only
--
-- This is loaded in the test DB. The RPC exists in production too but the
-- guard rail makes it harmless — calling it with a non-test org is a no-op.

CREATE OR REPLACE FUNCTION public.test_cleanup_ep_ledger(p_tenant_org_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Refuse to run against any org that isn't clearly a test sandbox.
  IF p_tenant_org_id IS NULL OR p_tenant_org_id NOT LIKE '\_\_test%' ESCAPE '\' THEN
    RAISE EXCEPTION 'test_cleanup_ep_ledger refused: % is not a test org', p_tenant_org_id;
  END IF;

  -- Also clean up related rep balances in the cache so the next test sees
  -- a clean slate (ledger DELETE doesn't fire the rep_cache_sync trigger).
  -- Do this BEFORE disabling the trigger so it actually runs.
  UPDATE public.reps
  SET currency_balance = 0
  WHERE org_id = p_tenant_org_id
    AND currency_balance <> 0;

  -- Temporarily disable append-only guard so we can wipe test rows.
  ALTER TABLE public.ep_ledger DISABLE TRIGGER ep_ledger_no_delete;
  ALTER TABLE public.ep_ledger DISABLE TRIGGER ep_ledger_no_update;

  BEGIN
    DELETE FROM public.ep_ledger
    WHERE tenant_org_id = p_tenant_org_id
       OR rep_id IN (SELECT id FROM public.reps WHERE org_id = p_tenant_org_id);
  EXCEPTION WHEN OTHERS THEN
    -- Ensure we ALWAYS re-enable the trigger, even on error
    ALTER TABLE public.ep_ledger ENABLE TRIGGER ep_ledger_no_delete;
    ALTER TABLE public.ep_ledger ENABLE TRIGGER ep_ledger_no_update;
    RAISE;
  END;

  ALTER TABLE public.ep_ledger ENABLE TRIGGER ep_ledger_no_delete;
  ALTER TABLE public.ep_ledger ENABLE TRIGGER ep_ledger_no_update;
END;
$$;

COMMENT ON FUNCTION public.test_cleanup_ep_ledger IS
  'TEST ONLY: wipes ep_ledger rows for a test-org tenant. Hard-refuses non-__test orgs.';
