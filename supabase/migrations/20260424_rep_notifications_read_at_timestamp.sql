-- iOS wants a nullable read_at timestamp (better UX: "read 5m ago")
-- rather than a bool. Keep `read` for web-v1 compat; the two are kept
-- in sync via app code AND a safety trigger.

ALTER TABLE public.rep_notifications
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

UPDATE public.rep_notifications
   SET read_at = created_at
 WHERE read = true AND read_at IS NULL;

CREATE OR REPLACE FUNCTION public.rep_notifications_read_sync() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.read = true AND OLD.read = false AND NEW.read_at IS NULL THEN
      NEW.read_at := now();
    ELSIF NEW.read_at IS NOT NULL AND OLD.read_at IS NULL THEN
      NEW.read := true;
    ELSIF NEW.read_at IS NULL AND OLD.read_at IS NOT NULL THEN
      NEW.read := false;
    ELSIF NEW.read = false AND OLD.read = true AND NEW.read_at = OLD.read_at THEN
      NEW.read_at := NULL;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.read_at IS NOT NULL THEN
      NEW.read := true;
    ELSE
      NEW.read := false;
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rep_notifications_read_sync ON public.rep_notifications;
CREATE TRIGGER rep_notifications_read_sync
  BEFORE INSERT OR UPDATE ON public.rep_notifications
  FOR EACH ROW EXECUTE FUNCTION public.rep_notifications_read_sync();
