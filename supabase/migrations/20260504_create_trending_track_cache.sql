-- Trending track cache + per-rep impression tracking.
--
-- Powers /api/rep-portal/spotify/suggestions. The pool is refreshed every
-- 6h by /api/cron/spotify-trending-refresh from a hand-curated platform-
-- level list of Spotify playlists (no per-promoter / per-rep tagging — see
-- src/lib/music/trending-playlists.ts for the source list).
--
-- Service role bypasses RLS — same pattern as every other rep_* table.
-- Reads come in via the API layer behind requireRepAuth().

-- 1. Per-playlist meta. snapshot_id is Spotify's content fingerprint;
--    when it changes we know the curator added/removed/reordered tracks.
CREATE TABLE public.trending_playlist_snapshots (
  playlist_id text PRIMARY KEY,
  snapshot_id text NOT NULL,
  spotify_name text,
  followers integer NOT NULL DEFAULT 0,
  total_tracks integer NOT NULL DEFAULT 0,
  last_refreshed_at timestamptz NOT NULL DEFAULT now()
);

-- 2. The track pool — every track currently in any configured playlist.
--    `first_seen_at` survives across refreshes (we only insert when the
--    track is genuinely new), so the freshness boost in track-mix.ts can
--    use it without losing fidelity when Spotify tracks bump positions.
CREATE TABLE public.trending_track_pool (
  playlist_id text NOT NULL,
  track_id text NOT NULL,
  position integer NOT NULL,
  added_at_spotify timestamptz NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  popularity integer NOT NULL DEFAULT 0,
  track_data jsonb NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, track_id)
);

-- Cross-playlist co-occurrence is a key signal in the smart-mix algorithm:
-- a track in 2+ playlists gets a quality boost. This index makes the
-- "how many playlists is track X in" lookup O(playlists) instead of O(pool).
CREATE INDEX trending_track_pool_track_idx ON public.trending_track_pool (track_id);

-- Recency-sort within a playlist for cold-start sampling.
CREATE INDEX trending_track_pool_recency_idx
  ON public.trending_track_pool (playlist_id, added_at_spotify DESC);

-- 3. Per-rep impression log. Lets us:
--    - dedupe (don't show the same track over and over)
--    - rotate (drop a track from the rep's pool after N impressions without a pick)
--    Composite PK keeps the row count linear in (reps × tracks-they've-seen).
CREATE TABLE public.rep_track_impressions (
  rep_id uuid NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  track_id text NOT NULL,
  count integer NOT NULL DEFAULT 1,
  first_shown_at timestamptz NOT NULL DEFAULT now(),
  last_shown_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rep_id, track_id)
);

-- Hot path: "what has this rep already seen recently?"
CREATE INDEX rep_track_impressions_rep_recency_idx
  ON public.rep_track_impressions (rep_id, last_shown_at DESC);

ALTER TABLE public.trending_playlist_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trending_track_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rep_track_impressions ENABLE ROW LEVEL SECURITY;
