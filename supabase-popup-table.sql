-- Create popup_events table for FERAL popup analytics
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/rqtfghzhkkdytkegcifm/sql

CREATE TABLE IF NOT EXISTS popup_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  page TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT
);

-- Enable Row Level Security (RLS)
ALTER TABLE popup_events ENABLE ROW LEVEL SECURITY;

-- Anonymous tracking — insert only
CREATE POLICY "anon_insert" ON popup_events
  FOR INSERT TO anon WITH CHECK (true);

-- Authenticated admin gets full access (read dashboard, reset data)
CREATE POLICY "auth_all" ON popup_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create index for faster queries by event_type
CREATE INDEX IF NOT EXISTS idx_popup_events_type ON popup_events(event_type);

-- Enable Realtime for live admin dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE popup_events;
