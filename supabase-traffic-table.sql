-- Create traffic_events table for FERAL traffic analytics / funnel tracking
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/rqtfghzhkkdytkegcifm/sql

CREATE TABLE IF NOT EXISTS traffic_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,  -- 'page_view', 'landing', 'tickets', 'checkout', 'purchase'
  page_path TEXT,            -- e.g., '/event/liverpool-27-march/'
  event_name TEXT,           -- e.g., 'liverpool-27-march'
  referrer TEXT,             -- where they came from
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  session_id TEXT,           -- anonymous session identifier
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  theme TEXT,                -- 'default' or 'minimal' product theme
  product_name TEXT,         -- for add_to_cart events
  product_price NUMERIC,     -- for add_to_cart events
  product_qty INTEGER,       -- for add_to_cart events
  org_id TEXT DEFAULT 'feral' -- multi-tenancy: every table must have org_id
);

-- Enable Row Level Security (RLS)
ALTER TABLE traffic_events ENABLE ROW LEVEL SECURITY;

-- Anonymous tracking — insert only
CREATE POLICY "anon_insert" ON traffic_events
  FOR INSERT TO anon WITH CHECK (true);

-- Authenticated admin gets full access (read dashboard, reset data)
CREATE POLICY "auth_all" ON traffic_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_traffic_events_type ON traffic_events(event_type);
CREATE INDEX IF NOT EXISTS idx_traffic_events_event_name ON traffic_events(event_name);
CREATE INDEX IF NOT EXISTS idx_traffic_events_timestamp ON traffic_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_traffic_events_session ON traffic_events(session_id);

-- Migration: Add new columns to existing table (run if table already exists)
ALTER TABLE traffic_events ADD COLUMN IF NOT EXISTS theme TEXT;
ALTER TABLE traffic_events ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE traffic_events ADD COLUMN IF NOT EXISTS product_price NUMERIC;
ALTER TABLE traffic_events ADD COLUMN IF NOT EXISTS product_qty INTEGER;
ALTER TABLE traffic_events ADD COLUMN IF NOT EXISTS org_id TEXT DEFAULT 'feral';

-- Index for org_id filtering (multi-tenancy)
CREATE INDEX IF NOT EXISTS idx_traffic_events_org ON traffic_events(org_id);

-- Partial index for cart product aggregation (only indexes add_to_cart rows)
CREATE INDEX IF NOT EXISTS idx_traffic_events_product ON traffic_events(product_name) WHERE event_type = 'add_to_cart';

-- Enable Realtime for live admin dashboard updates
-- Run this to enable real-time subscriptions on the traffic_events table:
ALTER PUBLICATION supabase_realtime ADD TABLE traffic_events;
