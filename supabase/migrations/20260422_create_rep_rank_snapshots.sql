-- Backfill: rep_rank_snapshots was specified in ENTRY-IOS-BACKEND-SPEC §5.13
-- and capture_rep_rank_snapshots() was written assuming it existed from
-- Phase 0.5 — but it wasn't actually created in that phase's migration.
-- The weekly cron would have errored on first run. Creating it now.

CREATE TABLE IF NOT EXISTS public.rep_rank_snapshots (
  promoter_id UUID NOT NULL REFERENCES public.promoters(id) ON DELETE CASCADE,
  rep_id UUID NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  rank INT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (promoter_id, rep_id, captured_at)
);

CREATE INDEX IF NOT EXISTS rrs_lookup_idx
  ON public.rep_rank_snapshots (promoter_id, rep_id, captured_at DESC);

-- dashboard route queries by rep_id across multiple promoters — a
-- rep-only lookup index speeds up the delta_week computation.
CREATE INDEX IF NOT EXISTS rrs_rep_captured_idx
  ON public.rep_rank_snapshots (rep_id, captured_at DESC);

ALTER TABLE public.rep_rank_snapshots ENABLE ROW LEVEL SECURITY;

-- Tenant admins can see their own promoter's snapshots for analytics
CREATE POLICY rep_rank_snapshots_tenant_read ON public.rep_rank_snapshots
  FOR SELECT
  TO authenticated
  USING (
    promoter_id IN (
      SELECT id FROM public.promoters WHERE org_id = auth_user_org_id()
    )
  );

-- All writes via service_role (cron + manual admin tools). No authenticated
-- INSERT/UPDATE/DELETE policies — locked by default.

COMMENT ON TABLE public.rep_rank_snapshots IS
  'Weekly snapshot of rolling-30-day rep rank per promoter. Written by capture_rep_rank_snapshots() cron. Read by /api/rep-portal/dashboard + /api/rep-portal/leaderboard to compute delta_week.';
