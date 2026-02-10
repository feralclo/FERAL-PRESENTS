-- ============================================================
-- FERAL PRESENTS — Add content columns to events + tier to ticket_types
-- Run this in Supabase SQL Editor after previous migrations
-- ============================================================

-- Add content/display columns to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS about_text TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS lineup TEXT[];
ALTER TABLE events ADD COLUMN IF NOT EXISTS details_text TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS tag_line TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS doors_time TEXT;

-- Add tier column to ticket_types table (visual design: standard, platinum, black)
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'standard';
