-- Expand rep_notifications.type to cover the v2 rep-app surfaces.
-- Per ENTRY-IOS-BACKEND-SPEC §5.15.

ALTER TABLE public.rep_notifications
  DROP CONSTRAINT IF EXISTS rep_notifications_type_check;

ALTER TABLE public.rep_notifications
  ADD CONSTRAINT rep_notifications_type_check
  CHECK (type IN (
    'reward_unlocked',
    'quest_approved',
    'quest_rejected',
    'quest_revision_requested',
    'sale_attributed',
    'first_sale_for_event',
    'level_up',
    'leaderboard_top10',
    'reward_fulfilled',
    'manual_grant',
    'approved',
    'team_request_approved',
    'team_request_rejected',
    'poster_drop',
    'peer_milestone',
    'general'
  ));
