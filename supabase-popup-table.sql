-- Create popup_events table for FERAL popup analytics
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/rqtfghzhkkdytkegcifm/sql

CREATE TABLE IF NOT EXISTS popup_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  page TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT
);

-- Enable Row Level Security (RLS) but allow public insert and select
ALTER TABLE popup_events ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to insert events (for tracking)
CREATE POLICY "Allow public insert" ON popup_events
  FOR INSERT TO anon
  WITH CHECK (true);

-- Allow anonymous users to read events (for admin dashboard)
CREATE POLICY "Allow public select" ON popup_events
  FOR SELECT TO anon
  USING (true);

-- Allow anonymous users to delete events (for reset functionality)
CREATE POLICY "Allow public delete" ON popup_events
  FOR DELETE TO anon
  USING (true);

-- Create index for faster queries by event_type
CREATE INDEX IF NOT EXISTS idx_popup_events_type ON popup_events(event_type);
