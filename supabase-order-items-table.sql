-- Order items: individual line items within an order
-- Every row must have org_id for future multi-tenancy

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL DEFAULT 'feral',
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  merch_size TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Checkout creates order items
CREATE POLICY "anon_select" ON order_items FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert" ON order_items FOR INSERT TO anon WITH CHECK (true);
-- Authenticated admin gets full access
CREATE POLICY "auth_all" ON order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_ticket_type ON order_items(ticket_type_id);
