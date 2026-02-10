-- Ticket types: tiers/categories per event
-- Every row must have org_id for future multi-tenancy

CREATE TABLE IF NOT EXISTS ticket_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL DEFAULT 'feral',
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  capacity INTEGER,
  sold INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  includes_merch BOOLEAN NOT NULL DEFAULT false,
  merch_type TEXT,
  merch_sizes TEXT[],
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'hidden', 'sold_out', 'archived')),
  sale_start TIMESTAMPTZ,
  sale_end TIMESTAMPTZ,
  min_per_order INTEGER DEFAULT 1,
  max_per_order INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ticket_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select" ON ticket_types FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert" ON ticket_types FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update" ON ticket_types FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON ticket_types FOR DELETE TO anon USING (true);

CREATE INDEX IF NOT EXISTS idx_ticket_types_event ON ticket_types(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_types_org ON ticket_types(org_id);
CREATE INDEX IF NOT EXISTS idx_ticket_types_status ON ticket_types(org_id, status);
