# FERAL PRESENTS — Project Context

## What This Is
FERAL PRESENTS is an events/ticketing platform currently used for FERAL's own events (Liverpool, Kompass Klub). The long-term vision is to become a "Shopify for Events" — a white-label platform where any promoter/artist can sell tickets, merch, and manage events under their own brand.

## Current Stack
- **Frontend**: Next.js 16 (App Router) with TypeScript
- **Backend/Database**: Supabase (PostgreSQL + REST API + Realtime)
- **Hosting**: Vercel (Next.js deployment)
- **Payments**: Currently via WeeZTix/Eventix (third-party) — migrating to Stripe
- **Analytics**: Custom Supabase tables (traffic_events, popup_events) + GTM/Meta Pixel
- **Fonts**: Google Fonts via CDN (Space Mono, Inter)

## Project Structure (Next.js)

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (fonts, GTM, scanlines, cookie consent)
│   ├── page.tsx                  # Landing page (/)
│   ├── event/[slug]/
│   │   ├── layout.tsx            # Event layout (fetches settings, applies theme)
│   │   ├── page.tsx              # Event page (/event/liverpool-27-march/)
│   │   ├── tickets/page.tsx      # Tickets page
│   │   └── checkout/page.tsx     # Checkout page
│   ├── admin/
│   │   ├── layout.tsx            # Admin layout (auth gate, sidebar nav)
│   │   ├── page.tsx              # Dashboard
│   │   ├── traffic/page.tsx      # Traffic analytics
│   │   ├── popup/page.tsx        # Popup analytics
│   │   ├── events/[slug]/page.tsx # Event editor
│   │   ├── settings/page.tsx     # Platform settings
│   │   └── health/page.tsx       # System health dashboard (master user only)
│   └── api/
│       ├── settings/route.ts     # Settings CRUD
│       ├── track/route.ts        # Traffic/popup event tracking
│       ├── health/route.ts       # System health checks endpoint
│       └── stripe/webhook/route.ts # Stripe webhook (placeholder)
├── components/
│   ├── landing/                  # Landing page components
│   ├── event/                    # Event page components
│   ├── checkout/                 # Checkout components
│   └── layout/                   # Shared layout (Header, Footer, Scanlines, CookieConsent)
├── hooks/                        # React hooks
│   ├── useSettings.tsx           # Settings context + realtime subscription
│   ├── useTraffic.ts             # Traffic/funnel tracking
│   ├── useDataLayer.ts           # GTM dataLayer helpers
│   ├── useTicketCart.ts           # Ticket cart state management
│   ├── useMetaTracking.ts        # Meta Pixel + CAPI tracking (stable refs)
│   └── useScrollReveal.ts        # Scroll-triggered animations
├── lib/
│   ├── constants.ts              # ORG_ID, table names, ticket IDs, API keys
│   ├── settings.ts               # fetchSettings (server), saveSettings (client)
│   ├── klaviyo.ts                # Klaviyo email subscription + identify
│   └── supabase/
│       ├── client.ts             # Browser Supabase client (singleton, no-cache)
│       └── server.ts             # Server Supabase client (cookies-based)
├── types/                        # TypeScript type definitions
│   ├── settings.ts               # EventSettings interface
│   ├── analytics.ts              # TrafficEvent, PopupEvent types
│   └── tickets.ts                # TicketType, TeeSize, CartItem + constants
└── styles/
    ├── globals.css               # All site styles (ported from css/style.css)
    ├── admin.css                 # Admin dashboard styles
    ├── tickets-page.css          # Ticket selection page styles
    ├── checkout-page.css         # Checkout page styles
    └── popup.css                 # Discount popup styles
