-- Entry Market — platform-level curated marketplace, Entry editorial picks.
-- Tenants do not see this. Phase 1 supplier is Harry's external Shopify
-- (techno clothing). EP spent here BURNS — no tenant payout (the tenant
-- already got value via the rep's quest activity that earned the EP).

CREATE TABLE public.platform_market_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'shopify' CHECK (source = ANY (ARRAY['shopify'::text,'manual'::text])),
  external_product_id text,
  external_variant_id text,
  external_url text,
  title text NOT NULL,
  subtitle text,
  description text,
  category text,
  image_urls text[] NOT NULL DEFAULT '{}',
  ep_price integer NOT NULL CHECK (ep_price > 0),
  stock integer,
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pmp_visible_idx      ON public.platform_market_products(visible, sort_order, created_at DESC);
CREATE INDEX pmp_category_idx     ON public.platform_market_products(category) WHERE visible = true;
CREATE UNIQUE INDEX pmp_external_unique
  ON public.platform_market_products(source, external_product_id, external_variant_id)
  WHERE external_product_id IS NOT NULL;

CREATE TRIGGER pmp_set_updated_at
  BEFORE UPDATE ON public.platform_market_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.platform_market_products ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.platform_market_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id     uuid NOT NULL REFERENCES public.reps(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.platform_market_products(id) ON DELETE RESTRICT,
  ep_spent integer NOT NULL CHECK (ep_spent > 0),
  shipping_name text NOT NULL,
  shipping_email text NOT NULL,
  shipping_phone text,
  shipping_address jsonb NOT NULL,
  status text NOT NULL DEFAULT 'claimed' CHECK (status = ANY (ARRAY[
    'claimed'::text,
    'submitted_to_supplier'::text,
    'fulfilled'::text,
    'cancelled'::text,
    'failed'::text
  ])),
  external_source text,
  external_order_id text,
  external_order_number text,
  external_order_url text,
  error_message text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  cancelled_at timestamptz
);

CREATE INDEX pmc_rep_created_idx     ON public.platform_market_claims(rep_id, created_at DESC);
CREATE INDEX pmc_status_idx          ON public.platform_market_claims(status, created_at DESC);
CREATE INDEX pmc_product_idx         ON public.platform_market_claims(product_id);
CREATE INDEX pmc_external_order_idx  ON public.platform_market_claims(external_order_id) WHERE external_order_id IS NOT NULL;

CREATE TRIGGER pmc_set_updated_at
  BEFORE UPDATE ON public.platform_market_claims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.platform_market_claims ENABLE ROW LEVEL SECURITY;

-- Add market_redemption entry types to the ep_ledger CHECK and refresh views.
ALTER TABLE public.ep_ledger DROP CONSTRAINT IF EXISTS ep_ledger_entry_type_check;
ALTER TABLE public.ep_ledger ADD CONSTRAINT ep_ledger_entry_type_check
  CHECK (entry_type = ANY (ARRAY[
    'tenant_purchase'::text,
    'tenant_purchase_reversal'::text,
    'tenant_quest_debit'::text,
    'tenant_quest_reversal'::text,
    'rep_quest_credit'::text,
    'rep_quest_reversal'::text,
    'rep_shop_debit'::text,
    'rep_shop_reversal'::text,
    'platform_bonus'::text,
    'tenant_payout'::text,
    'tenant_payout_reversal'::text,
    'market_redemption'::text,
    'market_redemption_reversal'::text
  ]));

-- market_redemption is a rep debit with NO tenant credit (EP burns to platform).
DROP VIEW IF EXISTS public.ep_rep_balances CASCADE;
CREATE VIEW public.ep_rep_balances AS
SELECT rep_id,
  (sum(
    CASE entry_type
      WHEN 'rep_quest_credit'::text            THEN ep_amount
      WHEN 'rep_quest_reversal'::text          THEN (-ep_amount)
      WHEN 'rep_shop_debit'::text              THEN (-ep_amount)
      WHEN 'rep_shop_reversal'::text           THEN ep_amount
      WHEN 'market_redemption'::text           THEN (-ep_amount)
      WHEN 'market_redemption_reversal'::text  THEN ep_amount
      WHEN 'platform_bonus'::text              THEN ep_amount
      ELSE 0
    END))::integer AS balance
FROM public.ep_ledger
WHERE rep_id IS NOT NULL
GROUP BY rep_id;

DROP VIEW IF EXISTS public.ep_rep_balance_drift;
CREATE VIEW public.ep_rep_balance_drift AS
SELECT r.id AS rep_id, r.currency_balance AS cached_balance, COALESCE(b.balance, 0) AS ledger_balance
FROM public.reps r
LEFT JOIN public.ep_rep_balances b ON b.rep_id = r.id
WHERE r.currency_balance IS DISTINCT FROM COALESCE(b.balance, 0)
  AND r.status != 'deleted';

-- RPCs: claim_market_product_atomic + cancel_market_claim_and_refund
CREATE OR REPLACE FUNCTION public.claim_market_product_atomic(
  p_rep_id uuid,
  p_product_id uuid,
  p_shipping_name text,
  p_shipping_email text,
  p_shipping_phone text,
  p_shipping_address jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product       public.platform_market_products%ROWTYPE;
  v_rep_balance   integer;
  v_claim_id      uuid;
  v_stock_after   integer;
  v_rate_pence    integer;
BEGIN
  PERFORM 1 FROM public.reps WHERE id = p_rep_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','rep_not_found');
  END IF;

  SELECT * INTO v_product
  FROM public.platform_market_products
  WHERE id = p_product_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','product_not_found');
  END IF;
  IF NOT v_product.visible THEN
    RETURN jsonb_build_object('error','product_unavailable');
  END IF;
  IF v_product.stock IS NOT NULL AND v_product.stock <= 0 THEN
    RETURN jsonb_build_object('error','out_of_stock');
  END IF;

  SELECT COALESCE(balance, 0) INTO v_rep_balance
  FROM public.ep_rep_balances WHERE rep_id = p_rep_id;
  IF v_rep_balance < v_product.ep_price THEN
    RETURN jsonb_build_object('error','insufficient_balance','balance', v_rep_balance);
  END IF;

  SELECT fiat_rate_pence INTO v_rate_pence FROM public.platform_ep_config WHERE id = 1;
  IF v_rate_pence IS NULL THEN v_rate_pence := 1; END IF;

  INSERT INTO public.platform_market_claims (
    rep_id, product_id, ep_spent,
    shipping_name, shipping_email, shipping_phone, shipping_address,
    status, external_source
  ) VALUES (
    p_rep_id, p_product_id, v_product.ep_price,
    p_shipping_name, p_shipping_email, p_shipping_phone, p_shipping_address,
    'claimed', v_product.source
  ) RETURNING id INTO v_claim_id;

  INSERT INTO public.ep_ledger (
    entry_type, ep_amount, rep_id, tenant_org_id, reward_claim_id, fiat_rate_pence, notes
  ) VALUES (
    'market_redemption', v_product.ep_price, p_rep_id, NULL, v_claim_id, v_rate_pence,
    'Entry Market redemption: ' || v_product.title
  );

  IF v_product.stock IS NOT NULL THEN
    UPDATE public.platform_market_products
       SET stock = stock - 1
     WHERE id = p_product_id
     RETURNING stock INTO v_stock_after;
  ELSE
    v_stock_after := NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', v_claim_id,
    'new_balance', v_rep_balance - v_product.ep_price,
    'stock_remaining', v_stock_after
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.claim_market_product_atomic(
  uuid, uuid, text, text, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_market_claim_and_refund(
  p_claim_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim public.platform_market_claims%ROWTYPE;
  v_rate_pence integer;
BEGIN
  SELECT * INTO v_claim FROM public.platform_market_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','claim_not_found');
  END IF;
  IF v_claim.status NOT IN ('claimed','submitted_to_supplier','failed') THEN
    RETURN jsonb_build_object('error','not_refundable','status', v_claim.status);
  END IF;

  SELECT fiat_rate_pence INTO v_rate_pence FROM public.platform_ep_config WHERE id = 1;
  IF v_rate_pence IS NULL THEN v_rate_pence := 1; END IF;

  INSERT INTO public.ep_ledger (
    entry_type, ep_amount, rep_id, tenant_org_id, reward_claim_id, fiat_rate_pence, notes,
    reverses_entry_id
  ) VALUES (
    'market_redemption_reversal', v_claim.ep_spent, v_claim.rep_id, NULL, v_claim.id, v_rate_pence,
    COALESCE(p_reason,'market claim cancelled'),
    (SELECT id FROM public.ep_ledger
       WHERE entry_type='market_redemption' AND reward_claim_id = v_claim.id
       LIMIT 1)
  );

  UPDATE public.platform_market_products
     SET stock = stock + 1, updated_at = now()
   WHERE id = v_claim.product_id AND stock IS NOT NULL;

  UPDATE public.platform_market_claims
     SET status = 'cancelled', cancelled_at = now(), notes = COALESCE(notes,'') || E'\n' || COALESCE(p_reason,'')
   WHERE id = v_claim.id;

  RETURN jsonb_build_object('success', true, 'refunded_ep', v_claim.ep_spent);
END; $$;

GRANT EXECUTE ON FUNCTION public.cancel_market_claim_and_refund(uuid, text) TO service_role;
