-- Seed existing events into the events table.
-- These keep payment_method = 'weeztix' so the existing checkout flow is unchanged.
-- The settings_key links back to the site_settings table for backward compatibility.

INSERT INTO events (org_id, slug, name, venue_name, city, country, date_start, status, visibility, payment_method, settings_key, theme)
VALUES
  ('feral', 'liverpool-27-march', 'FERAL Liverpool', 'Invisible Wind Factory', 'Liverpool', 'UK', '2026-03-27T23:00:00Z', 'live', 'public', 'weeztix', 'feral_event_liverpool', 'default'),
  ('feral', 'kompass-klub-7-march', 'FERAL Kompass Klub', 'Kompass Klub', 'Ghent', 'Belgium', '2026-03-07T23:00:00Z', 'live', 'public', 'weeztix', 'feral_event_kompass', 'minimal')
ON CONFLICT (org_id, slug) DO NOTHING;
