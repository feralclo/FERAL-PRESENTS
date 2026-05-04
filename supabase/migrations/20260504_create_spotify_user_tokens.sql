-- Per-rep Spotify OAuth connection. iOS Settings row triggers a connect
-- flow against Spotify's user-auth endpoints; the resulting access +
-- refresh tokens are AES-256-GCM encrypted at the application layer
-- (see lib/spotify/user-auth.ts) and stored here.
--
-- Service role bypasses RLS — application code is the only writer.

CREATE TABLE public.spotify_user_tokens (
  rep_id uuid PRIMARY KEY REFERENCES public.reps(id) ON DELETE CASCADE,
  spotify_user_id text NOT NULL,
  display_name text,
  is_premium boolean,
  -- Encrypted at rest by the application (envelope: {iv, ciphertext, tag},
  -- base64-joined). Never write a plaintext token to this table.
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  scope text NOT NULL,
  expires_at timestamptz NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX spotify_user_tokens_spotify_user_idx
  ON public.spotify_user_tokens (spotify_user_id);

ALTER TABLE public.spotify_user_tokens ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER spotify_user_tokens_set_updated_at
  BEFORE UPDATE ON public.spotify_user_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
