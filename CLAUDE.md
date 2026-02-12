# FERAL PRESENTS — Platform Context

## Mission
FERAL PRESENTS is a white-label events and ticketing platform. Today it powers FERAL's own events (Liverpool, Kompass Klub). The goal is to become a **"Shopify for Events"** — any promoter or artist can sell tickets, merch, and manage events under their own brand, with FERAL taking a platform fee.

Everything built must serve that multi-tenant future. Every database query filters by `org_id`. Every feature must work for promoters who aren't FERAL.

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript (strict) | 5.9.3 |
| Runtime | React | 19.2.3 |
| Database | Supabase (PostgreSQL + REST + Realtime) | — |
| Payments | Stripe (Connect, direct charges) | 20.3.1 |
| Legacy Payments | WeeZTix/Eventix (being phased out) | — |
| Hosting | Vercel | — |
| Analytics | GTM + Meta Pixel + Meta CAPI + Supabase tables | — |
| Email Marketing | Klaviyo | — |
| Testing | Vitest + Testing Library | 4.0.18 |
| QR/PDF | qrcode + jsPDF | — |
| Fonts | Google Fonts CDN (Space Mono, Inter) | — |

## Project Structure

```
src/
├── middleware.ts                            # Auth session refresh, route protection, security headers
├── app/
│   ├── layout.tsx                          # Root layout (fonts, GTM, consent, scanlines)
│   ├── page.tsx                            # Landing page (/)
│   ├── event/[slug]/
│   │   ├── layout.tsx                      # Server Component: fetches settings + theme
│   │   ├── page.tsx                        # Routes to WeeZTix or Dynamic event page
│   │   ├── tickets/page.tsx                # Ticket selection (WeeZTix only, redirects for Stripe)
│   │   ├── checkout/page.tsx               # Routes to WeeZTix embed or NativeCheckout
│   │   ├── error.tsx                       # Error boundary
│   │   └── loading.tsx                     # Loading skeleton (logo + progress bar)
│   ├── admin/
│   │   ├── layout.tsx                      # Sidebar nav (12 items) + logout (auth via middleware)
│   │   ├── login/page.tsx                  # Supabase Auth login page (email/password)
│   │   ├── page.tsx                        # Dashboard (KPIs, quick links)
│   │   ├── events/page.tsx                 # Event list + create form
│   │   ├── events/[slug]/page.tsx          # Event editor (tickets, theme, images, lineup)
│   │   ├── orders/page.tsx                 # Order list + export CSV
│   │   ├── orders/[id]/page.tsx            # Order detail + refund + PDF download
│   │   ├── customers/page.tsx              # Customer search + stats
│   │   ├── guest-list/page.tsx             # Per-event guest list + check-in
│   │   ├── traffic/page.tsx                # Funnel analytics (realtime)
│   │   ├── popup/page.tsx                  # Popup performance (realtime)
│   │   ├── payments/page.tsx               # Stripe Connect setup (promoter-facing)
│   │   ├── connect/page.tsx                # Stripe Connect admin (platform-level)
│   │   ├── marketing/page.tsx              # Meta Pixel + CAPI config
│   │   ├── settings/page.tsx               # Platform settings + danger zone resets
│   │   └── health/page.tsx                 # System health monitoring
│   └── api/
│       ├── auth/login/route.ts             # POST sign in with Supabase Auth
│       ├── auth/logout/route.ts            # POST sign out + clear cookies
│       ├── settings/route.ts               # GET/POST settings by key
│       ├── track/route.ts                  # POST traffic/popup events
│       ├── health/route.ts                 # GET system health checks
│       ├── upload/route.ts                 # POST image upload (base64 → media key)
│       ├── media/[key]/route.ts            # GET serve uploaded images
│       ├── customers/route.ts              # GET customer list with search
│       ├── events/route.ts                 # GET/POST events
│       ├── events/[id]/route.ts            # GET/PUT/DELETE single event + ticket types
│       ├── guest-list/route.ts             # POST add guest entry
│       ├── guest-list/[eventId]/route.ts   # GET/PUT/DELETE guest list per event
│       ├── orders/route.ts                 # GET/POST orders
│       ├── orders/[id]/route.ts            # GET order detail
│       ├── orders/[id]/pdf/route.ts        # GET download PDF tickets
│       ├── orders/[id]/refund/route.ts     # POST refund order
│       ├── orders/export/route.ts          # GET export CSV
│       ├── tickets/[code]/route.ts         # GET validate ticket by code
│       ├── tickets/[code]/scan/route.ts    # POST mark ticket scanned
│       ├── meta/capi/route.ts              # POST forward events to Meta CAPI
│       ├── stripe/payment-intent/route.ts  # POST create PaymentIntent
│       ├── stripe/confirm-order/route.ts   # POST confirm payment → create order
│       ├── stripe/webhook/route.ts         # POST Stripe webhook handler
│       ├── stripe/account/route.ts         # GET connected account ID
│       ├── stripe/connect/route.ts         # GET/POST list/create Connect accounts
│       ├── stripe/connect/[accountId]/route.ts          # GET/DELETE account
│       ├── stripe/connect/[accountId]/onboarding/route.ts # GET/POST onboarding
│       ├── stripe/apple-pay-domain/route.ts # GET/POST Apple Pay domain registration
│       └── stripe/apple-pay-verify/route.ts # GET serve Apple Pay verification file
├── components/
│   ├── landing/
│   │   ├── LandingPage.tsx                 # Full homepage orchestrator
│   │   ├── HeroSection.tsx                 # Hero with particle canvas + CTA
│   │   ├── ParticleCanvas.tsx              # Interactive particle grid (canvas)
│   │   ├── HeroGlitchText.tsx              # Scramble-reveal title animation
│   │   ├── EventsSection.tsx               # Horizontal event card scroll
│   │   ├── AboutSection.tsx                # "Why FERAL" pillars with animations
│   │   └── ContactSection.tsx              # Email signup + social links
│   ├── event/
│   │   ├── DynamicEventPage.tsx            # DB-driven event page (Stripe events)
│   │   ├── LiverpoolEventPage.tsx          # Hardcoded Liverpool event (WeeZTix)
│   │   ├── KompassEventPage.tsx            # Hardcoded Kompass event (WeeZTix)
│   │   ├── TicketsPage.tsx                 # Standalone tickets page (WeeZTix)
│   │   ├── EventHero.tsx                   # Event banner + details
│   │   ├── TicketWidget.tsx                # Ticket selector (WeeZTix events)
│   │   ├── DynamicTicketWidget.tsx          # Ticket selector (Stripe events, DB-driven)
│   │   ├── BottomBar.tsx                   # Sticky bottom bar (Buy Now / Checkout)
│   │   ├── TeeModal.tsx                    # Tee image zoom + size selection
│   │   ├── DiscountPopup.tsx               # 3-screen discount popup + Klaviyo
│   │   ├── EngagementTracker.tsx           # Invisible scroll/time tracking
│   │   └── SocialProofToast.tsx            # "Last ticket booked X min ago" toast
│   ├── checkout/
│   │   ├── CheckoutPage.tsx                # WeeZTix checkout (legacy)
│   │   ├── NativeCheckout.tsx              # Stripe checkout (single page)
│   │   ├── StripePaymentForm.tsx           # Stripe PaymentElement form
│   │   ├── ExpressCheckout.tsx             # Apple Pay / Google Pay button
│   │   ├── OrderConfirmation.tsx           # Post-purchase with QR codes + PDF
│   │   ├── OrderSummary.tsx                # Inline cart summary strip
│   │   ├── CheckoutTimer.tsx               # 8-minute urgency countdown
│   │   ├── LoadingScreen.tsx               # Payment processing interstitial
│   │   └── WeeZTixEmbed.tsx                # WeeZTix iframe embed (legacy)
│   └── layout/
│       ├── Header.tsx                      # Nav bar + hamburger menu
│       ├── Footer.tsx                      # Copyright + status
│       ├── Scanlines.tsx                   # CRT scanline + noise overlays
│       └── CookieConsent.tsx               # GDPR consent banner + GTM integration
├── hooks/
│   ├── useSettings.tsx                     # Settings context + realtime subscription
│   ├── useTicketCart.ts                    # Cart state (3 ticket types, sizes, totals)
│   ├── useMetaTracking.ts                 # Meta Pixel + CAPI (consent-aware, stable refs)
│   ├── useDataLayer.ts                    # GTM dataLayer push (stable refs)
│   ├── useTraffic.ts                      # Supabase funnel tracking
│   ├── useHeaderScroll.ts                 # Header hide/show on scroll
│   └── useScrollReveal.ts                 # IntersectionObserver scroll animations
├── lib/
│   ├── auth.ts                            # requireAuth(), getSession() — API route auth helpers
│   ├── constants.ts                       # ORG_ID, TABLES, SETTINGS_KEYS, default IDs
│   ├── settings.ts                        # fetchSettings (server), saveSettings (client)
│   ├── klaviyo.ts                         # Email subscription + identify
│   ├── meta.ts                            # Meta CAPI: hash PII, send events
│   ├── pdf.ts                             # PDF ticket generation (jsPDF, A5 format)
│   ├── qr.ts                              # QR code generation (data URL + PNG buffer)
│   ├── ticket-utils.ts                    # generateTicketCode, generateOrderNumber
│   ├── supabase/
│   │   ├── client.ts                      # Browser Supabase client (singleton, no-cache)
│   │   ├── middleware.ts                  # Supabase client for Next.js middleware
│   │   └── server.ts                      # Server Supabase client (cookies, no-cache)
│   └── stripe/
│       ├── client.ts                      # Browser Stripe.js (lazy singleton, Connect-aware)
│       ├── server.ts                      # Server Stripe instance (platform account)
│       └── config.ts                      # Platform fees, currency helpers, toSmallestUnit
├── types/
│   ├── settings.ts                        # EventSettings (JSONB shape for site_settings)
│   ├── events.ts                          # Event, TicketTypeRow, EventStatus, PaymentMethod
│   ├── orders.ts                          # Order, OrderItem, Ticket, Customer, GuestListEntry
│   ├── tickets.ts                         # TicketKey, TicketType, TeeSize, CartItem
│   ├── analytics.ts                       # TrafficEvent, PopupEvent types
│   └── marketing.ts                       # MarketingSettings, MetaEventPayload, MetaCAPIRequest
└── styles/
    ├── base.css                          # Reset, CSS variables, typography, footer, reveal animations
    ├── effects.css                       # CRT scanlines + noise texture overlays
    ├── header.css                        # Header, navigation, mobile menu, buttons
    ├── landing.css                       # Hero, events grid, about pillars, contact form
    ├── event.css                         # Event pages, tickets, modals, bottom bar, minimal theme
    ├── cookie.css                        # Cookie consent banner + preferences modal
    ├── admin.css                         # Admin dashboard styles
    ├── tickets-page.css                  # Ticket selection page (WeeZTix)
    ├── checkout-page.css                 # Checkout + payment form
    └── popup.css                         # Discount popup
```

