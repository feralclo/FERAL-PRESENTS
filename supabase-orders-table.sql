-- Orders table: purchase records
-- Every row must have org_id for future multi-tenancy

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL DEFAULT 'feral',
  order_number TEXT NOT NULL,
  event_id UUID NOT NULL REFERENCES events(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'refunded', 'cancelled', 'failed')),
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  fees NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GBP',
  payment_method TEXT NOT NULL DEFAULT 'test',
  payment_ref TEXT,
  refund_reason TEXT,
  refunded_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, order_number)
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Checkout needs SELECT (dedup check) and INSERT (create order)
CREATE POLICY "anon_select" ON orders FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert" ON orders FOR INSERT TO anon WITH CHECK (true);
-- Authenticated admin gets full access (including UPDATE for refunds)
CREATE POLICY "auth_all" ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_orders_org ON orders(org_id);
CREATE INDEX IF NOT EXISTS idx_orders_event ON orders(event_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(org_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(org_id, order_number);

ALTER PUBLICATION supabase_realtime ADD TABLE orders;
