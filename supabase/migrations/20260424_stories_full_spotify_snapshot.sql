-- Store the full Spotify track snapshot on each story row so the viewer
-- never has to round-trip to Spotify. iOS wants a richer shape than the
-- columns we originally cut (single flat artist string → array of {id,name},
-- album name, external_url, track duration).

ALTER TABLE public.rep_stories
  ADD COLUMN IF NOT EXISTS spotify_album_name      text,
  ADD COLUMN IF NOT EXISTS spotify_external_url    text,
  ADD COLUMN IF NOT EXISTS spotify_duration_ms     integer,
  ADD COLUMN IF NOT EXISTS spotify_artists         jsonb;

-- Backfill any pre-snapshot data so reads stay consistent: lift the flat
-- spotify_track_artist string into the new artists[] array shape.
UPDATE public.rep_stories
   SET spotify_artists = jsonb_build_array(jsonb_build_object('id','', 'name', spotify_track_artist))
 WHERE spotify_artists IS NULL AND spotify_track_artist IS NOT NULL;