### Legacy Files (Repo Root)
Static HTML from the pre-Next.js era — served via Vercel rewrites:
- `agencyferal/` → `www.agencyferal.com` domain
- `artist/`, `artist-invite/`, `artist-login/`, `contract/` → static pages
- `index.html`, `event.html`, `admin/`, `css/`, `js/` → old site (not used by Next.js)

---

## Architecture

### Dual Payment System (WeeZTix → Stripe Migration)
The platform supports two payment methods simultaneously:

**WeeZTix (legacy)** — Liverpool, Kompass Klub events
- Hardcoded event pages (`LiverpoolEventPage`, `KompassEventPage`)
- Ticket IDs stored in `site_settings` JSONB
- Checkout via iframe embed (`WeeZTixEmbed`)
- Cart format: `ticketId:qty` or `ticketId:qty:SIZE`

**Stripe (native)** — All new events
- Dynamic event pages (`DynamicEventPage`) rendered from `events` table
- Ticket types stored in `ticket_types` table with proper pricing/capacity
- Checkout via `NativeCheckout` → `StripePaymentForm` + `ExpressCheckout`
- PaymentIntent flow: create → confirm → webhook creates order + tickets
- Apple Pay / Google Pay via Stripe ExpressCheckoutElement

Event routing is automatic: `event/[slug]/page.tsx` checks `payment_method` in the DB and renders the correct component.

