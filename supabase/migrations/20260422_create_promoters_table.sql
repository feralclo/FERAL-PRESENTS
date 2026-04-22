-- Shared helper function — maintains updated_at timestamp on UPDATE.
-- Lives in public schema; future tables needing updated_at behaviour reuse it.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- promoters — public-facing projection of a tenant org
-- 1:1 with an existing org_id. Seeded from org_users in the companion
-- seed migration. Handle = org_id (already URL-safe lowercase slugs).
-- ---------------------------------------------------------------------------

CREATE TABLE public.promoters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL UNIQUE,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  tagline TEXT,
  bio TEXT,
  location TEXT,
  accent_hex INT NOT NULL DEFAULT 12077567,
  avatar_url TEXT,
  avatar_initials TEXT,
  avatar_bg_hex INT,
  cover_image_url TEXT,
  website TEXT,
  instagram TEXT,
  tiktok TEXT,
  follower_count INT NOT NULL DEFAULT 0,
  team_size INT NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX promoters_handle_lower_idx ON public.promoters (lower(handle));

CREATE TRIGGER promoters_set_updated_at
  BEFORE UPDATE ON public.promoters
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.promoters ENABLE ROW LEVEL SECURITY;

-- Public discovery: anyone (including anon) can read public promoter rows.
CREATE POLICY promoters_public_read ON public.promoters
  FOR SELECT
  USING (visibility = 'public');

-- Tenant admins can read/write their own promoter regardless of visibility.
-- Matches the pattern used on reps (`auth_org_all`). Service role bypasses RLS.
CREATE POLICY promoters_tenant_all ON public.promoters
  FOR ALL
  TO authenticated
  USING (org_id = auth_user_org_id())
  WITH CHECK (org_id = auth_user_org_id());

COMMENT ON TABLE public.promoters IS
  'Public-facing projection of a tenant org. One row per org_id. Consumed by rep-portal (iOS/Android/web-v2) for discovery, follow, and team-join flows.';
