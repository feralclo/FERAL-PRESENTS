-- ═══════════════════════════════════════════════════════════════════════
-- Rep Event Position Rewards — Per-event leaderboard position prizes
-- ═══════════════════════════════════════════════════════════════════════
-- Stores what reward is assigned to each leaderboard position (1st, 2nd, 3rd)
-- for each event. When the admin "locks" the leaderboard after an event,
-- awarded_rep_id and awarded_at are populated, and reward claims are created.
-- An event leaderboard is considered "locked" when awarded_rep_id IS NOT NULL
-- on any position row for that event.

CREATE TABLE IF NOT EXISTS rep_event_position_rewards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL DEFAULT 'feral',
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL CHECK (position >= 1 AND position <= 10),
  reward_id       UUID REFERENCES rep_rewards(id) ON DELETE SET NULL,
  reward_name     TEXT NOT NULL DEFAULT '',
  awarded_rep_id  UUID REFERENCES reps(id) ON DELETE SET NULL,
  awarded_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, event_id, position)
);

CREATE INDEX IF NOT EXISTS idx_rep_event_pos_rewards_event
  ON rep_event_position_rewards(org_id, event_id);
