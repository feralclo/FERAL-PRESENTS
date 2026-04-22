-- Rep-uploaded media bucket — avatars, banners, quest-proof screenshots.
-- Public-read (URLs are content-addressable UUIDs, non-guessable) but
-- writes go through our own /api/rep-portal/uploads endpoints using
-- service-role generated signed upload URLs.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rep-media',
  'rep-media',
  true,
  10 * 1024 * 1024,  -- 10MB upper bound; route enforces per-kind caps (2MB avatar, 8MB proof)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Public-read policy (matches artist-media pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Public read access for rep-media'
  ) THEN
    CREATE POLICY "Public read access for rep-media"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'rep-media');
  END IF;
END $$;

-- Writes via service-role only (no authenticated INSERT policy). Clients
-- get signed upload URLs from /api/rep-portal/uploads/signed-url; those
-- URLs carry the service-role's permission to write for ~10 minutes.
-- Rationale: we want per-kind size caps and rep-ownership validation
-- that only the route layer can enforce, not RLS.
