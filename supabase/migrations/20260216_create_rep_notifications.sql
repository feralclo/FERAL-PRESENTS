-- Create rep_notifications table for in-app notification center
CREATE TABLE IF NOT EXISTS rep_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL DEFAULT 'feral',
  rep_id UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'reward_unlocked',
    'quest_approved',
    'sale_attributed',
    'level_up',
    'reward_fulfilled',
    'manual_grant'
  )),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_rep_notifications_rep_org ON rep_notifications(rep_id, org_id);
CREATE INDEX idx_rep_notifications_rep_unread ON rep_notifications(rep_id, org_id, read) WHERE read = false;
CREATE INDEX idx_rep_notifications_created ON rep_notifications(created_at DESC);
