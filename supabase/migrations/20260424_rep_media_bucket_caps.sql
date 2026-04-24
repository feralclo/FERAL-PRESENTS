-- Single source of truth for the rep-media bucket's upload caps.
-- Must stay in sync with src/lib/uploads/rep-media-config.ts. If the
-- TS file changes, re-run this migration (idempotent).
--
-- Why this matters: when the endpoint's allowlist and the bucket's
-- allowlist disagree, the client gets a signed URL from the endpoint
-- and then 415s on the PUT. iOS hit this with video/quicktime — the
-- endpoint accepted it, the bucket rejected it.

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         -- images
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/heic',
         'image/heif',
         -- video (story_video)
         'video/mp4',
         'video/quicktime'
       ]::text[],
       file_size_limit = 52428800  -- 50 MiB — matches story_video cap
 WHERE id = 'rep-media';