### Stripe Connect (Multi-Tenant Payments)
- **Model**: Direct charges on connected accounts with application fee
- **Account type**: Custom (white-labeled — promoter never sees Stripe dashboard)
- **Platform fee**: 5% default, £0.50 minimum (configurable per event via `platform_fee_percent`)
- **Currency**: Amounts always in smallest unit (pence/cents) — use `toSmallestUnit()` / `fromSmallestUnit()`
- Admin pages: `/admin/payments/` (promoter-facing setup), `/admin/connect/` (platform admin)
- Onboarding: Embedded via ConnectJS (`client_secret`) or hosted link fallback

### Multi-Tenancy: org_id on EVERYTHING
Every database table has an `org_id` column. Every query must filter by it.
- Current value: `'feral'` (from `constants.ts`)
- Every new table, every new query, every new API route must include `org_id`
- Supabase RLS policies must enforce org_id isolation
- This is non-negotiable — it's the foundation for the multi-promoter platform

### Settings System
Two sources of truth depending on event type:

**WeeZTix events**: `site_settings` table (key → JSONB)
- Keys: `feral_event_liverpool`, `feral_event_kompass`
- Contains: ticket IDs, names, theme config, image settings
- Server-side fetch in event layout → `SettingsProvider` context → no FOUC
- Realtime subscription for live admin updates

