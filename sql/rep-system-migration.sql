-- ============================================================================
-- REP SYSTEM — FULL DATABASE MIGRATION
-- ============================================================================
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- This creates all tables needed for the Rep/Ambassador program.
-- Safe to run multiple times (uses IF NOT EXISTS / IF NOT EXISTS patterns).
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 0. EXTENSIONS
-- ────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid()


-- ────────────────────────────────────────────────────────────────────────────
-- 1. DISCOUNTS TABLE (may already exist — creates if missing, alters if needed)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL DEFAULT 'feral',
  code            TEXT NOT NULL,
  description     TEXT,
  type            TEXT NOT NULL DEFAULT 'percentage'
                    CHECK (type IN ('percentage', 'fixed')),
  value           NUMERIC NOT NULL DEFAULT 0,
  min_order_amount NUMERIC,
  max_uses        INTEGER,
  used_count      INTEGER NOT NULL DEFAULT 0,
  applicable_event_ids UUID[],
  starts_at       TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive')),
  rep_id          UUID,                                   -- FK added after reps table exists
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, code)
);

-- If discounts already exists but is missing rep_id, add it:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discounts' AND column_name = 'rep_id'
  ) THEN
    ALTER TABLE discounts ADD COLUMN rep_id UUID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_discounts_org_id     ON discounts(org_id);
CREATE INDEX IF NOT EXISTS idx_discounts_code       ON discounts(code);
CREATE INDEX IF NOT EXISTS idx_discounts_rep_id     ON discounts(rep_id);
CREATE INDEX IF NOT EXISTS idx_discounts_status     ON discounts(org_id, status);


-- ────────────────────────────────────────────────────────────────────────────
-- 2. REPS (core rep profiles)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reps (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                TEXT NOT NULL DEFAULT 'feral',
  auth_user_id          UUID UNIQUE,                      -- FK to auth.users (nullable until they sign up)
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'active', 'suspended', 'deactivated')),
  email                 TEXT NOT NULL,
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  display_name          TEXT,
  phone                 TEXT,
  photo_url             TEXT,
  date_of_birth         DATE,
  gender                TEXT
                          CHECK (gender IS NULL OR gender IN ('male', 'female', 'non-binary', 'prefer-not-to-say')),
  instagram             TEXT,
  tiktok                TEXT,
  points_balance        INTEGER NOT NULL DEFAULT 0,
  total_sales           INTEGER NOT NULL DEFAULT 0,
  total_revenue         NUMERIC NOT NULL DEFAULT 0,
  level                 INTEGER NOT NULL DEFAULT 1,
  invited_by            UUID,                             -- self-referencing FK
  invite_token          TEXT UNIQUE,
  onboarding_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  bio                   TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, email)
);

