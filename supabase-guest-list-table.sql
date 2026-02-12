-- Guest list: manually added entries for comp tickets / VIP access
-- Every row must have org_id for future multi-tenancy

CREATE TABLE IF NOT EXISTS guest_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL DEFAULT 'feral',
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  added_by TEXT,
  notes TEXT,
  checked_in BOOLEAN NOT NULL DEFAULT false,
  checked_in_at TIMESTAMPTZ,
  checked_in_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE guest_list ENABLE ROW LEVEL SECURITY;

-- Admin only — no public access to guest list
CREATE POLICY "auth_all" ON guest_list FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_guest_list_event ON guest_list(event_id);
CREATE INDEX IF NOT EXISTS idx_guest_list_org ON guest_list(org_id);
