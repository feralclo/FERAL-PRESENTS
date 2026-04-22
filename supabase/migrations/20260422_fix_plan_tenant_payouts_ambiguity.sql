-- Fix 42702 ambiguity: PL/pgSQL couldn't tell whether `fiat_rate_pence`
-- in the SELECT referred to the RETURNS TABLE output column or the
-- platform_ep_config table column. Rename the locals (v_rate / v_cut /
-- v_min) to disambiguate.

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
  v_rate INT;
  v_cut INT;
  v_min INT;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT cfg.fiat_rate_pence, cfg.platform_cut_bps, cfg.min_payout_pence
  INTO v_rate, v_cut, v_min
  FROM public.platform_ep_config cfg
  WHERE cfg.id = 1;

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
    v_rate AS fiat_rate_pence,
    v_cut AS platform_cut_bps,
    (earned.balance * v_rate)::INT AS gross_pence,
    ((earned.balance * v_rate * v_cut) / 10000)::INT AS platform_cut_pence,
    ((earned.balance * v_rate * (10000 - v_cut)) / 10000)::INT AS tenant_net_pence
  FROM public.ep_tenant_earned earned
  LEFT JOIN LATERAL (
    SELECT MAX(p.period_end) AS last_period_end
    FROM public.ep_tenant_payouts p
    WHERE p.tenant_org_id = earned.tenant_org_id
      AND p.status = 'paid'
  ) last_payout ON TRUE
  LEFT JOIN LATERAL (
    SELECT MIN(l.created_at) AS earliest_shop_debit
    FROM public.ep_ledger l
    WHERE l.tenant_org_id = earned.tenant_org_id
      AND l.entry_type = 'rep_shop_debit'
  ) first_ledger ON TRUE
  WHERE earned.balance > 0
    AND (earned.balance * v_rate * (10000 - v_cut)) / 10000 >= v_min;
END;
$$;