CREATE INDEX IF NOT EXISTS idx_reps_org_id        ON reps(org_id);
CREATE INDEX IF NOT EXISTS idx_reps_org_status     ON reps(org_id, status);
CREATE INDEX IF NOT EXISTS idx_reps_auth_user_id   ON reps(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_reps_invite_token   ON reps(invite_token);
CREATE INDEX IF NOT EXISTS idx_reps_email          ON reps(org_id, email);

-- Self-referencing FK for invited_by
ALTER TABLE reps
  DROP CONSTRAINT IF EXISTS fk_reps_invited_by;
ALTER TABLE reps
  ADD CONSTRAINT fk_reps_invited_by
  FOREIGN KEY (invited_by) REFERENCES reps(id) ON DELETE SET NULL;

-- Now that reps exists, add FK from discounts.rep_id → reps.id
ALTER TABLE discounts
  DROP CONSTRAINT IF EXISTS fk_discounts_rep_id;
ALTER TABLE discounts
  ADD CONSTRAINT fk_discounts_rep_id
  FOREIGN KEY (rep_id) REFERENCES reps(id) ON DELETE SET NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. REP_EVENTS (rep ↔ event assignments with denormalized stats)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rep_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL DEFAULT 'feral',
  rep_id          UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  discount_id     UUID REFERENCES discounts(id) ON DELETE SET NULL,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sales_count     INTEGER NOT NULL DEFAULT 0,
  revenue         NUMERIC NOT NULL DEFAULT 0,
  UNIQUE (org_id, rep_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_rep_events_org_id    ON rep_events(org_id);
CREATE INDEX IF NOT EXISTS idx_rep_events_rep_id    ON rep_events(rep_id);
CREATE INDEX IF NOT EXISTS idx_rep_events_event_id  ON rep_events(event_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. REP_REWARDS (reward definitions — points shop + milestone prizes)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rep_rewards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL DEFAULT 'feral',
  name            TEXT NOT NULL,
  description     TEXT,
  image_url       TEXT,
  reward_type     TEXT NOT NULL DEFAULT 'points_shop'
                    CHECK (reward_type IN ('milestone', 'points_shop', 'manual')),
  points_cost     INTEGER,
  product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
  custom_value    TEXT,
  total_available INTEGER,
  total_claimed   INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rep_rewards_org_id   ON rep_rewards(org_id);
CREATE INDEX IF NOT EXISTS idx_rep_rewards_status    ON rep_rewards(org_id, status);


-- ────────────────────────────────────────────────────────────────────────────
-- 5. REP_MILESTONES (auto-triggered reward thresholds)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rep_milestones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL DEFAULT 'feral',
  reward_id       UUID NOT NULL REFERENCES rep_rewards(id) ON DELETE CASCADE,
  milestone_type  TEXT NOT NULL
                    CHECK (milestone_type IN ('sales_count', 'revenue', 'points')),
  threshold_value NUMERIC NOT NULL,
  event_id        UUID REFERENCES events(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rep_milestones_org_id     ON rep_milestones(org_id);
CREATE INDEX IF NOT EXISTS idx_rep_milestones_reward_id  ON rep_milestones(reward_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 6. REP_POINTS_LOG (append-only ledger — the source of truth for points)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rep_points_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL DEFAULT 'feral',
  rep_id          UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  points          INTEGER NOT NULL,                       -- positive = award, negative = spend/revoke
  balance_after   INTEGER NOT NULL,                       -- snapshot after this entry
  source_type     TEXT NOT NULL
                    CHECK (source_type IN ('sale', 'quest', 'manual', 'reward_spend', 'revocation')),
  source_id       TEXT,                                   -- order_id, quest_submission_id, etc.
  description     TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      TEXT                                    -- admin user ID or 'system'
);

CREATE INDEX IF NOT EXISTS idx_rep_points_log_org_id   ON rep_points_log(org_id);
CREATE INDEX IF NOT EXISTS idx_rep_points_log_rep_id   ON rep_points_log(rep_id);
CREATE INDEX IF NOT EXISTS idx_rep_points_log_created  ON rep_points_log(rep_id, created_at DESC);


-- ────────────────────────────────────────────────────────────────────────────
-- 7. REP_QUESTS (task definitions reps can complete for points)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rep_quests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL DEFAULT 'feral',
  title           TEXT NOT NULL,
  description     TEXT,
  instructions    TEXT,
  quest_type      TEXT NOT NULL DEFAULT 'custom'
                    CHECK (quest_type IN ('social_post', 'story_share', 'content_creation', 'custom')),
  image_url       TEXT,
  video_url       TEXT,
  points_reward   INTEGER NOT NULL DEFAULT 0,
  event_id        UUID REFERENCES events(id) ON DELETE SET NULL,
  max_completions INTEGER,                                -- per rep
  max_total       INTEGER,                                -- global cap
  total_completed INTEGER NOT NULL DEFAULT 0,
  starts_at       TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'paused', 'archived')),
  notify_reps     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rep_quests_org_id    ON rep_quests(org_id);
CREATE INDEX IF NOT EXISTS idx_rep_quests_status     ON rep_quests(org_id, status);
CREATE INDEX IF NOT EXISTS idx_rep_quests_event_id   ON rep_quests(event_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 8. REP_QUEST_SUBMISSIONS (proof of quest completion)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rep_quest_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL DEFAULT 'feral',
  quest_id        UUID NOT NULL REFERENCES rep_quests(id) ON DELETE CASCADE,
  rep_id          UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  proof_type      TEXT NOT NULL
                    CHECK (proof_type IN ('screenshot', 'url', 'text')),
  proof_url       TEXT,
  proof_text      TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  points_awarded  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rep_quest_subs_org_id   ON rep_quest_submissions(org_id);
CREATE INDEX IF NOT EXISTS idx_rep_quest_subs_quest_id ON rep_quest_submissions(quest_id);
CREATE INDEX IF NOT EXISTS idx_rep_quest_subs_rep_id   ON rep_quest_submissions(rep_id);
CREATE INDEX IF NOT EXISTS idx_rep_quest_subs_status   ON rep_quest_submissions(org_id, status);


-- ────────────────────────────────────────────────────────────────────────────
-- 9. REP_REWARD_CLAIMS (when a rep claims/redeems a reward)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rep_reward_claims (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL DEFAULT 'feral',
  rep_id          UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  reward_id       UUID NOT NULL REFERENCES rep_rewards(id) ON DELETE CASCADE,
  claim_type      TEXT NOT NULL DEFAULT 'points_shop'
                    CHECK (claim_type IN ('milestone', 'points_shop', 'manual')),
  milestone_id    UUID REFERENCES rep_milestones(id) ON DELETE SET NULL,
  points_spent    INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'claimed'
                    CHECK (status IN ('claimed', 'fulfilled', 'cancelled')),
  fulfilled_at    TIMESTAMPTZ,
  fulfilled_by    TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rep_claims_org_id     ON rep_reward_claims(org_id);
CREATE INDEX IF NOT EXISTS idx_rep_claims_rep_id     ON rep_reward_claims(rep_id);
CREATE INDEX IF NOT EXISTS idx_rep_claims_reward_id  ON rep_reward_claims(reward_id);
CREATE INDEX IF NOT EXISTS idx_rep_claims_status     ON rep_reward_claims(org_id, status);


-- ────────────────────────────────────────────────────────────────────────────
-- 10. ORDERS TABLE — ensure metadata column exists (for discount_code + rep_id)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE orders ADD COLUMN metadata JSONB;
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 11. RPC: increment_sold (if not already present — used by order creation)
--     This is a no-op if it already exists.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_sold(row_id UUID, qty INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE ticket_types
  SET sold = COALESCE(sold, 0) + qty
  WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;


-- ────────────────────────────────────────────────────────────────────────────
-- 12. DONE
-- ────────────────────────────────────────────────────────────────────────────
-- All tables created. Summary:
--
--   discounts          — added rep_id column (FK → reps)
--   reps               — core rep profiles
--   rep_events         — rep ↔ event assignments
--   rep_rewards        — reward definitions
--   rep_milestones     — auto-trigger thresholds
--   rep_points_log     — append-only points ledger
--   rep_quests         — quest/task definitions
--   rep_quest_submissions — proof submissions
--   rep_reward_claims  — reward redemptions
--   orders.metadata    — JSONB column for discount_code + rep attribution
--
-- Next: Configure RLS policies if you want database-level org_id enforcement.
-- ────────────────────────────────────────────────────────────────────────────
