-- Events table: core event management
-- Every row must have org_id for future multi-tenancy

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL DEFAULT 'feral',
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  venue_name TEXT,
  venue_address TEXT,
  city TEXT,
  country TEXT,
  date_start TIMESTAMPTZ NOT NULL,
  date_end TIMESTAMPTZ,
  doors_open TIMESTAMPTZ,
  age_restriction TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'live', 'past', 'cancelled')),
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private', 'unlisted')),
  payment_method TEXT NOT NULL DEFAULT 'weeztix'
    CHECK (payment_method IN ('weeztix', 'test', 'stripe')),
  capacity INTEGER,
  cover_image TEXT,
  hero_image TEXT,
  theme TEXT DEFAULT 'default',
  settings_key TEXT,
  currency TEXT NOT NULL DEFAULT 'GBP',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Public can read events (event listings)
CREATE POLICY "anon_select" ON events FOR SELECT TO anon USING (true);
-- Authenticated admin gets full access
CREATE POLICY "auth_all" ON events FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_events_org_id ON events(org_id);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(org_id, slug);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(org_id, status);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date_start);

ALTER PUBLICATION supabase_realtime ADD TABLE events;
