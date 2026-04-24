-- Parent+variant rebuild of the Entry Market schema. Catalog was empty at
-- the time of this migration (no claims had been placed), so commerce
-- columns move from the product row to a new variants child table
-- without a data migration.

-- 1. Strip commerce detail from the product row — it's now pure editorial.
ALTER TABLE public.platform_market_products
  DROP COLUMN IF EXISTS external_variant_id,
  DROP COLUMN IF EXISTS ep_price,
  DROP COLUMN IF EXISTS stock;

DROP INDEX IF EXISTS pmp_external_unique;
CREATE UNIQUE INDEX pmp_external_product_unique
  ON public.platform_market_products(source, external_product_id)
  WHERE external_product_id IS NOT NULL;

-- 2. Variants table — one per purchasable SKU.
CREATE TABLE public.platform_market_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.platform_market_products(id) ON DELETE CASCADE,
  external_variant_id text NOT NULL,
  title text NOT NULL,
  option1 text,
  option2 text,
  option3 text,
  ep_price integer NOT NULL CHECK (ep_price > 0),
  stock integer,
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pmpv_product_sort_idx   ON public.platform_market_product_variants(product_id, sort_order);
CREATE INDEX pmpv_visible_idx        ON public.platform_market_product_variants(visible, product_id) WHERE visible = true;
CREATE UNIQUE INDEX pmpv_ext_unique  ON public.platform_market_product_variants(product_id, external_variant_id);

CREATE TRIGGER pmpv_set_updated_at
  BEFORE UPDATE ON public.platform_market_product_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.platform_market_product_variants ENABLE ROW LEVEL SECURITY;

-- 3. Variant FK on claims.
ALTER TABLE public.platform_market_claims
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.platform_market_product_variants(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS pmc_variant_idx ON public.platform_market_claims(variant_id);

-- 4. Rebuild claim RPC (adds p_variant_id, reads price/stock from variant)
DROP FUNCTION IF EXISTS public.claim_market_product_atomic(uuid, uuid, text, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.claim_market_product_atomic(
  p_rep_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
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
  v_product     public.platform_market_products%ROWTYPE;
  v_variant     public.platform_market_product_variants%ROWTYPE;
  v_rep_balance integer;
  v_claim_id    uuid;
  v_stock_after integer;
  v_rate_pence  integer;
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

  SELECT * INTO v_variant
  FROM public.platform_market_product_variants
  WHERE id = p_variant_id AND product_id = p_product_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','variant_not_found');
  END IF;
  IF NOT v_variant.visible THEN
    RETURN jsonb_build_object('error','variant_unavailable');
  END IF;
  IF v_variant.stock IS NOT NULL AND v_variant.stock <= 0 THEN
    RETURN jsonb_build_object('error','out_of_stock');
  END IF;

  SELECT COALESCE(balance, 0) INTO v_rep_balance
  FROM public.ep_rep_balances WHERE rep_id = p_rep_id;
  IF v_rep_balance < v_variant.ep_price THEN
    RETURN jsonb_build_object('error','insufficient_balance','balance', v_rep_balance);
  END IF;

  SELECT fiat_rate_pence INTO v_rate_pence FROM public.platform_ep_config WHERE id = 1;
  IF v_rate_pence IS NULL THEN v_rate_pence := 1; END IF;

  INSERT INTO public.platform_market_claims (
    rep_id, product_id, variant_id, ep_spent,
    shipping_name, shipping_email, shipping_phone, shipping_address,
    status, external_source
  ) VALUES (
    p_rep_id, p_product_id, p_variant_id, v_variant.ep_price,
    p_shipping_name, p_shipping_email, p_shipping_phone, p_shipping_address,
    'claimed', v_product.source
  ) RETURNING id INTO v_claim_id;

  INSERT INTO public.ep_ledger (
    entry_type, ep_amount, rep_id, tenant_org_id, market_claim_id, fiat_rate_pence, notes
  ) VALUES (
    'market_redemption', v_variant.ep_price, p_rep_id, NULL, v_claim_id, v_rate_pence,
    'Entry Market: ' || v_product.title || ' — ' || v_variant.title
  );

  IF v_variant.stock IS NOT NULL THEN
    UPDATE public.platform_market_product_variants
       SET stock = stock - 1
     WHERE id = p_variant_id
     RETURNING stock INTO v_stock_after;
  ELSE
    v_stock_after := NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', v_claim_id,
    'new_balance', v_rep_balance - v_variant.ep_price,
    'stock_remaining', v_stock_after
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.claim_market_product_atomic(
  uuid, uuid, uuid, text, text, text, jsonb
) TO service_role;

-- 5. Rebuild cancel+refund RPC — restore stock on variant
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
    entry_type, ep_amount, rep_id, tenant_org_id, market_claim_id, fiat_rate_pence, notes,
    reverses_entry_id
  ) VALUES (
    'market_redemption_reversal', v_claim.ep_spent, v_claim.rep_id, NULL, v_claim.id, v_rate_pence,
    COALESCE(p_reason,'market claim cancelled'),
    (SELECT id FROM public.ep_ledger
       WHERE entry_type='market_redemption' AND market_claim_id = v_claim.id
       LIMIT 1)
  );

  IF v_claim.variant_id IS NOT NULL THEN
    UPDATE public.platform_market_product_variants
       SET stock = stock + 1, updated_at = now()
     WHERE id = v_claim.variant_id AND stock IS NOT NULL;
  END IF;

  UPDATE public.platform_market_claims
     SET status = 'cancelled', cancelled_at = now(),
         notes = COALESCE(notes,'') || E'\n' || COALESCE(p_reason,'')
   WHERE id = v_claim.id;

  RETURN jsonb_build_object('success', true, 'refunded_ep', v_claim.ep_spent);
END; $$;

GRANT EXECUTE ON FUNCTION public.cancel_market_claim_and_refund(uuid, text) TO service_role;
