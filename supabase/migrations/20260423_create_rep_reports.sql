-- App Store Guideline 1.2 (UGC apps must expose user-safety reporting).
-- iOS LeaderboardRow / PeerActivityCard / RepProfileScreen now show a
-- report option that POSTs to /api/rep-portal/reports. This table is
-- the persistence layer; admin triage UI ships in a follow-up PR.

CREATE TABLE public.rep_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_rep_id uuid NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  target_rep_id uuid NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  reason_code text NOT NULL CHECK (reason_code = ANY (ARRAY[
    'spam'::text,
    'harassment'::text,
    'impersonation'::text,
    'inappropriate_content'::text,
    'other'::text
  ])),
  surface text NOT NULL CHECK (surface = ANY (ARRAY[
    'profile'::text,
    'peer_activity'::text,
    'leaderboard'::text,
    'message'::text
  ])),
  free_text text CHECK (free_text IS NULL OR length(free_text) <= 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status = ANY (ARRAY[
    'open'::text,
    'reviewing'::text,
    'actioned'::text,
    'dismissed'::text
  ])),
  reviewed_by_user_id uuid,
  reviewed_at timestamp with time zone,
  review_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  -- Defense in depth: the route also blocks self-reports with a 400.
  CONSTRAINT rep_reports_no_self_report CHECK (reporter_rep_id <> target_rep_id)
);

CREATE INDEX rep_reports_target_idx ON public.rep_reports(target_rep_id);
CREATE INDEX rep_reports_reporter_idx ON public.rep_reports(reporter_rep_id);
CREATE INDEX rep_reports_status_idx ON public.rep_reports(status, created_at DESC);

ALTER TABLE public.rep_reports ENABLE ROW LEVEL SECURITY;
-- All access goes through service role (admin client) — reports must
-- never be readable by other reps. No anon/authenticated policies.
