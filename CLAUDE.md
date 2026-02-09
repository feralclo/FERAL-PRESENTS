# FERAL PRESENTS — Project Context

## What This Is
FERAL PRESENTS is an events/ticketing platform currently used for FERAL's own events (Liverpool, Kompass Klub). The long-term vision is to become a "Shopify for Events" — a white-label platform where any promoter/artist can sell tickets, merch, and manage events under their own brand.

## Current Stack
- **Frontend**: Static HTML files served by Vercel
- **Backend/Database**: Supabase (PostgreSQL + REST API + Realtime)
- **Hosting**: Vercel (static deployment)
- **Payments**: Currently via Eventix (third-party) — migrating to Stripe
- **Analytics**: Custom Supabase tables (traffic_events, popup_events) + GTM/Meta Pixel

## Migration In Progress: Moving to Next.js
The entire project is being migrated to **Next.js (React)** to support:
- Server-side API routes (Stripe webhooks, email sending, server-side tracking)
- React components for admin dashboard and public pages
- Proper routing and code sharing between pages
- Server-side rendering for SEO on public pages
- Static generation for event pages (same speed as current flat HTML)

### Migration Rules
- **Do NOT break existing functionality** — all current pages must continue working
- **All existing CSS, design, and UX must be preserved** — the site should look identical
- **Supabase remains the database** — no database migration needed
- **Vercel remains the host** — Next.js deploys natively to Vercel
- **Keep the same URL structure** — /event/liverpool-27-march/, /admin/, etc.

## Architecture Decisions (For Scale)

### Multi-Tenancy: org_id on ALL tables
Every database table must include an `org_id` column. This is critical for future multi-tenancy.
- For now, org_id is always `'feral'`
- Every Supabase query must filter by org_id
- Supabase RLS policies must enforce org_id isolation
- This allows multiple companies to use the platform later without any schema changes

### Settings System
- Settings are stored in Supabase `site_settings` table (key → JSONB data)
- Settings are fetched with `cache: 'no-store'` to prevent stale data
- Pages use a "fetch-first" pattern: page is hidden until Supabase responds, localStorage is only a fallback
- Body scripts apply settings from cache immediately AND listen for `feral:settings` CustomEvent for fresh data
- Admin saves via `feralSettings.save()` which upserts to Supabase

### Event Pages (Current Structure)
- `/event/liverpool-27-march/` — main event page with theme support (default/minimal)
- `/event/liverpool-27-march/tickets/` — ticket selection page
- `/event/liverpool-27-march/checkout/` — checkout flow (currently Eventix, migrating to Stripe)
- `/event/kompass-klub-7-march/` — Kompass event (simpler, offsite tickets)

### Admin Dashboard
- `/admin/` — single-page admin panel
- Event settings (theme, cover photo, ticket names/IDs/prices, lineup, sizes)
- Traffic analytics (funnel: landing → tickets → checkout → purchase)
- Popup analytics
- Realtime data via Supabase subscriptions

## What's Being Built Next
1. **Stripe Checkout** — replace Eventix entirely, handle Apple Pay/Google Pay/Klarna
2. **QR Ticket Generation** — generate tickets with QR codes after purchase
3. **Email Confirmations** — send tickets via email (SendGrid/Postmark)
4. **Scanner PWA** — mobile web app for door staff to scan QR codes at entry
5. **Server-Side Conversion Tracking** — Meta CAPI, Google Measurement Protocol, TikTok Events API
6. **Order Management** — view orders, process refunds, download guest lists
7. **Event Creation** — create new events from the admin dashboard
8. **Promoter Dashboard** — (later) multi-tenant dashboard for other promoters

## Supabase Tables
- `site_settings` — key/value store for event configuration (JSONB)
- `traffic_events` — funnel tracking (landing, tickets, checkout, purchase, add_to_cart)
- `popup_events` — popup interaction tracking (impressions, clicked, closed)
- More tables to come for: orders, tickets, events, organisations, users

## Key Files (Current)
| Path | Purpose |
|------|---------|
| `/js/feral-settings.js` | Settings persistence layer (Supabase + localStorage) |
| `/js/feral-traffic.js` | Traffic/funnel tracking via Supabase REST API |
| `/css/style.css` | All styles including theme-minimal variant |
| `/admin/index.html` | Admin dashboard (will be rebuilt in Next.js) |
| `/event/liverpool-27-march/index.html` | Main event page |
| `/vercel.json` | Vercel config (rewrites, cache headers) |

## Credentials & Config
- Supabase URL: `https://rqtfghzhkkdytkegcifm.supabase.co`
- Supabase anon key is in `js/feral-settings.js` and inline in event page head scripts
- Admin auth is client-side (sessionStorage) — needs proper auth in Next.js migration

## Design Principles
- Dark aesthetic (#0e0e0e background, red #ff0033 accent)
- Fonts: Space Mono (headings/mono), Inter (body)
- Glitch/scanline effects, noise textures
- Mobile-first — most ticket buyers are on mobile
- Speed is critical — pages must load instantly
- Settings changes in admin must reflect on the live site immediately (no stale data)
