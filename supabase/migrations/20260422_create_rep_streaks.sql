-- Phase 5.2: daily activity streaks per rep.
-- Drives the "🔥 7-day streak" UI element on iOS home screen.
-- Increment happens inside a single upsert called from every dashboard
-- fetch — simpler than tracking "first fetch today" separately.

CREATE TABLE IF NOT EXISTS public.rep_streaks (
  rep_id UUID PRIMARY KEY REFERENCES public.reps(id) ON DELETE CASCADE,
  current_streak INT NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  best_streak INT NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  last_active_date DATE NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rep_streaks ENABLE ROW LEVEL SECURITY;

-- Dashboard endpoints use service_role; no authenticated policies needed.

-- ---------------------------------------------------------------------------
-- mark_rep_active — upsert called from dashboard GET. Idempotent per day.
--
-- Rules:
--   • First activity on a new day: current_streak increments if yesterday
--     was active, otherwise resets to 1. best_streak = max(best, current).
--   • Same-day repeat: no change (returns early).
--   • Gap of 2+ days: current_streak resets to 1 on the next activity.
--     That reset is what makes the midnight cron redundant — any rep who
--     opens the app the day after their streak breaks, immediately
--     sees current_streak = 1.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_rep_active(
  p_rep_id UUID,
  p_today DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (current_streak INT, best_streak INT, last_active_date DATE)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row public.rep_streaks%ROWTYPE;
  v_new_streak INT;
  v_new_best INT;
BEGIN
  SELECT * INTO v_row FROM public.rep_streaks WHERE rep_id = p_rep_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.rep_streaks (rep_id, current_streak, best_streak, last_active_date)
    VALUES (p_rep_id, 1, 1, p_today)
    RETURNING rep_streaks.current_streak, rep_streaks.best_streak, rep_streaks.last_active_date
    INTO current_streak, best_streak, last_active_date;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Same day — no-op, return current state
  IF v_row.last_active_date = p_today THEN
    current_streak := v_row.current_streak;
    best_streak := v_row.best_streak;
    last_active_date := v_row.last_active_date;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Consecutive day — increment
  IF v_row.last_active_date = p_today - INTERVAL '1 day' THEN
    v_new_streak := v_row.current_streak + 1;
  ELSE
    -- Gap — reset streak to 1
    v_new_streak := 1;
  END IF;
  v_new_best := GREATEST(v_row.best_streak, v_new_streak);

  UPDATE public.rep_streaks
  SET current_streak = v_new_streak,
      best_streak = v_new_best,
      last_active_date = p_today,
      updated_at = now()
  WHERE rep_id = p_rep_id;

  current_streak := v_new_streak;
  best_streak := v_new_best;
  last_active_date := p_today;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.mark_rep_active IS
  'Called from dashboard GET. Increments rep_streaks on consecutive-day activity, resets on gap, no-ops on same-day repeat.';

-- ---------------------------------------------------------------------------
-- reset_stale_streaks — midnight cron helper. Zeros out current_streak
-- (but keeps best_streak) for reps who haven't been active in 2+ days.
-- This way the home screen shows 0 the morning after a broken streak,
-- without waiting for the rep to open the app.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reset_stale_streaks()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reset_count INT;
BEGIN
  UPDATE public.rep_streaks
  SET current_streak = 0,
      updated_at = now()
  WHERE current_streak > 0
    AND last_active_date < CURRENT_DATE - INTERVAL '1 day';

  GET DIAGNOSTICS v_reset_count = ROW_COUNT;
  RETURN v_reset_count;
END;
$$;
