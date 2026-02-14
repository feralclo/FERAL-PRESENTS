-- Create popup_events table for FERAL popup analytics
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/rqtfghzhkkdytkegcifm/sql

CREATE TABLE IF NOT EXISTS popup_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  page TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  org_id TEXT DEFAULT 'feral' -- multi-tenancy: every table must have org_id
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

-- Migration: Add org_id to existing table
ALTER TABLE popup_events ADD COLUMN IF NOT EXISTS org_id TEXT DEFAULT 'feral';
CREATE INDEX IF NOT EXISTS idx_popup_events_org ON popup_events(org_id);

-- Enable Realtime for live admin dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE popup_events;
