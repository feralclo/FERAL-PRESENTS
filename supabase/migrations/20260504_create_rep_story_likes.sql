-- Story likes — one row per (story, rep). Service role bypasses RLS,
-- which is how every other rep_* table is read; readers/writers come in
-- via the API layer behind requireRepAuth().

CREATE TABLE public.rep_story_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.rep_stories(id) ON DELETE CASCADE,
  rep_id uuid NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, rep_id)
);

CREATE INDEX rep_story_likes_story_idx ON public.rep_story_likes (story_id, created_at DESC);
CREATE INDEX rep_story_likes_rep_idx ON public.rep_story_likes (rep_id, created_at DESC);

ALTER TABLE public.rep_story_likes ENABLE ROW LEVEL SECURITY;
