-- Seed one promoter row per existing org_id, pulling display_name and social
-- links from {org_id}_branding site_settings where available. Idempotent via
-- ON CONFLICT — safe to rerun.

INSERT INTO public.promoters (
  org_id,
  handle,
  display_name,
  avatar_initials,
  cover_image_url,
  instagram,
  tiktok,
  website
)
SELECT
  ou.org_id,
  ou.org_id AS handle,
  COALESCE(
    (SELECT data->>'org_name' FROM public.site_settings WHERE key = ou.org_id || '_branding'),
    INITCAP(REPLACE(ou.org_id, '-', ' '))
  ) AS display_name,
  UPPER(LEFT(
    COALESCE(
      (SELECT data->>'org_name' FROM public.site_settings WHERE key = ou.org_id || '_branding'),
      ou.org_id
    ),
    1
  )) AS avatar_initials,
  (SELECT data->>'logo_url' FROM public.site_settings WHERE key = ou.org_id || '_branding') AS cover_image_url,
  NULLIF((SELECT data->'social_links'->>'instagram' FROM public.site_settings WHERE key = ou.org_id || '_branding'), '') AS instagram,
  NULLIF((SELECT data->'social_links'->>'tiktok' FROM public.site_settings WHERE key = ou.org_id || '_branding'), '') AS tiktok,
  NULLIF((SELECT data->'social_links'->>'website' FROM public.site_settings WHERE key = ou.org_id || '_branding'), '') AS website
FROM (SELECT DISTINCT org_id FROM public.org_users) ou
ON CONFLICT (org_id) DO NOTHING;
