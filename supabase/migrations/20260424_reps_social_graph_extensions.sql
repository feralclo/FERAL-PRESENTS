-- iOS Round 2 foundation: follower counts (exposed), banner (exposed),
-- attended-events tracking (TRACK but DON'T expose yet — frontend switches
-- it on post-launch when there's enough data to make the number meaningful).

-- 1. Add columns to reps
ALTER TABLE public.reps
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS follower_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.reps
  ADD CONSTRAINT reps_banner_url_length CHECK (banner_url IS NULL OR length(banner_url) <= 2000);

-- 2. Triggers on rep_follows to maintain follower_count / following_count
CREATE OR REPLACE FUNCTION public.rf_maintain_rep_counts() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.reps SET follower_count  = follower_count  + 1, updated_at = now() WHERE id = NEW.followee_id;
    UPDATE public.reps SET following_count = following_count + 1, updated_at = now() WHERE id = NEW.follower_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.reps SET follower_count  = GREATEST(follower_count  - 1, 0), updated_at = now() WHERE id = OLD.followee_id;
    UPDATE public.reps SET following_count = GREATEST(following_count - 1, 0), updated_at = now() WHERE id = OLD.follower_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rf_rep_counts_sync ON public.rep_follows;
CREATE TRIGGER rf_rep_counts_sync
  AFTER INSERT OR DELETE ON public.rep_follows
  FOR EACH ROW EXECUTE FUNCTION public.rf_maintain_rep_counts();

-- 3. Backfill follower/following counts from existing rep_follows rows
UPDATE public.reps r SET
  follower_count  = COALESCE((SELECT count(*) FROM public.rep_follows f WHERE f.followee_id = r.id), 0),
  following_count = COALESCE((SELECT count(*) FROM public.rep_follows f WHERE f.follower_id = r.id), 0);

-- 4. Attended-events junction — unique (rep_id, event_id)
CREATE TABLE IF NOT EXISTS public.rep_event_attendance (
  rep_id        uuid NOT NULL REFERENCES public.reps(id)   ON DELETE CASCADE,
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rep_id, event_id)
);
CREATE INDEX IF NOT EXISTS rep_event_attendance_rep_idx   ON public.rep_event_attendance(rep_id);
CREATE INDEX IF NOT EXISTS rep_event_attendance_event_idx ON public.rep_event_attendance(event_id);

-- 5. Trigger on tickets: record attendance when a matching rep's email holds the ticket.
CREATE OR REPLACE FUNCTION public.ticket_track_rep_attendance() RETURNS trigger AS $$
DECLARE
  v_email text;
  v_rep_id uuid;
BEGIN
  v_email := lower(trim(COALESCE(
    NEW.holder_email,
    (SELECT c.email FROM public.customers c WHERE c.id = NEW.customer_id LIMIT 1)
  )));
  IF v_email IS NULL OR v_email = '' THEN RETURN NEW; END IF;

  SELECT r.id INTO v_rep_id
  FROM public.reps r
  WHERE r.org_id = NEW.org_id
    AND lower(r.email) = v_email
    AND r.status IN ('active','pending')
  LIMIT 1;

  IF v_rep_id IS NOT NULL THEN
    INSERT INTO public.rep_event_attendance (rep_id, event_id, first_seen_at)
    VALUES (v_rep_id, NEW.event_id, now())
    ON CONFLICT (rep_id, event_id) DO NOTHING;
  END IF;

  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ticket_attendance_sync ON public.tickets;
CREATE TRIGGER ticket_attendance_sync
  AFTER INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.ticket_track_rep_attendance();

-- 6. Backfill attendance from existing tickets
INSERT INTO public.rep_event_attendance (rep_id, event_id, first_seen_at)
SELECT DISTINCT ON (r.id, t.event_id) r.id, t.event_id, t.created_at
FROM public.tickets t
JOIN public.reps r
  ON r.org_id = t.org_id
 AND r.status IN ('active','pending')
 AND lower(r.email) = lower(trim(COALESCE(
   t.holder_email,
   (SELECT c.email FROM public.customers c WHERE c.id = t.customer_id LIMIT 1)
 )))
ORDER BY r.id, t.event_id, t.created_at ASC
ON CONFLICT (rep_id, event_id) DO NOTHING;
