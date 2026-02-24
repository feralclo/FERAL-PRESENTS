ALTER TABLE events
  ADD COLUMN IF NOT EXISTS queue_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS queue_duration_seconds integer DEFAULT 45,
  ADD COLUMN IF NOT EXISTS queue_window_minutes integer DEFAULT 60;