**Native events**: `events` + `ticket_types` tables
- Event data (name, venue, dates, theme) in `events` table
- Ticket configuration (price, capacity, sold count) in `ticket_types` table
- Settings key still exists for theme/image overrides
- Marketing settings stored under key `feral_marketing`

### Request Flow (Event Pages)
```
Browser request → /event/[slug]/
    ↓
RootLayout (fonts, GTM consent defaults, scanlines, cookie consent)
    ↓
EventLayout [Server Component, force-dynamic]
    ├─ Fetch event from events table (get theme, payment_method)
    ├─ Fetch settings from site_settings (parallel)
    ├─ Check for media uploads (parallel)
    ├─ Determine theme (minimal vs default) + CSS variables
    └─ Wrap children in SettingsProvider
    ↓
EventPage [Server Component, force-dynamic]
    ├─ payment_method === "weeztix" → LiverpoolEventPage / KompassEventPage
    └─ payment_method === "stripe"/"test" → DynamicEventPage
```

### Caching Strategy (Vercel)
- Event pages: `Cache-Control: public, max-age=0, must-revalidate` + `CDN-Cache-Control: max-age=60, stale-while-revalidate=300`
- Admin pages: `Cache-Control: no-cache, no-store, must-revalidate`
- All Supabase fetches use `cache: "no-store"` — settings changes must appear immediately
- Apple Pay verification file: aggressive cache (`max-age=86400`)
- Uploaded media: aggressive cache (`max-age=31536000`)

### Authentication & Security
The platform uses Supabase Auth for admin authentication with defense-in-depth:

**Authentication flow:**
1. Admin navigates to `/admin/` → middleware checks for valid Supabase session
2. No session → redirect to `/admin/login/` (Supabase Auth email/password)
3. Successful login → session cookie set → middleware allows access
4. Logout → `supabase.auth.signOut()` → cookies cleared → redirect to login

**Key files:**
- `src/middleware.ts` — Next.js middleware: session refresh, route protection, security headers
- `src/lib/auth.ts` — `requireAuth()` helper for API route defense-in-depth
- `src/lib/supabase/middleware.ts` — Supabase client configured for middleware cookie handling
- `src/app/admin/login/page.tsx` — Login page using Supabase Auth
- `src/app/api/auth/login/route.ts` — Server-side login API
- `src/app/api/auth/logout/route.ts` — Server-side logout API

**Two layers of API protection:**
1. **Middleware** (first layer) — blocks unauthenticated requests to protected API routes at the edge
2. **`requireAuth()`** (second layer) — each protected API handler verifies auth independently

**Public API routes (no auth required):**
- `POST /api/stripe/payment-intent` — customer checkout
- `POST /api/stripe/confirm-order` — payment confirmation
- `POST /api/stripe/webhook` — Stripe webhooks (verified by signature)
- `GET /api/stripe/account` — Stripe account ID for checkout
- `GET /api/stripe/apple-pay-verify` — Apple Pay verification
- `GET /api/events`, `GET /api/events/[id]` — public event data
- `GET /api/settings` — public settings for event pages
- `GET /api/media/[key]` — public media serving
- `POST /api/track` — analytics tracking
- `POST /api/meta/capi` — Meta CAPI
- `GET /api/health` — system health

**Protected API routes (admin auth required):**
- All `POST/PUT/DELETE` on `/api/settings`, `/api/events`, `/api/orders`
- All `/api/customers`, `/api/guest-list`, `/api/upload`
- All `/api/stripe/connect/*`, `/api/stripe/apple-pay-domain`
- All `/api/tickets/[code]/*` (scanner endpoints)
- All `/api/orders/*` (list, detail, refund, export, PDF)

