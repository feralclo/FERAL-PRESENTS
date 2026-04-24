-- Stories — ephemeral posts (default 24h expiry). Every story MUST have
-- a Spotify track attached, enforced by NOT NULL on spotify_track_id.
-- That's the product differentiator vs IG/TikTok.

CREATE TABLE public.rep_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL,
  author_rep_id uuid NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,

  media_url text NOT NULL,
  media_kind text NOT NULL CHECK (media_kind = ANY (ARRAY['image'::text,'video'::text])),
  media_width  int,
  media_height int,
  duration_ms  int,
  caption text CHECK (caption IS NULL OR length(caption) <= 500),

  spotify_track_id      text NOT NULL,
  spotify_preview_url   text NOT NULL,
  spotify_track_title   text NOT NULL,
  spotify_track_artist  text NOT NULL,
  spotify_album_image_url text,
  spotify_clip_start_ms int NOT NULL DEFAULT 0 CHECK (spotify_clip_start_ms >= 0),
  spotify_clip_length_ms int NOT NULL DEFAULT 30000 CHECK (spotify_clip_length_ms BETWEEN 1000 AND 30000),

  event_id    uuid REFERENCES public.events(id)   ON DELETE SET NULL,
  promoter_id uuid REFERENCES public.promoters(id) ON DELETE SET NULL,

  visibility text NOT NULL DEFAULT 'public' CHECK (visibility = ANY (ARRAY['public'::text,'followers'::text])),
  expires_at  timestamptz NOT NULL,
  deleted_at  timestamptz,

  view_count int NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rs_author_created_idx ON public.rep_stories(author_rep_id, created_at DESC);
CREATE INDEX rs_active_expiry_idx  ON public.rep_stories(expires_at) WHERE deleted_at IS NULL;
CREATE INDEX rs_active_promoter_idx ON public.rep_stories(promoter_id, created_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE public.rep_stories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.rep_story_views (
  story_id  uuid NOT NULL REFERENCES public.rep_stories(id) ON DELETE CASCADE,
  viewer_rep_id uuid NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_rep_id)
);

CREATE INDEX rsv_viewer_idx ON public.rep_story_views(viewer_rep_id, viewed_at DESC);

ALTER TABLE public.rep_story_views ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.rs_view_count_sync() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.rep_stories SET view_count = view_count + 1 WHERE id = NEW.story_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.rep_stories SET view_count = GREATEST(view_count - 1, 0) WHERE id = OLD.story_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER rsv_count_sync
  AFTER INSERT OR DELETE ON public.rep_story_views
  FOR EACH ROW EXECUTE FUNCTION public.rs_view_count_sync();

CREATE TRIGGER rs_set_updated_at
  BEFORE UPDATE ON public.rep_stories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
