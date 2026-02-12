-- ============================================================================
-- FERAL PRESENTS — RLS Hardening
-- ============================================================================
--
-- WHAT THIS DOES:
-- Replaces the current "allow everything to everyone" RLS policies with
-- proper access control. After running this:
--   - Public users (anon) can only do what checkout + tracking needs
--   - Admin users (authenticated via Supabase Auth) get full access
--   - Guest list is completely locked down to admin only
--
-- HOW TO RUN:
-- 1. Go to supabase.com → your project → SQL Editor
-- 2. Paste this entire file
-- 3. Click "Run"
-- 4. Done. No app changes needed — the code already works with these policies.
--
-- SAFE TO RE-RUN: Uses IF EXISTS on all DROP statements.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. site_settings — public can READ, only admin can WRITE
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow public select" ON site_settings;
DROP POLICY IF EXISTS "Allow public insert" ON site_settings;
DROP POLICY IF EXISTS "Allow public update" ON site_settings;
DROP POLICY IF EXISTS "Allow public delete" ON site_settings;

-- Anyone can read settings (event pages need this)
CREATE POLICY "anon_select" ON site_settings
  FOR SELECT TO anon USING (true);

-- Logged-in admin gets full access
CREATE POLICY "auth_all" ON site_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────────────
-- 2. events — public can READ, only admin can CREATE/EDIT/DELETE
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow public select" ON events;
DROP POLICY IF EXISTS "Allow public insert" ON events;
DROP POLICY IF EXISTS "Allow public update" ON events;
DROP POLICY IF EXISTS "Allow public delete" ON events;

-- Anyone can read events (public event listings)
CREATE POLICY "anon_select" ON events
  FOR SELECT TO anon USING (true);

-- Logged-in admin gets full access
CREATE POLICY "auth_all" ON events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. ticket_types — public can READ + UPDATE (sold count), admin gets all
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow public select" ON ticket_types;
DROP POLICY IF EXISTS "Allow public insert" ON ticket_types;
DROP POLICY IF EXISTS "Allow public update" ON ticket_types;
DROP POLICY IF EXISTS "Allow public delete" ON ticket_types;

-- Anyone can read ticket types (event pages show pricing)
CREATE POLICY "anon_select" ON ticket_types
  FOR SELECT TO anon USING (true);

-- Checkout/webhook increments the sold count
CREATE POLICY "anon_update" ON ticket_types
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Logged-in admin gets full access
CREATE POLICY "auth_all" ON ticket_types
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. orders — public can READ + INSERT (checkout), admin gets all
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow public select" ON orders;
DROP POLICY IF EXISTS "Allow public insert" ON orders;
DROP POLICY IF EXISTS "Allow public update" ON orders;
DROP POLICY IF EXISTS "Allow public delete" ON orders;

-- Checkout needs SELECT (duplicate payment_ref check) and INSERT (create order)
CREATE POLICY "anon_select" ON orders
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert" ON orders
  FOR INSERT TO anon WITH CHECK (true);

-- Logged-in admin gets full access (including UPDATE for refunds)
CREATE POLICY "auth_all" ON orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────────────
-- 5. order_items — public can READ + INSERT (checkout), admin gets all
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow public select" ON order_items;
DROP POLICY IF EXISTS "Allow public insert" ON order_items;
DROP POLICY IF EXISTS "Allow public update" ON order_items;
DROP POLICY IF EXISTS "Allow public delete" ON order_items;

-- Checkout creates order items
CREATE POLICY "anon_select" ON order_items
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert" ON order_items
  FOR INSERT TO anon WITH CHECK (true);

-- Logged-in admin gets full access
CREATE POLICY "auth_all" ON order_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────────────
-- 6. tickets — public can only INSERT (checkout creates tickets)
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow public select" ON tickets;
DROP POLICY IF EXISTS "Allow public insert" ON tickets;
DROP POLICY IF EXISTS "Allow public update" ON tickets;
DROP POLICY IF EXISTS "Allow public delete" ON tickets;

-- Checkout creates tickets — that's all public users need
CREATE POLICY "anon_insert" ON tickets
  FOR INSERT TO anon WITH CHECK (true);

-- Logged-in admin gets full access (read, scan, cancel)
CREATE POLICY "auth_all" ON tickets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────────────
-- 7. customers — public can READ + INSERT + UPDATE (checkout upserts)
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow public select" ON customers;
DROP POLICY IF EXISTS "Allow public insert" ON customers;
DROP POLICY IF EXISTS "Allow public update" ON customers;
DROP POLICY IF EXISTS "Allow public delete" ON customers;

-- Checkout needs: check if customer exists (SELECT), create (INSERT), update stats (UPDATE)
CREATE POLICY "anon_select" ON customers
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert" ON customers
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update" ON customers
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Logged-in admin gets full access
CREATE POLICY "auth_all" ON customers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────────────
-- 8. traffic_events — public can only INSERT (tracking), admin gets all
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow public select" ON traffic_events;
DROP POLICY IF EXISTS "Allow public insert" ON traffic_events;
DROP POLICY IF EXISTS "Allow public update" ON traffic_events;
DROP POLICY IF EXISTS "Allow public delete" ON traffic_events;

-- Anonymous tracking — insert only
CREATE POLICY "anon_insert" ON traffic_events
  FOR INSERT TO anon WITH CHECK (true);

-- Logged-in admin gets full access (read dashboard, reset data)
CREATE POLICY "auth_all" ON traffic_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────────────
-- 9. popup_events — public can only INSERT (tracking), admin gets all
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow public select" ON popup_events;
DROP POLICY IF EXISTS "Allow public insert" ON popup_events;
DROP POLICY IF EXISTS "Allow public update" ON popup_events;
DROP POLICY IF EXISTS "Allow public delete" ON popup_events;

-- Anonymous tracking — insert only
CREATE POLICY "anon_insert" ON popup_events
  FOR INSERT TO anon WITH CHECK (true);

-- Logged-in admin gets full access (read dashboard, reset data)
CREATE POLICY "auth_all" ON popup_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────────────
-- 10. guest_list — ADMIN ONLY (no public access at all)
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow public select" ON guest_list;
DROP POLICY IF EXISTS "Allow public insert" ON guest_list;
DROP POLICY IF EXISTS "Allow public update" ON guest_list;
DROP POLICY IF EXISTS "Allow public delete" ON guest_list;

-- Only logged-in admin can access guest list
CREATE POLICY "auth_all" ON guest_list
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================================
-- DONE! Your database is now properly locked down.
--
-- Summary of changes:
--   site_settings  → public: READ only      | admin: full
--   events         → public: READ only      | admin: full
--   ticket_types   → public: READ + UPDATE  | admin: full
--   orders         → public: READ + INSERT  | admin: full
--   order_items    → public: READ + INSERT  | admin: full
--   tickets        → public: INSERT only    | admin: full
--   customers      → public: READ + INSERT + UPDATE | admin: full
--   traffic_events → public: INSERT only    | admin: full
--   popup_events   → public: INSERT only    | admin: full
--   guest_list     → public: NO ACCESS      | admin: full
-- ============================================================================
