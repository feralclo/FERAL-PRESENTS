ALTER TABLE events
  ADD COLUMN IF NOT EXISTS queue_title text,
  ADD COLUMN IF NOT EXISTS queue_subtitle text;
