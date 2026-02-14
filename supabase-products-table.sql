-- Products table: standalone merchandise catalog
-- Every row must have org_id for future multi-tenancy

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL DEFAULT 'feral',
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'T-Shirt'
    CHECK (type IN ('T-Shirt', 'Hoodie', 'Poster', 'Hat', 'Vinyl', 'Other')),
  sizes TEXT[] DEFAULT '{}',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  images JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  sku TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Public can read products (ticket pages resolve linked products)
CREATE POLICY "anon_select" ON products FOR SELECT TO anon USING (true);
-- Authenticated admin gets full access
CREATE POLICY "auth_all" ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_products_org ON products(org_id);
CREATE INDEX IF NOT EXISTS idx_products_org_status ON products(org_id, status);

-- Add product_id to ticket_types (nullable — backward compatible)
-- ON DELETE SET NULL ensures tickets keep working if a product is removed
ALTER TABLE ticket_types
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- Additional merch columns that may not exist on older installs
ALTER TABLE ticket_types
  ADD COLUMN IF NOT EXISTS merch_name TEXT,
  ADD COLUMN IF NOT EXISTS merch_description TEXT,
  ADD COLUMN IF NOT EXISTS merch_images JSONB,
  ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'standard';

CREATE INDEX IF NOT EXISTS idx_ticket_types_product ON ticket_types(product_id);