```

### Legacy Files (Still in Repo Root)
The original static HTML files remain in the repo root for reference:
- `index.html`, `event.html` — old landing/event pages
- `admin/`, `event/`, `css/`, `js/` — old directories
- `agencyferal/`, `artist/`, `artist-invite/`, `artist-login/`, `contract/` — secondary pages served as static HTML via Vercel rewrites to `public/static/`

## Architecture Decisions

### Multi-Tenancy: org_id on ALL tables
Every database table must include an `org_id` column. Critical for future multi-tenancy.
- For now, org_id is always `'feral'`
- Every Supabase query must filter by org_id
- Supabase RLS policies must enforce org_id isolation

### Settings System
- Settings stored in Supabase `site_settings` table (key → JSONB data)
- **Server-side fetch-first**: Event layout (Server Component) fetches settings before render
- Settings passed to `SettingsProvider` context — no FOUC
- Admin saves via API route `POST /api/settings` which upserts to Supabase
- Realtime subscription in `useSettings` for live updates

### Event Pages
- `/event/[slug]/` — dynamic route, slug determines event (liverpool-27-march, kompass-klub-7-march)
- Event layout fetches settings and applies theme (default/minimal) via CSS classes + custom properties
- Ticket cart uses `useTicketCart` hook — cart format: `ticketId:qty` or `ticketId:qty:SIZE`
- WeeZTix checkout embed loaded dynamically via `WeeZTixEmbed` component

### Admin Dashboard
- Route-based navigation: `/admin/`, `/admin/traffic/`, `/admin/popup/`, `/admin/events/[slug]/`, `/admin/settings/`
- Auth: client-side sessionStorage with hardcoded credentials (to be replaced with proper auth)
- Realtime Supabase subscriptions for live traffic/popup data

### Environment Variables
All credentials in `.env.local` (gitignored). Required vars:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GTM_ID`
- `NEXT_PUBLIC_KLAVIYO_LIST_ID` / `NEXT_PUBLIC_KLAVIYO_COMPANY_ID`
- `NEXT_PUBLIC_WEEZTIX_SHOP_ID`
- `NEXT_PUBLIC_ADMIN_USER` / `NEXT_PUBLIC_ADMIN_PASS`
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` (for future Stripe integration)

## What's Being Built Next
1. **Stripe Checkout** — replace WeeZTix/Eventix entirely, handle Apple Pay/Google Pay/Klarna
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

## Testing

### Framework
- **Vitest** + **@testing-library/react** (jsdom environment)
- Config: `vitest.config.ts` — path aliases, setup file, jsdom
- Setup: `src/__tests__/setup.ts` — localStorage mock, crypto mock, jest-dom matchers
- Run: `npm test` (single run) or `npm run test:watch` (watch mode)

### Rules for Writing Tests
1. **Every new hook must have a test file** — `src/__tests__/useHookName.test.ts`
2. **Every new API route must have a test file** — `src/__tests__/api/routeName.test.ts`
3. **Referential stability tests are mandatory** for any hook that returns objects/functions consumed as useEffect/useCallback dependencies. This prevents the duplicate-event flooding bug we fixed in useMetaTracking.
4. **Test what matters, skip what doesn't** — focus on:
   - State logic (cart calculations, quantity management)
   - Referential stability (useMemo/useCallback return values)
   - API shape (returned methods exist and have correct types)
   - Edge cases (zero quantities, empty carts, missing settings)
   - Payment flows (Stripe integration — critical path)
5. **Don't test** — pure UI rendering, CSS classes, static text content
6. **Tests must pass before committing** — run `npm test` and fix failures

### Current Test Coverage
- `useTicketCart` — 22 tests (state, add/remove, tee sizes, cart params, checkout URL, settings preservation)
- `useMetaTracking` — 10 tests (referential stability, consent gating, API shape)
- `useDataLayer` — 8 tests (referential stability, event pushing, tracking helpers)

### Adding Tests for New Features
When building a new feature, write tests that cover:
- The hook's public API (what it returns)
- State transitions (add → remove → reset)
- Integration with settings (admin-configurable values)
- Error/edge cases (null settings, empty data, network failures)

## Design Principles
- Dark aesthetic (#0e0e0e background, red #ff0033 accent)
- Fonts: Space Mono (headings/mono), Inter (body)
- Glitch/scanline effects, noise textures
- Mobile-first — most ticket buyers are on mobile
- Speed is critical — pages must load instantly
- Settings changes in admin must reflect on the live site immediately (no stale data)
