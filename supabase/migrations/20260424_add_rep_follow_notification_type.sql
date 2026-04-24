-- Extend rep_notifications.type CHECK for the new rep_follow type.
-- Must stay in sync with RepNotificationType in src/types/reps.ts.

ALTER TABLE public.rep_notifications DROP CONSTRAINT IF EXISTS rep_notifications_type_check;

ALTER TABLE public.rep_notifications ADD CONSTRAINT rep_notifications_type_check
  CHECK (type = ANY (ARRAY[
    'reward_unlocked'::text,
    'quest_approved'::text,
    'quest_rejected'::text,
    'quest_revision_requested'::text,
    'sale_attributed'::text,
    'first_sale_for_event'::text,
    'level_up'::text,
    'leaderboard_top10'::text,
    'reward_fulfilled'::text,
    'manual_grant'::text,
    'approved'::text,
    'team_request_approved'::text,
    'team_request_rejected'::text,
    'poster_drop'::text,
    'peer_milestone'::text,
    'general'::text,
    'rep_follow'::text
  ]));
