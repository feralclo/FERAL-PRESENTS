-- Migration: Ensure cover_image and hero_image columns exist on events table
-- These columns store image URLs (not base64 data)
-- Run this if the events table was created before these columns were added to the schema

ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_image TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS hero_image TEXT;
