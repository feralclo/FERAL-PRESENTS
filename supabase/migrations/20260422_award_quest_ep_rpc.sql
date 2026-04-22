-- Atomic double-entry for quest approval:
--   1. Debit tenant float  (-ep_amount)
--   2. Credit rep balance  (+ep_amount)
-- Both inside a single transaction. Function-level transaction in PL/pgSQL
-- means any failure (e.g. insufficient-float check failing) aborts both.

CREATE OR REPLACE FUNCTION public.award_quest_ep(
  p_rep_id UUID,
  p_tenant_org_id TEXT,
  p_ep_amount INT,
  p_quest_submission_id UUID,
  p_fiat_rate_pence INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  float_balance INT;
BEGIN
  IF p_ep_amount <= 0 THEN
    RETURN;  -- no-op for XP-only quests
  END IF;

  -- Verify tenant float covers this award (hard block; soft warnings happen
  -- earlier at quest creation in the admin UI).
  SELECT balance INTO float_balance
  FROM public.ep_tenant_float
  WHERE tenant_org_id = p_tenant_org_id;

  IF COALESCE(float_balance, 0) < p_ep_amount THEN
    RAISE EXCEPTION 'insufficient_float: tenant % has % EP, needs %',
      p_tenant_org_id, COALESCE(float_balance, 0), p_ep_amount
      USING ERRCODE = 'P0001';
  END IF;

  -- Debit tenant float
  INSERT INTO public.ep_ledger (
    entry_type, ep_amount, tenant_org_id,
    quest_submission_id, fiat_rate_pence, notes
  ) VALUES (
    'tenant_quest_debit', p_ep_amount, p_tenant_org_id,
    p_quest_submission_id, p_fiat_rate_pence,
    'Quest approved — EP flowing to rep'
  );

  -- Credit rep balance (trigger updates reps.currency_balance cache)
  INSERT INTO public.ep_ledger (
    entry_type, ep_amount, rep_id, tenant_org_id,
    quest_submission_id, fiat_rate_pence, notes
  ) VALUES (
    'rep_quest_credit', p_ep_amount, p_rep_id, p_tenant_org_id,
    p_quest_submission_id, p_fiat_rate_pence,
    'Quest approved — EP credited'
  );
END;
$$;

COMMENT ON FUNCTION public.award_quest_ep IS
  'Atomic quest EP award — writes tenant_quest_debit + rep_quest_credit ledger entries in one transaction. Raises insufficient_float exception (SQLSTATE P0001) if tenant float is too low.';

-- ---------------------------------------------------------------------------
-- Companion function: reverse a previously-approved quest's EP award.
-- Used if an admin retracts approval, or a submission later turns out to
-- be fraudulent. Inserts the opposite-direction reversal entries.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reverse_quest_ep(
  p_rep_id UUID,
  p_tenant_org_id TEXT,
  p_ep_amount INT,
  p_quest_submission_id UUID,
  p_fiat_rate_pence INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rep_balance INT;
  clawback INT;
  refund INT;
BEGIN
  IF p_ep_amount <= 0 THEN
    RETURN;
  END IF;

  -- How much can we actually claw back from the rep? If they've already
  -- spent some of the EP, the tenant eats the difference — spec §7.4
  -- edge-case "approval reversed after rep spent the EP".
  SELECT balance INTO rep_balance
  FROM public.ep_rep_balances
  WHERE rep_id = p_rep_id;

  clawback := LEAST(p_ep_amount, COALESCE(rep_balance, 0));
  refund := clawback;  -- only the clawback returns to tenant float

  IF clawback > 0 THEN
    INSERT INTO public.ep_ledger (
      entry_type, ep_amount, rep_id, tenant_org_id,
      quest_submission_id, fiat_rate_pence, notes
    ) VALUES (
      'rep_quest_reversal', clawback, p_rep_id, p_tenant_org_id,
      p_quest_submission_id, p_fiat_rate_pence,
      'Quest approval reversed — clawback from rep'
    );

    INSERT INTO public.ep_ledger (
      entry_type, ep_amount, tenant_org_id,
      quest_submission_id, fiat_rate_pence, notes
    ) VALUES (
      'tenant_quest_reversal', refund, p_tenant_org_id,
      p_quest_submission_id, p_fiat_rate_pence,
      'Quest approval reversed — refund to tenant float'
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.reverse_quest_ep IS
  'Reverses a prior quest EP award. Only claws back what the rep still has; if they spent some already, the tenant absorbs the difference (per spec §7.4 edge case).';