**Security headers** (applied globally via `next.config.ts` and middleware):
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

**Rules for new routes:**
1. Every new admin API route must call `requireAuth()` at the top
2. Every new public API route must be added to `PUBLIC_API_PREFIXES` in middleware.ts
3. Never hardcode secrets in source — use environment variables only
4. Stripe webhook must always verify signatures in production

**Setting up admin users:**
Admin users must be created in the Supabase Auth dashboard (Authentication → Users → Add User).
There is no self-registration — admin access is invitation-only.

---

## Database (Supabase)

### Tables
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `site_settings` | Key-value config store (JSONB) | key, data, updated_at |
| `events` | Event definitions | slug, name, venue_*, date_*, status, payment_method, currency, stripe_account_id, platform_fee_percent |
| `ticket_types` | Ticket pricing/inventory | event_id, name, price, capacity, sold, tier, includes_merch, merch_sizes[], status |
| `orders` | Purchase records | order_number (FERAL-00001), event_id, customer_id, status, subtotal, fees, total, payment_ref |
| `order_items` | Line items per order | order_id, ticket_type_id, qty, unit_price, merch_size |
| `tickets` | Individual tickets with QR | ticket_code (FERAL-XXXXXXXX), order_id, status, holder_*, scanned_at, scanned_by |
| `customers` | Customer profiles | email, first_name, last_name, total_orders, total_spent |
| `guest_list` | Manual guest entries | event_id, name, email, qty, checked_in, checked_in_at |
| `traffic_events` | Funnel tracking | event_type, page_path, session_id, referrer, utm_* |
| `popup_events` | Popup interaction tracking | event_type (impressions, engaged, conversions, dismissed) |

### Key Constraints
- `orders.order_number` — unique, format `FERAL-XXXXX` (sequential, padded)
- `tickets.ticket_code` — unique, format `FERAL-XXXXXXXX` (random, crypto-safe)
- `orders.payment_ref` — used for idempotency (Stripe PaymentIntent ID)
- All tables have `org_id` column

---

## API Routes (27 endpoints)

### Orders & Tickets (critical path)
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/orders` | List orders (filter by event, status, date range) |
| POST | `/api/orders` | Create order (test mode only) |
| GET | `/api/orders/[id]` | Full order detail with customer, items, tickets |
| POST | `/api/orders/[id]/refund` | Refund order → cancel tickets → update stats |
| GET | `/api/orders/[id]/pdf` | Generate PDF tickets with QR codes |
| GET | `/api/orders/export` | Export CSV (one row per ticket) |
| GET | `/api/tickets/[code]` | Validate ticket (scanner API) |
| POST | `/api/tickets/[code]/scan` | Mark scanned (prevents double-scan) |

### Stripe (payment processing)
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/stripe/payment-intent` | Create PaymentIntent with application fee |
| POST | `/api/stripe/confirm-order` | Verify payment succeeded → create order + tickets |
| POST | `/api/stripe/webhook` | Handle payment_intent.succeeded / failed |
| GET | `/api/stripe/account` | Get connected Stripe account ID |
| GET/POST | `/api/stripe/connect` | List / create Connect accounts |
| GET/DELETE | `/api/stripe/connect/[accountId]` | Get / delete account |
| GET/POST | `/api/stripe/connect/[accountId]/onboarding` | Onboarding link / session |
| GET/POST | `/api/stripe/apple-pay-domain` | List / register domains |
| GET | `/api/stripe/apple-pay-verify` | Serve Apple Pay verification file |

### Events & Content
| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/events` | List / create events |
| GET/PUT/DELETE | `/api/events/[id]` | Get / update / delete event + ticket types |
| GET/POST | `/api/settings` | Get / save settings by key |
| POST | `/api/upload` | Upload image (base64 → media key) |
| GET | `/api/media/[key]` | Serve uploaded image |

### Analytics & Tracking
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/track` | Log traffic/popup events to Supabase |
| POST | `/api/meta/capi` | Forward events to Meta Conversions API |
| GET | `/api/health` | System health checks (Supabase, Stripe, Meta, env) |

