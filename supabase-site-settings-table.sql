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

-- Enable Row Level Security (RLS)
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Public can read settings (event pages need this)
CREATE POLICY "anon_select" ON site_settings
  FOR SELECT TO anon USING (true);

-- Authenticated admin gets full access
CREATE POLICY "auth_all" ON site_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create index on updated_at for sorting
CREATE INDEX IF NOT EXISTS idx_site_settings_updated ON site_settings(updated_at);
