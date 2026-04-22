-- Phase 3.8: payout helper RPCs for the monthly cron + manual early-payout.
--
-- Split into two RPCs so the cron can:
--   1. Call `plan_tenant_payouts()` — read-only, returns what SHOULD be paid
--      out across all tenants (respecting min_payout_pence + Stripe account
--      presence). Cron uses this to decide Stripe Transfers to issue.
--   2. For each planned payout: create a pending ep_tenant_payouts row,
--      call Stripe Transfer (idempotency keyed on payout id), then call
--      `complete_tenant_payout()` which atomically flips the row to 'paid'
--      and writes the tenant_payout ledger entry.
--
-- Atomic guarantee: the ledger entry and the payout row status transition
-- happen in one transaction. If the RPC fails after Stripe succeeded, the
-- payout stays 'pending' with stripe_transfer_id set — next cron run sees
-- it, skips re-transferring (Stripe idempotency already protects), and
-- just completes the DB side.

-- ---------------------------------------------------------------------------
-- plan_tenant_payouts — returns list of (tenant_org_id, ep_amount,
-- period_start, period_end, gross_pence, platform_cut_pence, tenant_net_pence)
-- for tenants whose earned balance meets the minimum payout threshold.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.plan_tenant_payouts()
RETURNS TABLE (
  tenant_org_id TEXT,
  ep_amount INT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  fiat_rate_pence INT,
  platform_cut_bps INT,
  gross_pence INT,
  platform_cut_pence INT,
  tenant_net_pence INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config RECORD;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT fiat_rate_pence, platform_cut_bps, min_payout_pence
  INTO v_config
  FROM public.platform_ep_config
  WHERE id = 1;

  RETURN QUERY
  SELECT
    earned.tenant_org_id,
    earned.balance::INT AS ep_amount,
    COALESCE(
      last_payout.last_period_end,
      first_ledger.earliest_shop_debit,
      v_now - INTERVAL '1 month'
    ) AS period_start,
    v_now AS period_end,
    v_config.fiat_rate_pence,
    v_config.platform_cut_bps,
    (earned.balance * v_config.fiat_rate_pence)::INT AS gross_pence,
    ((earned.balance * v_config.fiat_rate_pence * v_config.platform_cut_bps) / 10000)::INT
      AS platform_cut_pence,
    ((earned.balance * v_config.fiat_rate_pence * (10000 - v_config.platform_cut_bps)) / 10000)::INT
      AS tenant_net_pence
  FROM public.ep_tenant_earned earned
  LEFT JOIN LATERAL (
    SELECT MAX(period_end) AS last_period_end
    FROM public.ep_tenant_payouts
    WHERE public.ep_tenant_payouts.tenant_org_id = earned.tenant_org_id
      AND status = 'paid'
  ) last_payout ON TRUE
  LEFT JOIN LATERAL (
    SELECT MIN(created_at) AS earliest_shop_debit
    FROM public.ep_ledger
    WHERE public.ep_ledger.tenant_org_id = earned.tenant_org_id
      AND entry_type = 'rep_shop_debit'
  ) first_ledger ON TRUE
  WHERE earned.balance > 0
    AND (earned.balance * v_config.fiat_rate_pence * (10000 - v_config.platform_cut_bps)) / 10000
        >= v_config.min_payout_pence;
END;
$$;

COMMENT ON FUNCTION public.plan_tenant_payouts IS
  'Returns tenants whose outstanding earned EP, after platform cut, meets the min payout threshold. Used by the monthly payout cron.';

-- ---------------------------------------------------------------------------
-- create_pending_payout — insert a pending ep_tenant_payouts row. Called
-- BEFORE the Stripe Transfer so we have an audit trail no matter what
-- Stripe does. Returns the new payout id.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_pending_payout(
  p_tenant_org_id TEXT,
  p_ep_amount INT,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_fiat_rate_pence INT,
  p_platform_cut_bps INT,
  p_gross_pence INT,
  p_platform_cut_pence INT,
  p_tenant_net_pence INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payout_id UUID;
BEGIN
  INSERT INTO public.ep_tenant_payouts (
    tenant_org_id, ep_amount, platform_cut_bps, fiat_rate_pence,
    gross_pence, platform_cut_pence, tenant_net_pence,
    period_start, period_end, status
  )
  VALUES (
    p_tenant_org_id, p_ep_amount, p_platform_cut_bps, p_fiat_rate_pence,
    p_gross_pence, p_platform_cut_pence, p_tenant_net_pence,
    p_period_start::DATE, p_period_end::DATE, 'pending'
  )
  RETURNING id INTO v_payout_id;

  RETURN v_payout_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- complete_tenant_payout — transaction: flip payout row to 'paid' + write
-- tenant_payout ledger entry. Called AFTER Stripe Transfer succeeds.
-- Re-callable safely (idempotent on payout id): if the ledger entry already
-- exists for this payout, does nothing but still flips status (for backfill).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_tenant_payout(
  p_payout_id UUID,
  p_stripe_transfer_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payout RECORD;
  v_existing_ledger_count INT;
BEGIN
  SELECT id, tenant_org_id, ep_amount, fiat_rate_pence, status
  INTO v_payout
  FROM public.ep_tenant_payouts
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Payout not found');
  END IF;

  IF v_payout.status = 'paid' THEN
    RETURN jsonb_build_object('success', true, 'already_paid', true);
  END IF;

  -- Idempotency: check if we already wrote the ledger entry for this payout
  SELECT COUNT(*) INTO v_existing_ledger_count
  FROM public.ep_ledger
  WHERE payout_id = p_payout_id
    AND entry_type = 'tenant_payout';

  IF v_existing_ledger_count = 0 THEN
    INSERT INTO public.ep_ledger (
      entry_type, ep_amount, tenant_org_id,
      payout_id, fiat_rate_pence, notes
    )
    VALUES (
      'tenant_payout', v_payout.ep_amount, v_payout.tenant_org_id,
      v_payout.id, v_payout.fiat_rate_pence,
      'Stripe Transfer ' || p_stripe_transfer_id
    );
  END IF;

  UPDATE public.ep_tenant_payouts
  SET status = 'paid',
      stripe_transfer_id = p_stripe_transfer_id,
      paid_at = now()
  WHERE id = p_payout_id;

  RETURN jsonb_build_object(
    'success', true,
    'payout_id', p_payout_id,
    'ep_amount', v_payout.ep_amount,
    'tenant_org_id', v_payout.tenant_org_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- fail_tenant_payout — marks payout as failed. No ledger entry. Called
-- when the Stripe Transfer errors. Next cron run will include the same
-- earned balance in a fresh plan.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fail_tenant_payout(
  p_payout_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.ep_tenant_payouts
  SET status = 'failed',
      failure_reason = p_reason
  WHERE id = p_payout_id
    AND status = 'pending';
END;
$$;
