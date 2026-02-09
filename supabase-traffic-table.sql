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
  product_qty INTEGER        -- for add_to_cart events
);

-- Enable Row Level Security (RLS) but allow public insert and select
ALTER TABLE traffic_events ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to insert events (for tracking)
CREATE POLICY "Allow public insert" ON traffic_events
  FOR INSERT TO anon
  WITH CHECK (true);

-- Allow anonymous users to read events (for admin dashboard)
CREATE POLICY "Allow public select" ON traffic_events
  FOR SELECT TO anon
  USING (true);

-- Allow anonymous users to delete events (for reset functionality)
CREATE POLICY "Allow public delete" ON traffic_events
  FOR DELETE TO anon
  USING (true);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_traffic_events_type ON traffic_events(event_type);
CREATE INDEX IF NOT EXISTS idx_traffic_events_event_name ON traffic_events(event_name);
CREATE INDEX IF NOT EXISTS idx_traffic_events_timestamp ON traffic_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_traffic_events_session ON traffic_events(session_id);

-- Migration: Add new columns to existing table (run if table already exists)
-- ALTER TABLE traffic_events ADD COLUMN IF NOT EXISTS theme TEXT;
-- ALTER TABLE traffic_events ADD COLUMN IF NOT EXISTS product_name TEXT;
-- ALTER TABLE traffic_events ADD COLUMN IF NOT EXISTS product_price NUMERIC;
-- ALTER TABLE traffic_events ADD COLUMN IF NOT EXISTS product_qty INTEGER;

-- Enable Realtime for live admin dashboard updates
-- Run this to enable real-time subscriptions on the traffic_events table:
ALTER PUBLICATION supabase_realtime ADD TABLE traffic_events;