### Customers & Guest Lists
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/customers` | List/search customers |
| POST | `/api/guest-list` | Add guest entry |
| GET/PUT/DELETE | `/api/guest-list/[eventId]` | Manage guest list per event |

---

## Hooks (Patterns & Rules)

### Referential Stability (CRITICAL)
Hooks that return objects/functions consumed as `useEffect`/`useCallback` dependencies MUST use `useMemo` to return a stable reference. Without this, every re-render creates a new object, causing all dependent effects to re-fire.

**Hooks with stable refs (do NOT break this):**
- `useMetaTracking()` — returns `useMemo({ trackPageView, trackViewContent, ... })`
- `useDataLayer()` — returns `useMemo({ push, trackViewContent, trackAddToCart, ... })`
- `useSettings()` — context value wrapped in `useMemo`

**Consumer pattern:**
```typescript
// CORRECT — destructure stable callbacks
const { trackViewContent } = useMetaTracking();
useEffect(() => { trackViewContent(...) }, [trackViewContent]);

// WRONG — whole object as dependency causes infinite re-renders
const meta = useMetaTracking();
useEffect(() => { meta.trackViewContent(...) }, [meta]);
```

### Consent Gating (`useMetaTracking`)
- Checks `feral_cookie_consent` in localStorage for `marketing: true`
- Listens for consent changes via `storage` event (cross-tab) and `feral_consent_update` (same-tab)
- `CookieConsent.tsx` dispatches `feral_consent_update` when user saves preferences
- Pixel only loads after consent — if not consented at mount, waits for consent event

### Module-Level State (`useMetaTracking`)
- `_settings`, `_fetchPromise`, `_pixelLoaded` persist at module scope (not component scope)
- Shared across all instances within a page lifecycle
- Tests must account for this — module state doesn't reset between test cases

---

## Environment Variables

### Required (app won't function without these)
```
NEXT_PUBLIC_SUPABASE_URL          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY     # Supabase anonymous key
```

### Required for Payments
```
STRIPE_SECRET_KEY                 # Stripe secret key (server-side only)
STRIPE_WEBHOOK_SECRET             # Stripe webhook signature verification
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY # Stripe public key (client-side)
```

### Required for Analytics
```
NEXT_PUBLIC_GTM_ID                # Google Tag Manager container ID
NEXT_PUBLIC_SITE_URL              # Site URL for CAPI event_source_url
```

### Optional Integrations
```
NEXT_PUBLIC_KLAVIYO_LIST_ID       # Klaviyo email list ID
NEXT_PUBLIC_KLAVIYO_COMPANY_ID    # Klaviyo company ID
NEXT_PUBLIC_WEEZTIX_SHOP_ID      # WeeZTix shop ID (legacy)
# NEXT_PUBLIC_ADMIN_USER          # REMOVED — replaced by Supabase Auth
# NEXT_PUBLIC_ADMIN_PASS          # REMOVED — replaced by Supabase Auth
```

---

## Testing

### Setup
- **Framework**: Vitest + @testing-library/react (jsdom)
- **Config**: `vitest.config.ts` — path aliases, jsdom, setup file
- **Setup**: `src/__tests__/setup.ts` — localStorage mock, crypto.randomUUID mock, jest-dom
- **Run**: `npm test` (single run) or `npm run test:watch` (watch mode)

### Current Coverage (40 tests, 3 suites)
- `useTicketCart` — 22 tests (state, add/remove, tee sizes, cart params, checkout URL, settings preservation)
- `useMetaTracking` — 10 tests (referential stability, consent gating, API shape)
- `useDataLayer` — 8 tests (referential stability, event pushing, tracking helpers)

### Rules for Writing Tests
1. **Every new hook must have a test file** — `src/__tests__/useHookName.test.ts`
2. **Every new API route must have a test file** — `src/__tests__/api/routeName.test.ts`
3. **Referential stability tests are mandatory** for any hook returning objects/functions used in effect dependencies
4. **Test what matters** — state logic, referential stability, API shape, edge cases, payment flows
5. **Don't test** — pure UI rendering, CSS classes, static text
6. **Tests must pass before committing** — run `npm test` and fix failures

### Adding Tests for New Features
When building a new feature, write tests for:
- The hook's public API (what it returns)
- State transitions (add → remove → reset)
- Integration with settings (admin-configurable values)
- Error/edge cases (null settings, empty data, network failures)

---

## What's Actually Built vs What's Next

### Built and Working
- Stripe checkout (PaymentIntent, Apple Pay, Google Pay, Klarna)
- Stripe Connect (direct charges, platform fees, custom account onboarding)
- QR ticket generation (ticket codes, QR data URLs, PDF download)
- Meta Pixel + CAPI (client-side pixel, server-side conversion API)
- Order management (create, list, detail, refund, CSV export)
- Event CRUD (create events, configure ticket types, set themes)
- Customer management (profiles, order history, spend tracking)
- Guest list management (add guests, check-in, export)
- Traffic analytics (funnel tracking, realtime updates)
- Popup analytics (impressions, engagement, conversions)
- Admin dashboard with 14 pages
- System health monitoring
- Test infrastructure (40 tests)

### Still To Build
1. **Email confirmations** — send tickets via email after purchase (SendGrid/Postmark). No email integration exists yet.
2. **Scanner PWA** — mobile web app for door staff. API endpoints exist (`/api/tickets/[code]` and `/api/tickets/[code]/scan`) but no frontend app.
3. **Google Ads + TikTok tracking** — placeholders exist in marketing page but no implementation
4. **Multi-tenant promoter dashboard** — Stripe Connect is built, but the actual promoter-facing dashboard (separate from FERAL admin) doesn't exist yet.
5. **Rate limiting** — API routes have no request rate limiting. Consider adding for payment and auth endpoints.
6. **Supabase RLS policies** — Row-Level Security policies should be configured in Supabase dashboard to enforce org_id isolation at the database level.

---

## Design System
- **Background**: `#0e0e0e`
- **Accent**: `#ff0033` (red)
- **Card/Section background**: `#1a1a1a` with `#2a2a2a` border
- **Text**: `#fff` (primary), `#888` (secondary), `#555` (muted)
- **Heading font**: `Space Mono` (monospace, uppercase, letter-spacing)
- **Body font**: `Inter` (sans-serif)
- **Effects**: CRT scanlines, noise texture overlays, glitch animations
- **Mobile-first**: Most ticket buyers are on phones
- **No FOUC**: Server-side settings fetch, immediate render
- **Live updates**: Admin changes reflect on the live site instantly via Supabase realtime

