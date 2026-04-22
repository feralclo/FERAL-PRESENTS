-- Phase 5.1: weekly snapshot of each rep's rolling-30-day rank per promoter.
-- Drives delta_week on /leaderboard and the "↑3 this week" UI.
--
-- Strategy: for each approved membership, rank reps in that promoter's
-- org by XP earned in the trailing 30 days (rep_points_log.points). Ties
-- broken by total_sales desc, then rep_id for stability.
--
-- Called from /api/cron/rep-rank-snapshots every Monday at 02:00 UTC.
-- Idempotent: if run twice on the same day, the second run overwrites
-- the earlier snapshot for that (promoter_id, rep_id) pair.

CREATE OR REPLACE FUNCTION public.capture_rep_rank_snapshots()
RETURNS TABLE (promoters_processed INT, reps_snapshotted INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_window_start TIMESTAMPTZ := now() - INTERVAL '30 days';
  v_promoters INT := 0;
  v_reps INT := 0;
BEGIN
  -- Delete today's rows first so a second run on the same calendar day
  -- is a clean re-snapshot, not a duplicate.
  DELETE FROM public.rep_rank_snapshots
  WHERE captured_at::date = v_now::date;

  WITH scored AS (
    SELECT
      p.id AS promoter_id,
      r.id AS rep_id,
      COALESCE(SUM(l.points), 0) AS window_xp,
      r.total_sales
    FROM public.promoters p
    JOIN public.rep_promoter_memberships m
      ON m.promoter_id = p.id
      AND m.status = 'approved'
    JOIN public.reps r ON r.id = m.rep_id AND r.status = 'active'
    LEFT JOIN public.rep_points_log l
      ON l.rep_id = r.id
      AND l.org_id = p.org_id
      AND l.created_at >= v_window_start
    GROUP BY p.id, r.id, r.total_sales
  ),
  ranked AS (
    SELECT
      promoter_id,
      rep_id,
      ROW_NUMBER() OVER (
        PARTITION BY promoter_id
        ORDER BY window_xp DESC, total_sales DESC, rep_id
      )::INT AS rank
    FROM scored
  ),
  inserted AS (
    INSERT INTO public.rep_rank_snapshots (promoter_id, rep_id, rank, captured_at)
    SELECT promoter_id, rep_id, rank, v_now FROM ranked
    RETURNING promoter_id, rep_id
  )
  SELECT COUNT(DISTINCT promoter_id)::INT, COUNT(*)::INT
  INTO v_promoters, v_reps
  FROM inserted;

  RETURN QUERY SELECT v_promoters, v_reps;
END;
$$;

COMMENT ON FUNCTION public.capture_rep_rank_snapshots IS
  'Phase 5.1 — snapshots every approved rep''s rolling-30-day rank per promoter. Idempotent on calendar day. Drives /leaderboard delta_week.';
