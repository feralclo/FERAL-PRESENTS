-- ===========================================================================
-- EP economy foundation — append-only event-sourced ledger + balance views.
-- Per ENTRY-IOS-BACKEND-SPEC §5.11 (with minor refinement: reversals are
-- typed entries, not generic 'reversal'+reverses_entry_id lookups — keeps
-- balance views as simple one-pass SUM(CASE) with no correlated subqueries).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- platform_ep_config — singleton
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_ep_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  fiat_rate_pence INT NOT NULL DEFAULT 1,           -- 1 EP = 1p
  platform_cut_bps INT NOT NULL DEFAULT 1000,        -- 10% in basis points
  min_payout_pence INT NOT NULL DEFAULT 5000,        -- £50
  refund_window_days INT NOT NULL DEFAULT 90,
  default_bonus_ep_per_quest INT NOT NULL DEFAULT 0, -- Decision Q placeholder
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

INSERT INTO public.platform_ep_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- ep_tenant_purchases — tenant buys EP from the platform (Stripe PaymentIntent)
-- ---------------------------------------------------------------------------
CREATE TABLE public.ep_tenant_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_org_id TEXT NOT NULL,
  ep_amount INT NOT NULL CHECK (ep_amount > 0),
  fiat_pence INT NOT NULL CHECK (fiat_pence > 0),
  fiat_currency TEXT NOT NULL DEFAULT 'GBP',
  fiat_rate_pence INT NOT NULL,                       -- rate at issuance
  stripe_payment_intent_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed','refunded')),
  refunded_ep INT NOT NULL DEFAULT 0 CHECK (refunded_ep >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);

CREATE INDEX ep_tenant_purchases_tenant_idx ON public.ep_tenant_purchases (tenant_org_id, created_at DESC);

COMMENT ON TABLE public.ep_tenant_purchases IS
  'Tenant EP purchase orders (Stripe PaymentIntents). Ledger entries of entry_type=tenant_purchase reference this via ep_purchase_id.';

-- ---------------------------------------------------------------------------
-- ep_tenant_payouts — platform pays tenant in cash (Stripe Transfer)
-- ---------------------------------------------------------------------------
CREATE TABLE public.ep_tenant_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_org_id TEXT NOT NULL,
  ep_amount INT NOT NULL CHECK (ep_amount > 0),
  platform_cut_bps INT NOT NULL,                      -- snapshotted at payout time
  fiat_rate_pence INT NOT NULL,                       -- snapshotted at payout time
  gross_pence INT NOT NULL CHECK (gross_pence >= 0),
  platform_cut_pence INT NOT NULL CHECK (platform_cut_pence >= 0),
  tenant_net_pence INT NOT NULL CHECK (tenant_net_pence >= 0),
  fiat_currency TEXT NOT NULL DEFAULT 'GBP',
  stripe_transfer_id TEXT UNIQUE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','failed')),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX ep_tenant_payouts_tenant_idx ON public.ep_tenant_payouts (tenant_org_id, created_at DESC);

COMMENT ON TABLE public.ep_tenant_payouts IS
  'Monthly cash payouts to tenants covering EP redeemed in their shop, minus platform cut.';

