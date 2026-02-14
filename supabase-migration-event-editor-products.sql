-- ============================================================
-- FERAL PRESENTS — Complete migration for Event Editor + Products
-- Run this ONCE in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS checks
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. EVENTS TABLE — Add missing columns
-- ────────────────────────────────────────────────────────────

-- Content columns (used by ContentTab)
ALTER TABLE events ADD COLUMN IF NOT EXISTS about_text TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS lineup TEXT[];
ALTER TABLE events ADD COLUMN IF NOT EXISTS details_text TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS tag_line TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS doors_time TEXT;

-- Image columns (used by DesignTab)
ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_image TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS hero_image TEXT;

-- Stripe Connect columns (used by SettingsTab + payment processing)
ALTER TABLE events ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS platform_fee_percent NUMERIC(5,2) DEFAULT 5;

-- Expand status CHECK constraint to include 'archived'
-- PostgreSQL doesn't support ALTER CONSTRAINT, so we drop and recreate
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE events ADD CONSTRAINT events_status_check
  CHECK (status IN ('draft', 'live', 'past', 'cancelled', 'archived'));

-- ────────────────────────────────────────────────────────────
-- 2. TICKET_TYPES TABLE — Add missing columns
-- ────────────────────────────────────────────────────────────

-- Merch columns (used by TicketCard inline merch fields)
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS merch_name TEXT;
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS merch_description TEXT;
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS merch_images JSONB;

-- Tier column (used by TierSelector: standard, platinum, black, valentine)
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'standard';

-- ────────────────────────────────────────────────────────────
-- 3. PRODUCTS TABLE — New table for standalone merch catalog
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL DEFAULT 'feral',
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'T-Shirt'
    CHECK (type IN ('T-Shirt', 'Hoodie', 'Poster', 'Hat', 'Vinyl', 'Other')),
  sizes TEXT[] DEFAULT '{}',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  images JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  sku TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies (safe to run multiple times — IF NOT EXISTS via DO block)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'anon_select') THEN
    CREATE POLICY "anon_select" ON products FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'auth_all') THEN
    CREATE POLICY "auth_all" ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_org ON products(org_id);
CREATE INDEX IF NOT EXISTS idx_products_org_status ON products(org_id, status);

-- ────────────────────────────────────────────────────────────
-- 4. LINK PRODUCTS TO TICKET TYPES
-- ────────────────────────────────────────────────────────────

-- Add product_id FK (nullable — backward compatible)
-- ON DELETE SET NULL ensures tickets keep working if a product is removed
ALTER TABLE ticket_types
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_types_product ON ticket_types(product_id);

-- ────────────────────────────────────────────────────────────
-- DONE — Verify by running: SELECT column_name FROM information_schema.columns WHERE table_name = 'events' ORDER BY ordinal_position;
-- ────────────────────────────────────────────────────────────
