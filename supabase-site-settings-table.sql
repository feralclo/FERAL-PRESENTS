-- Create site_settings table for persistent admin/event configuration
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/rqtfghzhkkdytkegcifm/sql
--
-- This stores ALL admin settings (event config, ticket IDs, prices, themes, etc.)
-- so they persist across browsers and devices — not just in localStorage.

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,            -- e.g. 'feral_event_liverpool', 'feral_event_kompass', 'feral_events_list'
  data JSONB NOT NULL DEFAULT '{}', -- the full settings object
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) but allow public read/write
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to read settings (for event pages)
CREATE POLICY "Allow public select" ON site_settings
  FOR SELECT TO anon
  USING (true);

-- Allow anonymous users to insert settings (for admin panel)
CREATE POLICY "Allow public insert" ON site_settings
  FOR INSERT TO anon
  WITH CHECK (true);

-- Allow anonymous users to update settings (for admin panel)
CREATE POLICY "Allow public update" ON site_settings
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Allow anonymous users to delete settings (for reset functionality)
CREATE POLICY "Allow public delete" ON site_settings
  FOR DELETE TO anon
  USING (true);

-- Create index on updated_at for sorting
CREATE INDEX IF NOT EXISTS idx_site_settings_updated ON site_settings(updated_at);
