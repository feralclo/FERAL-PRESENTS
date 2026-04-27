-- Three new rep_notifications.type values for the iOS push fanout:
--   reward_drop      — promoter dropped a new quest
--   event_reminder   — 24h / 2h before a tracked event
--   streak_at_risk   — daily nudge if rep has an active streak and zero XP today
--
-- And a small dedup table for event_reminder so the hourly cron can fire
-- once per (rep, event, kind) without scanning notification_deliveries.
--
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
    'rep_follow'::text,
    'reward_drop'::text,
    'event_reminder'::text,
    'streak_at_risk'::text
  ]));

CREATE TABLE IF NOT EXISTS public.rep_event_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('24h', '2h')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rep_id, event_id, kind)
);

CREATE INDEX IF NOT EXISTS rep_event_reminders_event_idx
  ON public.rep_event_reminders (event_id);

ALTER TABLE public.rep_event_reminders ENABLE ROW LEVEL SECURITY;

-- Cron writes via service role, which bypasses RLS. No SELECT policies for
-- end users — this is internal dedup state, not surfaced to clients.