-- ---------------------------------------------------------------------------
-- ep_ledger — append-only source of truth for every EP movement
-- ---------------------------------------------------------------------------
CREATE TABLE public.ep_ledger (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    -- Tenant float in/out
    'tenant_purchase',           -- +tenant float
    'tenant_purchase_reversal',  -- -tenant float (Stripe refund of unspent float)
    'tenant_quest_debit',        -- -tenant float (quest approved, EP flows to rep)
    'tenant_quest_reversal',     -- +tenant float (approval reversed)
    -- Rep balance in/out
    'rep_quest_credit',          -- +rep balance (quest approved)
    'rep_quest_reversal',        -- -rep balance (approval reversed)
    'rep_shop_debit',            -- -rep balance + +tenant earned (reward claimed)
    'rep_shop_reversal',         -- +rep balance + -tenant earned (claim refunded)
    'platform_bonus',            -- +rep balance (Decision Q — deferred)
    -- Tenant earned/payout
    'tenant_payout',             -- -tenant earned (Stripe Transfer issued)
    'tenant_payout_reversal'     -- +tenant earned (Transfer failed or clawed back)
  )),
  ep_amount INT NOT NULL CHECK (ep_amount > 0),
  -- Parties
  tenant_org_id TEXT,
  rep_id UUID REFERENCES public.reps(id) ON DELETE SET NULL,
  -- Source-of-truth references
  ep_purchase_id UUID REFERENCES public.ep_tenant_purchases(id),
  quest_submission_id UUID REFERENCES public.rep_quest_submissions(id),
  reward_claim_id UUID REFERENCES public.rep_reward_claims(id),
  payout_id UUID REFERENCES public.ep_tenant_payouts(id),
  reverses_entry_id BIGINT REFERENCES public.ep_ledger(id),
  -- Fiat snapshot (rate in effect at time of entry — forward-only rate changes)
  fiat_rate_pence INT NOT NULL,
  notes TEXT,
  -- Consistency: every rep-side entry must have rep_id, every tenant-side entry must have tenant_org_id
  CONSTRAINT ep_ledger_rep_entries_have_rep CHECK (
    entry_type NOT IN ('rep_quest_credit','rep_quest_reversal','rep_shop_debit','rep_shop_reversal','platform_bonus')
    OR rep_id IS NOT NULL
  ),
  CONSTRAINT ep_ledger_tenant_entries_have_tenant CHECK (
    entry_type NOT IN ('tenant_purchase','tenant_purchase_reversal','tenant_quest_debit','tenant_quest_reversal','tenant_payout','tenant_payout_reversal','rep_shop_debit','rep_shop_reversal')
    OR tenant_org_id IS NOT NULL
  )
);

CREATE INDEX ep_ledger_tenant_idx ON public.ep_ledger (tenant_org_id, created_at DESC)
  WHERE tenant_org_id IS NOT NULL;
CREATE INDEX ep_ledger_rep_idx ON public.ep_ledger (rep_id, created_at DESC)
  WHERE rep_id IS NOT NULL;
CREATE INDEX ep_ledger_entry_type_idx ON public.ep_ledger (entry_type);
CREATE INDEX ep_ledger_purchase_idx ON public.ep_ledger (ep_purchase_id)
  WHERE ep_purchase_id IS NOT NULL;
CREATE INDEX ep_ledger_submission_idx ON public.ep_ledger (quest_submission_id)
  WHERE quest_submission_id IS NOT NULL;
CREATE INDEX ep_ledger_claim_idx ON public.ep_ledger (reward_claim_id)
  WHERE reward_claim_id IS NOT NULL;
CREATE INDEX ep_ledger_payout_idx ON public.ep_ledger (payout_id)
  WHERE payout_id IS NOT NULL;

COMMENT ON TABLE public.ep_ledger IS
  'Append-only source of truth for every EP movement. Balance views sum signed deltas derived from entry_type. Writes go through API routes using service_role; UPDATE and DELETE are blocked by triggers.';

-- ---------------------------------------------------------------------------
-- Balance views — simple one-pass SUM(CASE) over ledger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.ep_rep_balances AS
SELECT
  rep_id,
  SUM(CASE entry_type
    WHEN 'rep_quest_credit'   THEN  ep_amount
    WHEN 'rep_quest_reversal' THEN -ep_amount
    WHEN 'rep_shop_debit'     THEN -ep_amount
    WHEN 'rep_shop_reversal'  THEN  ep_amount
    WHEN 'platform_bonus'     THEN  ep_amount
    ELSE 0
  END)::INT AS balance
FROM public.ep_ledger
WHERE rep_id IS NOT NULL
GROUP BY rep_id;

CREATE OR REPLACE VIEW public.ep_tenant_float AS
SELECT
  tenant_org_id,
  SUM(CASE entry_type
    WHEN 'tenant_purchase'          THEN  ep_amount
    WHEN 'tenant_purchase_reversal' THEN -ep_amount
    WHEN 'tenant_quest_debit'       THEN -ep_amount
    WHEN 'tenant_quest_reversal'    THEN  ep_amount
    ELSE 0
  END)::INT AS balance