---

## CSS Architecture

### File Organization
CSS is split into component-aligned files instead of one monolithic stylesheet. Each file is imported only where needed:

| File | Loaded By | Scope |
|------|-----------|-------|
| `base.css` | Root layout (`app/layout.tsx`) | Global — reset, CSS variables, typography, footer, reveal animations |
| `effects.css` | Root layout (`app/layout.tsx`) | Global — CRT scanlines + noise overlays |
| `cookie.css` | Root layout (`app/layout.tsx`) | Global — consent banner (appears on all pages) |
| `header.css` | `Header.tsx` | Navigation, mobile menu, buttons |
| `landing.css` | `LandingPage.tsx` | Hero, events grid, about pillars, contact form |
| `event.css` | Event layout (`app/event/[slug]/layout.tsx`) | Event pages, tickets, modals, bottom bar, minimal theme |
| `admin.css` | Admin layout (`app/admin/layout.tsx`) | Admin dashboard |
| `tickets-page.css` | `TicketsPage.tsx` | WeeZTix ticket selection |
| `checkout-page.css` | Checkout components | Checkout + payment form |
| `popup.css` | `DiscountPopup.tsx` | Discount popup |

### CSS Variables (defined in `base.css :root`)
```css
--bg-dark: #0e0e0e;           --card-bg: #1a1a1a;
--card-border: #2a2a2a;        --accent: #ff0033;
--text-primary: #fff;          --text-secondary: #888;
--text-muted: #555;            --font-mono: 'Space Mono', monospace;
--font-sans: 'Inter', sans-serif;
```

### Standardized Breakpoints
```
@media (max-width: 1024px)  — Tablet landscape / small desktop
@media (max-width: 768px)   — Tablet portrait / large phone
@media (max-width: 480px)   — Phone
```

### Rules for New CSS
1. **Component-level imports** — new components import their own CSS file
2. **BEM naming** — `.block__element--modifier` (28 prefixes already in use)
3. **Use CSS custom properties** from `base.css :root` for all colors, fonts, spacing
4. **CSS Modules** for all new components — prevents class name collisions as the platform scales
5. **No Tailwind** — removed; all styles are hand-written CSS
6. **Responsive rules live with their component** — media queries go in the same file as the styles they modify
