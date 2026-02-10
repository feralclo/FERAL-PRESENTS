-- Tickets table: individual issued tickets with unique codes for scanning
-- Every row must have org_id for future multi-tenancy

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL DEFAULT 'feral',
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id),
  event_id UUID NOT NULL REFERENCES events(id),
  ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  ticket_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'valid'
    CHECK (status IN ('valid', 'used', 'cancelled', 'transferred', 'expired')),
  holder_first_name TEXT,
  holder_last_name TEXT,
  holder_email TEXT,
  merch_size TEXT,
  scanned_at TIMESTAMPTZ,
  scanned_by TEXT,
  scan_location TEXT,
  transferred_to UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, ticket_code)
);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select" ON tickets FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert" ON tickets FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update" ON tickets FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_tickets_code ON tickets(org_id, ticket_code);
CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
