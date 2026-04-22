-- Split event imagery into three dedicated roles (per ENTRY-IOS-BACKEND-SPEC §5.7).
--
--   cover_image_url  = clean, no baked text — used inside Entry chrome
--                      (cards, rails, hero bands). App already shows title /
--                      date / venue as text alongside.
--   poster_image_url = full poster WITH text (lineup / date / venue typography
--                      baked in). Used ONLY for share-to-Story flows where
--                      the poster is the entire message on IG / TikTok.
--   banner_image_url = landscape 16:9 variant for event card headers.
--
-- The legacy `cover_image` + `hero_image` TEXT columns remain because the
-- live event pages, tickets, emails and scanner all read them. They continue
-- to be the source of truth for v1 web UI. New clients (iOS / Android / web-v2)
-- read the *_url columns. Admins fill the new slots through the event editor.

ALTER TABLE public.events ADD COLUMN cover_image_url TEXT;
ALTER TABLE public.events ADD COLUMN poster_image_url TEXT;
ALTER TABLE public.events ADD COLUMN banner_image_url TEXT;

-- One-shot backfill: copy legacy cover_image into cover_image_url so the new
-- clients have a baseline image even before tenants re-upload. This picks up
-- what's already there — it doesn't distinguish "clean" from "text-baked",
-- admins do that by re-uploading into the right slot when they edit the event.
UPDATE public.events
SET cover_image_url = cover_image
WHERE cover_image_url IS NULL
  AND cover_image IS NOT NULL
  AND cover_image <> '';

COMMENT ON COLUMN public.events.cover_image_url IS
  'Clean cover artwork (no baked text). Used inside app chrome where event title/date/venue are rendered separately.';
COMMENT ON COLUMN public.events.poster_image_url IS
  'Full poster with text baked in (lineup, date, venue). Used only for share-to-Story exports.';
COMMENT ON COLUMN public.events.banner_image_url IS
  'Landscape 16:9 banner for event card headers.';
