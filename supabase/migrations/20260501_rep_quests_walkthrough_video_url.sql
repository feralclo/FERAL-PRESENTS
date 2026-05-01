ALTER TABLE rep_quests
  ADD COLUMN IF NOT EXISTS walkthrough_video_url TEXT NULL;

COMMENT ON COLUMN rep_quests.walkthrough_video_url IS 'Optional Mux playback id for a tenant-uploaded screen recording showing reps how to do the quest. Same convention as video_url.';
