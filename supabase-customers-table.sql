-- Customers table: track buyers across events
-- Every row must have org_id for future multi-tenancy

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL DEFAULT 'feral',
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_spent NUMERIC(10,2) NOT NULL DEFAULT 0,
  first_order_at TIMESTAMPTZ,
  last_order_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, email)
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Checkout needs: check if exists (SELECT), create (INSERT), update stats (UPDATE)
CREATE POLICY "anon_select" ON customers FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert" ON customers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update" ON customers FOR UPDATE TO anon USING (true) WITH CHECK (true);
-- Authenticated admin gets full access
CREATE POLICY "auth_all" ON customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(org_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(org_id, email);