FROM public.ep_ledger
WHERE tenant_org_id IS NOT NULL
GROUP BY tenant_org_id;

-- Tenant earned-unpaid: EP redeemed at their shop, net of payouts already
-- sent. This is what we owe them next payout cycle (after platform cut).
CREATE OR REPLACE VIEW public.ep_tenant_earned AS
SELECT
  tenant_org_id,
  SUM(CASE entry_type
    WHEN 'rep_shop_debit'           THEN  ep_amount
    WHEN 'rep_shop_reversal'        THEN -ep_amount
    WHEN 'tenant_payout'            THEN -ep_amount
    WHEN 'tenant_payout_reversal'   THEN  ep_amount
    ELSE 0
  END)::INT AS balance
FROM public.ep_ledger
WHERE tenant_org_id IS NOT NULL
GROUP BY tenant_org_id;

-- ---------------------------------------------------------------------------
-- Trigger: maintain reps.currency_balance cache on ledger insert.
-- reps.currency_balance is a denormalised cache. Canonical balance is the
-- view. Any drift = bug, reconcilable via scheduled check.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ep_ledger_maintain_rep_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  rep_delta INT;
BEGIN
  IF NEW.rep_id IS NULL THEN
    RETURN NEW;
  END IF;

  rep_delta := CASE NEW.entry_type
    WHEN 'rep_quest_credit'   THEN  NEW.ep_amount
    WHEN 'rep_quest_reversal' THEN -NEW.ep_amount
    WHEN 'rep_shop_debit'     THEN -NEW.ep_amount
    WHEN 'rep_shop_reversal'  THEN  NEW.ep_amount
    WHEN 'platform_bonus'     THEN  NEW.ep_amount
    ELSE 0
  END;

  IF rep_delta <> 0 THEN
    UPDATE public.reps
    SET currency_balance = currency_balance + rep_delta,
        updated_at = now()
    WHERE id = NEW.rep_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ep_ledger_rep_cache_sync
  AFTER INSERT ON public.ep_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.ep_ledger_maintain_rep_cache();

-- ---------------------------------------------------------------------------
-- Enforce append-only — no UPDATE or DELETE on the ledger, ever.
-- Corrections go through new reversal-typed rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ep_ledger_enforce_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ep_ledger is append-only. Insert a reversal-typed entry (e.g. rep_quest_reversal) to correct instead.'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER ep_ledger_no_update
  BEFORE UPDATE ON public.ep_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.ep_ledger_enforce_append_only();

CREATE TRIGGER ep_ledger_no_delete
  BEFORE DELETE ON public.ep_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.ep_ledger_enforce_append_only();

-- ---------------------------------------------------------------------------
-- Reconciliation helper — any row here = cached balance drift from ledger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.ep_rep_balance_drift AS
SELECT
  r.id AS rep_id,
  r.currency_balance AS cached_balance,
  COALESCE(v.balance, 0) AS ledger_balance,
  r.currency_balance - COALESCE(v.balance, 0) AS drift
FROM public.reps r
LEFT JOIN public.ep_rep_balances v ON v.rep_id = r.id
WHERE r.currency_balance <> COALESCE(v.balance, 0);

COMMENT ON VIEW public.ep_rep_balance_drift IS
  'Rows in this view indicate cached reps.currency_balance has drifted from the ledger. Should always be empty in a healthy system.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_ep_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ep_tenant_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ep_tenant_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ep_ledger ENABLE ROW LEVEL SECURITY;

-- Tenant admins see their own purchases/payouts/ledger entries (read-only)
CREATE POLICY ep_purchases_tenant_read ON public.ep_tenant_purchases
  FOR SELECT TO authenticated
  USING (tenant_org_id = auth_user_org_id());

CREATE POLICY ep_payouts_tenant_read ON public.ep_tenant_payouts
  FOR SELECT TO authenticated
  USING (tenant_org_id = auth_user_org_id());

CREATE POLICY ep_ledger_tenant_read ON public.ep_ledger
  FOR SELECT TO authenticated
  USING (tenant_org_id = auth_user_org_id());

-- Writes happen via service_role only (API routes enforce validation).
-- No authenticated INSERT/UPDATE/DELETE policies — locked by default.
