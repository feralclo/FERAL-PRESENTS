-- Multi-vendor support for Entry Market. For now only FERAL CLOTHING
-- is active, but modelling vendors as a first-class entity means adding
-- supplier #2 is an INSERT, not a schema change.

CREATE TABLE public.platform_market_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  handle text NOT NULL UNIQUE,
  tagline text,
  description text,
  logo_url text,
  cover_url text,
  website_url text,
  external_source text NOT NULL DEFAULT 'shopify'
    CHECK (external_source = ANY (ARRAY['shopify'::text,'manual'::text])),
  external_shop_domain text,
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pmv_visible_sort_idx ON public.platform_market_vendors(visible, sort_order, name)
  WHERE visible = true;
CREATE TRIGGER pmv_set_updated_at
  BEFORE UPDATE ON public.platform_market_vendors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.platform_market_vendors ENABLE ROW LEVEL SECURITY;

-- Seed FERAL as the first vendor.
INSERT INTO public.platform_market_vendors (
  name, handle, tagline, description, website_url,
  external_source, external_shop_domain, logo_url
) VALUES (
  'FERAL CLOTHING',
  'feral-clothing',
  'Techno-scene apparel & accessories',
  'FERAL is a London techno-scene clothing brand — acid-wash tees, sigilism-printed bikinis, bamboo fans. Shipped direct from the brand''s Shopify.',
  'https://www.feralclo.com',
  'shopify',
  'aab932.myshopify.com',
  NULL
);

-- Attach existing products to vendors.
ALTER TABLE public.platform_market_products
  ADD COLUMN IF NOT EXISTS vendor_id uuid
    REFERENCES public.platform_market_vendors(id) ON DELETE RESTRICT;

UPDATE public.platform_market_products p
   SET vendor_id = (SELECT id FROM public.platform_market_vendors WHERE handle = 'feral-clothing')
 WHERE vendor_id IS NULL;

ALTER TABLE public.platform_market_products
  ALTER COLUMN vendor_id SET NOT NULL;

CREATE INDEX pmp_vendor_idx ON public.platform_market_products(vendor_id);
