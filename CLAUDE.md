# Entry — Platform Context

## Mission
Entry is a white-label events and ticketing platform. Today it powers FERAL's own events (Liverpool, Kompass Klub). The goal is to become a **"Shopify for Events"** — any promoter or artist can sell tickets, merch, and manage events under their own brand, with the platform taking a fee.

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
| Admin UI | Tailwind CSS v4 + shadcn/ui (Radix UI) | 4.x |
| QR/PDF | qrcode + jsPDF | — |
| Email | Resend (transactional email + PDF attachments) | — |
| Wallet Passes | Apple Wallet + Google Wallet | — |
| Fonts | Google Fonts CDN (Space Mono, Inter) | — |

## Project Structure

```
src/
├── middleware.ts                            # Auth session refresh, route protection, security headers
├── app/
│   ├── layout.tsx                          # Root layout (fonts, GTM, consent, scanlines)
│   ├── global-error.tsx                    # Global error boundary
│   ├── page.tsx                            # Landing page (/)
│   ├── event/[slug]/
│   │   ├── layout.tsx                      # Server Component: fetches settings + theme + branding CSS vars
│   │   ├── page.tsx                        # Routes to WeeZTix or Dynamic event page
│   │   ├── tickets/page.tsx                # Ticket selection (WeeZTix only, redirects for Stripe)
│   │   ├── checkout/page.tsx               # Routes to WeeZTix embed or NativeCheckout
│   │   ├── error.tsx                       # Error boundary
│   │   └── loading.tsx                     # Loading skeleton (logo + progress bar)
│   ├── admin/
│   │   ├── layout.tsx                      # Sidebar nav + logout (Entry-branded admin shell)
│   │   ├── error.tsx                       # Admin error boundary
│   │   ├── login/page.tsx                  # Supabase Auth login page (email/password)
│   │   ├── page.tsx                        # Dashboard (KPIs, quick links)
│   │   ├── events/page.tsx                 # Event list + create form
│   │   ├── events/[slug]/page.tsx          # Event editor (tabbed: details, content, design, tickets, settings)
│   │   ├── orders/page.tsx                 # Order list + export CSV
│   │   ├── orders/[id]/page.tsx            # Order detail + refund + PDF download
│   │   ├── customers/page.tsx              # Customer search + stats
│   │   ├── customers/[id]/page.tsx         # Customer detail (order history, spend)
│   │   ├── guest-list/page.tsx             # Per-event guest list + check-in
│   │   ├── merch/page.tsx                   # Merch catalog (standalone merchandise)
│   │   ├── merch/[id]/page.tsx             # Merch editor (images, sizes, pricing)
│   │   ├── traffic/page.tsx                # Funnel analytics (realtime)
│   │   ├── popup/page.tsx                  # Popup performance (realtime)
│   │   ├── payments/page.tsx               # Stripe Connect setup (promoter-facing)
│   │   ├── connect/page.tsx                # Stripe Connect admin (platform-level)
│   │   ├── marketing/page.tsx              # Meta Pixel + CAPI config
│   │   ├── communications/page.tsx          # Communications hub
│   │   ├── communications/transactional/page.tsx              # Transactional templates hub
│   │   ├── communications/transactional/order-confirmation/page.tsx  # Email template editor
│   │   ├── communications/transactional/pdf-ticket/page.tsx          # PDF ticket design editor
│   │   ├── communications/transactional/wallet-passes/page.tsx       # Wallet pass settings
│   │   ├── communications/marketing/page.tsx                         # Marketing campaigns hub
│   │   ├── communications/marketing/abandoned-cart/page.tsx          # Abandoned cart campaigns
│   │   ├── settings/page.tsx               # Platform settings + danger zone resets
│   │   └── health/page.tsx                 # System health monitoring
│   └── api/
│       ├── auth/login/route.ts             # POST sign in with Supabase Auth
│       ├── auth/logout/route.ts            # POST sign out + clear cookies
│       ├── branding/route.ts               # GET/POST org branding settings (logo, colors, fonts)
│       ├── settings/route.ts               # GET/POST settings by key
│       ├── track/route.ts                  # POST traffic/popup events
│       ├── health/route.ts                 # GET system health checks
│       ├── upload/route.ts                 # POST image upload (base64 → media key)
│       ├── media/[key]/route.ts            # GET serve uploaded images
│       ├── customers/route.ts              # GET customer list with search
│       ├── events/route.ts                 # GET/POST events (full field support)
│       ├── events/[id]/route.ts            # GET/PUT/DELETE single event + ticket types
│       ├── merch/route.ts                  # GET/POST merch catalog
│       ├── merch/[id]/route.ts             # GET/PUT/DELETE single merch item
│       ├── merch/[id]/linked-tickets/route.ts  # GET tickets linked to a merch item
│       ├── guest-list/route.ts             # POST add guest entry
│       ├── guest-list/[eventId]/route.ts   # GET/PUT/DELETE guest list per event
│       ├── orders/route.ts                 # GET/POST orders
│       ├── orders/[id]/route.ts            # GET order detail
│       ├── orders/[id]/pdf/route.ts        # GET download PDF tickets
│       ├── orders/[id]/refund/route.ts     # POST refund order
│       ├── orders/[id]/wallet/apple/route.ts   # GET Apple Wallet pass download
│       ├── orders/[id]/wallet/google/route.ts  # GET Google Wallet pass URL
│       ├── orders/export/route.ts          # GET export CSV
│       ├── tickets/[code]/route.ts         # GET validate ticket by code
│       ├── tickets/[code]/scan/route.ts    # POST mark ticket scanned
│       ├── tickets/[code]/merch/route.ts   # GET merch details for a ticket
│       ├── meta/capi/route.ts              # POST forward events to Meta CAPI
│       ├── email/test/route.ts             # POST send test email with PDF attachment
│       ├── email/status/route.ts           # GET email delivery status
│       ├── wallet/status/route.ts          # GET wallet pass configuration status
│       ├── stripe/payment-intent/route.ts  # POST create PaymentIntent (per-event Stripe account)
│       ├── stripe/confirm-order/route.ts   # POST confirm payment → create order
│       ├── stripe/webhook/route.ts         # POST Stripe webhook handler
│       ├── stripe/account/route.ts         # GET connected account ID
│       ├── stripe/connect/route.ts         # GET/POST list/create Connect accounts
│       ├── stripe/connect/[accountId]/route.ts          # GET/DELETE account
│       ├── stripe/connect/[accountId]/onboarding/route.ts # GET/POST onboarding
│       ├── stripe/apple-pay-domain/route.ts # GET/POST Apple Pay domain registration
│       └── stripe/apple-pay-verify/route.ts # GET serve Apple Pay verification file
├── components/
│   ├── admin/                              # Admin-specific reusable components
│   │   ├── ImageUpload.tsx                 # Image upload with preview + hover overlay
│   │   ├── LineupTagInput.tsx              # Tag input for lineup artist names
│   │   ├── TierSelector.tsx                # Ticket tier visual selector (standard/platinum/black/valentine)
│   │   └── event-editor/                   # Event editor tab components
│   │       ├── types.ts                    # Shared types for event editor
│   │       ├── EventEditorHeader.tsx       # Editor header with save/status
│   │       ├── DetailsTab.tsx              # Name, slug, venue, dates, status
│   │       ├── ContentTab.tsx              # About, lineup, details text, tagline
│   │       ├── DesignTab.tsx               # Theme, images, cover settings
│   │       ├── TicketsTab.tsx              # Ticket types list + add/remove/reorder
│   │       ├── TicketCard.tsx              # Individual ticket type editor card
│   │       ├── GroupManager.tsx            # Ticket group management
│   │       └── SettingsTab.tsx             # Payment method, Stripe account, fees, danger zone
│   ├── landing/
│   │   ├── LandingPage.tsx                 # Full homepage orchestrator
│   │   ├── HeroSection.tsx                 # Hero with particle canvas + CTA
│   │   ├── ParticleCanvas.tsx              # Interactive particle grid (canvas)
│   │   ├── HeroGlitchText.tsx              # Scramble-reveal title animation
│   │   ├── EventsSection.tsx               # Horizontal event card scroll
│   │   ├── AboutSection.tsx                # "Why FERAL" pillars with animations
│   │   └── ContactSection.tsx              # Email signup + social links
│   ├── event/
│   │   ├── DynamicEventPage.tsx            # DB-driven event page (Stripe events, uses branding)
│   │   ├── LiverpoolEventPage.tsx          # Hardcoded Liverpool event (WeeZTix)
│   │   ├── KompassEventPage.tsx            # Hardcoded Kompass event (WeeZTix)
│   │   ├── TicketsPage.tsx                 # Standalone tickets page (WeeZTix)
│   │   ├── EventHero.tsx                   # Event banner + details
│   │   ├── TicketWidget.tsx                # Ticket selector (WeeZTix events)
│   │   ├── DynamicTicketWidget.tsx          # Ticket selector (Stripe events, DB-driven)
│   │   ├── BottomBar.tsx                   # Sticky bottom bar (Buy Now / Checkout)
│   │   ├── TeeModal.tsx                    # Merch image zoom + size selection
│   │   ├── DiscountPopup.tsx               # 3-screen discount popup + Klaviyo
│   │   ├── EngagementTracker.tsx           # Invisible scroll/time tracking
│   │   └── SocialProofToast.tsx            # "Last ticket booked X min ago" toast
│   ├── checkout/
│   │   ├── CheckoutPage.tsx                # WeeZTix checkout (legacy)
│   │   ├── NativeCheckout.tsx              # Stripe checkout (single page, dynamic branding)
│   │   ├── StripePaymentForm.tsx           # Stripe PaymentElement form
│   │   ├── ExpressCheckout.tsx             # Apple Pay / Google Pay button
│   │   ├── OrderConfirmation.tsx           # Post-purchase with QR codes + PDF + wallet passes
│   │   ├── OrderSummary.tsx                # Inline cart summary strip
│   │   ├── CheckoutTimer.tsx               # 8-minute urgency countdown
│   │   ├── LoadingScreen.tsx               # Payment processing interstitial
│   │   └── WeeZTixEmbed.tsx                # WeeZTix iframe embed (legacy)
│   ├── ui/                                # shadcn/ui components (Tailwind + Radix UI)
│   │   ├── avatar.tsx                     # Avatar with image/fallback initials
│   │   ├── badge.tsx                      # Status badge with variants
│   │   ├── button.tsx                     # Button with variants (default, ghost, outline, destructive)
│   │   ├── card.tsx                       # Card, CardHeader, CardTitle, CardContent, CardFooter
│   │   ├── collapsible.tsx                # Collapsible section (Radix)
│   │   ├── dialog.tsx                     # Modal dialog (Radix)
│   │   ├── input.tsx                      # Text input
│   │   ├── label.tsx                      # Form label
│   │   ├── progress.tsx                   # Progress bar
│   │   ├── separator.tsx                  # Visual separator (horizontal/vertical)
│   │   ├── slider.tsx                     # Range slider
│   │   ├── stat-card.tsx                  # Dashboard stat card with icon + trend
│   │   ├── switch.tsx                     # Toggle switch
│   │   ├── table.tsx                      # Data table (header, body, row, cell)
│   │   ├── tabs.tsx                       # Tabs, TabsList, TabsTrigger, TabsContent
│   │   ├── textarea.tsx                   # Textarea
│   │   └── tooltip.tsx                    # Tooltip (Radix)
│   └── layout/
│       ├── Header.tsx                      # Nav bar + hamburger menu
│       ├── Footer.tsx                      # Copyright + status
│       ├── Scanlines.tsx                   # CRT scanline + noise overlays
│       └── CookieConsent.tsx               # GDPR consent banner + GTM integration
├── hooks/
│   ├── useBranding.ts                     # Org branding settings (logo, colors, fonts — module-level cache)
│   ├── useSettings.tsx                     # Settings context + realtime subscription
│   ├── useTicketCart.ts                    # Cart state (3 ticket types, sizes, totals)
│   ├── useMetaTracking.ts                 # Meta Pixel + CAPI (consent-aware, stable refs)
│   ├── useDataLayer.ts                    # GTM dataLayer push (stable refs)
│   ├── useTraffic.ts                      # Supabase funnel tracking
│   ├── useHeaderScroll.ts                 # Header hide/show on scroll
│   └── useScrollReveal.ts                 # IntersectionObserver scroll animations
├── lib/
│   ├── auth.ts                            # requireAuth(), getSession() — API route auth helpers
│   ├── constants.ts                       # ORG_ID, TABLES, SETTINGS_KEYS, brandingKey()
│   ├── utils.ts                           # cn() helper (clsx + tailwind-merge)
│   ├── settings.ts                        # fetchSettings (server), saveSettings (client)
│   ├── klaviyo.ts                         # Email subscription + identify
│   ├── meta.ts                            # Meta CAPI: hash PII, send events
│   ├── email.ts                           # Order confirmation email sender (Resend + PDF attachment)
│   ├── email-templates.ts                 # HTML email template builder (order confirmation)
│   ├── pdf.ts                             # PDF ticket generation (jsPDF, A5 format, custom branding)
│   ├── qr.ts                              # QR code generation (data URL + PNG buffer)
│   ├── ticket-utils.ts                    # generateTicketCode, generateOrderNumber
│   ├── wallet-passes.ts                   # Apple Wallet + Google Wallet pass generation
│   ├── date-utils.ts                      # Date formatting helpers
│   ├── image-utils.ts                     # Image processing utilities
│   ├── supabase/
│   │   ├── client.ts                      # Browser Supabase client (singleton, no-cache)
│   │   ├── middleware.ts                  # Supabase client for Next.js middleware
│   │   └── server.ts                      # Server Supabase client (cookies, no-cache)
│   └── stripe/
│       ├── client.ts                      # Browser Stripe.js (lazy singleton, Connect-aware)
│       ├── server.ts                      # Server Stripe instance (platform account)
│       └── config.ts                      # Platform fees, currency helpers, toSmallestUnit
├── types/
│   ├── settings.ts                        # EventSettings, BrandingSettings, EventThemeOverrides
│   ├── events.ts                          # Event, TicketTypeRow, EventStatus, PaymentMethod
│   ├── orders.ts                          # Order, OrderItem, Ticket, Customer, GuestListEntry
│   ├── tickets.ts                         # TicketKey, TicketType, TeeSize, CartItem
│   ├── products.ts                        # Product (standalone merch catalog)
│   ├── email.ts                           # EmailSettings, PdfTicketSettings, OrderEmailData
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
- Checkout via `NativeCheckout` → `CardFields` + `ExpressCheckout`
- PaymentIntent flow: create → confirm → webhook creates order + tickets
- Apple Pay / Google Pay via Stripe ExpressCheckoutElement
- Klarna (pay later) support built-in

Event routing is automatic: `event/[slug]/page.tsx` checks `payment_method` in the DB and renders the correct component.

### Stripe Connect (Multi-Tenant Payments)
- **Model**: Direct charges on connected accounts with application fee
- **Account type**: Custom (white-labeled — promoter never sees Stripe dashboard)
- **Platform fee**: 5% default, £0.50 minimum (configurable per event via `platform_fee_percent`)
- **Per-event routing**: `payment-intent` and `confirm-order` routes check `event.stripe_account_id` first, then fall back to global `feral_stripe_account` in `site_settings`
- **Currency**: Amounts always in smallest unit (pence/cents) — use `toSmallestUnit()` / `fromSmallestUnit()`
- Admin pages: `/admin/payments/` (promoter-facing setup), `/admin/connect/` (platform admin)
- Onboarding: Embedded via ConnectJS (`client_secret`) or hosted link fallback

### Multi-Tenancy: org_id on EVERYTHING
Every database table has an `org_id` column. Every query must filter by it.
- Current value: `'feral'` (from `constants.ts`)
- Every new table, every new query, every new API route must include `org_id`
- Supabase RLS policies must enforce org_id isolation
- This is non-negotiable — it's the foundation for the multi-promoter platform

### White-Label Branding System
Each tenant can fully customize their visual identity:

**Org-level branding** (`BrandingSettings` in `site_settings` under key `{org_id}_branding`):
- Logo, org name, accent color, background color, card color, text color
- Heading font, body font, copyright text, support email, social links
- Used by: checkout header/footer, event page footer/banner, email templates, PDF tickets

**How it flows — no FOUC:**
1. Event layout (Server Component) fetches branding from `site_settings` in parallel with other data
2. CSS variables (`--accent`, `--bg-dark`, `--card-bg`, `--text-primary`, `--font-mono`, `--font-sans`) injected server-side
3. Client components use `useBranding()` hook (module-level cache, single fetch) for text/logo
4. `GET /api/branding` serves branding to checkout pages (public, no auth)
5. `POST /api/branding` saves branding (admin auth required)

### Settings System
Two sources of truth depending on event type:

**WeeZTix events**: `site_settings` table (key → JSONB)
- Keys: `feral_event_liverpool`, `feral_event_kompass`
- Contains: ticket IDs, names, theme config, image settings
- Server-side fetch in event layout → `SettingsProvider` context → no FOUC
- Realtime subscription for live admin updates

**Native events**: `events` + `ticket_types` tables
- Event data (name, venue, dates, theme, about, lineup, images) in `events` table
- Ticket configuration (price, capacity, sold, tier, merch) in `ticket_types` table
- Settings key still exists for theme/image overrides
- Marketing settings stored under key `feral_marketing`
- Branding settings stored under key `{org_id}_branding`

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
    ├─ Fetch org branding for CSS variables (parallel)
    ├─ Determine theme (minimal vs default) + inject CSS variables
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
- `GET /api/branding` — org branding for checkout/event pages
- `GET /api/merch` — public merch catalog
- `GET /api/media/[key]` — public media serving
- `POST /api/track` — analytics tracking
- `POST /api/meta/capi` — Meta CAPI
- `GET /api/health` — system health
- `GET /api/orders/[id]/wallet/*` — wallet pass downloads (order UUID = unguessable access token)

**Protected API routes (admin auth required):**
- All `POST/PUT/DELETE` on `/api/settings`, `/api/events`, `/api/orders`
- `POST /api/branding` — save branding settings
- All `/api/customers`, `/api/guest-list`, `/api/upload`
- All `/api/merch` mutations (POST/PUT/DELETE)
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
2. Every new public API route must be added to `PUBLIC_API_PREFIXES` or `PUBLIC_API_EXACT_GETS` in middleware.ts
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
| `events` | Event definitions | slug, name, venue_*, date_*, status, payment_method, currency, stripe_account_id, platform_fee_percent, about_text, lineup, details_text, tag_line, doors_time, cover_image, hero_image |
| `ticket_types` | Ticket pricing/inventory | event_id, name, price, capacity, sold, tier, includes_merch, merch_sizes[], merch_name, merch_description, merch_images, product_id, status |
| `products` | Standalone merch catalog | name, type, sizes[], price, images, status, sku |
| `orders` | Purchase records | order_number (FERAL-00001), event_id, customer_id, status, subtotal, fees, total, payment_ref |
| `order_items` | Line items per order | order_id, ticket_type_id, qty, unit_price, merch_size |
| `tickets` | Individual tickets with QR | ticket_code (FERAL-XXXXXXXX), order_id, status, holder_*, scanned_at, scanned_by |
| `customers` | Customer profiles | email, first_name, last_name, nickname, total_orders, total_spent |
| `guest_list` | Manual guest entries | event_id, name, email, qty, checked_in, checked_in_at |
| `traffic_events` | Funnel tracking | event_type, page_path, session_id, referrer, utm_* |
| `popup_events` | Popup interaction tracking | event_type (impressions, engaged, conversions, dismissed) |
| `abandoned_carts` | Checkout abandonment tracking | customer_id, event_id, items (jsonb), subtotal, status, notification_count, notified_at, recovered_at |

### Key Constraints
- `orders.order_number` — unique, format `FERAL-XXXXX` (sequential, padded)
- `tickets.ticket_code` — unique, format `FERAL-XXXXXXXX` (random, crypto-safe)
- `orders.payment_ref` — used for idempotency (Stripe PaymentIntent ID)
- `products.product_id` on `ticket_types` — FK to `products` table (ON DELETE SET NULL)
- All tables have `org_id` column

### External Service Changes Rule (CRITICAL)
The user manages Supabase, Vercel, Stripe, and other services manually via their dashboards. They do NOT use migration files, CLI tools, or infrastructure-as-code. Whenever code requires a change to an external service, you MUST:

1. **Tell the user immediately** — in the same response where the code is written, not later
2. **Make it copy-paste ready** — exact SQL, exact env var names and values, exact settings to toggle
3. **Say exactly where to go** — "Supabase dashboard → SQL Editor", "Vercel dashboard → Settings → Environment Variables", etc.
4. **Never assume it already exists** unless it's documented in this file

This applies to ALL external services:

**Supabase (database)**
- New tables or columns → provide exact `CREATE TABLE` / `ALTER TABLE` SQL
- New RLS policies → provide exact `CREATE POLICY` SQL
- New indexes → provide exact `CREATE INDEX` SQL
- Reference: only tables/columns listed in the Tables section above are confirmed to exist

**Vercel (hosting)**
- New environment variables → provide exact variable name + description of the value
- Changed build settings, redirects, or rewrites → provide exact config
- New domains or domain settings → provide exact steps

**Stripe (payments)**
- New webhook endpoints → provide exact event types to subscribe to
- New products/prices → provide exact steps in Stripe dashboard
- Changed Connect settings → provide exact steps

**Any other service** (Resend, Klaviyo, GTM, etc.)
- Same rule: exact steps, exact values, exact location in the dashboard

### Key Settings Keys
| Key | Purpose |
|-----|---------|
| `feral_event_liverpool` | Liverpool event config (WeeZTix) |
| `feral_event_kompass` | Kompass event config (WeeZTix) |
| `feral_marketing` | Meta Pixel + CAPI settings |
| `feral_email` | Email template settings |
| `feral_wallet_passes` | Wallet pass configuration |
| `feral_branding` | Org branding (logo, colors, fonts) |
| `feral_stripe_account` | Global Stripe Connect account (fallback) |

---

## API Routes (39 endpoints)

### Orders & Tickets (critical path)
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/orders` | List orders (filter by event, status, date range) |
| POST | `/api/orders` | Create order (test mode only) |
| GET | `/api/orders/[id]` | Full order detail with customer, items, tickets |
| POST | `/api/orders/[id]/refund` | Refund order → cancel tickets → update stats |
| GET | `/api/orders/[id]/pdf` | Generate PDF tickets with QR codes |
| GET | `/api/orders/[id]/wallet/apple` | Download Apple Wallet pass |
| GET | `/api/orders/[id]/wallet/google` | Get Google Wallet pass URL |
| GET | `/api/orders/export` | Export CSV (one row per ticket) |
| GET | `/api/tickets/[code]` | Validate ticket (scanner API) |
| POST | `/api/tickets/[code]/scan` | Mark scanned (prevents double-scan) |
| GET | `/api/tickets/[code]/merch` | Get merch details for a ticket |

### Stripe (payment processing)
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/stripe/payment-intent` | Create PaymentIntent (per-event Stripe account + fee) |
| POST | `/api/stripe/confirm-order` | Verify payment → create order + tickets |
| POST | `/api/stripe/webhook` | Handle payment_intent.succeeded / failed |
| GET | `/api/stripe/account` | Get connected Stripe account ID |
| GET/POST | `/api/stripe/connect` | List / create Connect accounts |
| GET/DELETE | `/api/stripe/connect/[accountId]` | Get / delete account |
| GET/POST | `/api/stripe/connect/[accountId]/onboarding` | Onboarding link / session |
| GET/POST | `/api/stripe/apple-pay-domain` | List / register domains |
| GET | `/api/stripe/apple-pay-verify` | Serve Apple Pay verification file |

### Events, Merch & Content
| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/events` | List / create events (all fields including content + Stripe account) |
| GET/PUT/DELETE | `/api/events/[id]` | Get / update / delete event + ticket types |
| GET/POST | `/api/merch` | List / create standalone merch items |
| GET/PUT/DELETE | `/api/merch/[id]` | Get / update / delete merch item |
| GET | `/api/merch/[id]/linked-tickets` | Get ticket types linked to a merch item |
| GET/POST | `/api/settings` | Get / save settings by key |
| GET/POST | `/api/branding` | Get / save org branding (logo, colors, fonts) |
| POST | `/api/upload` | Upload image (base64 → media key) |
| GET | `/api/media/[key]` | Serve uploaded image |

### Email & Wallet Passes
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/email/test` | Send test email with PDF attachment |
| GET | `/api/email/status` | Email delivery status |
| GET | `/api/wallet/status` | Wallet pass configuration status |

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
- `useBranding()` — returns `useMemo(branding)` with module-level cache

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

### Module-Level State (`useMetaTracking`, `useBranding`)
- `_settings`, `_fetchPromise`, `_pixelLoaded` persist at module scope (not component scope)
- `useBranding` uses `_cachedBranding` and `_fetchPromise` at module level — single fetch, shared across all instances
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
RESEND_API_KEY                    # Resend API key (transactional email)
```

---

## Testing

### Setup
- **Framework**: Vitest + @testing-library/react (jsdom)
- **Config**: `vitest.config.ts` — path aliases, jsdom, setup file
- **Setup**: `src/__tests__/setup.ts` — localStorage mock, crypto.randomUUID mock, jest-dom
- **Run**: `npm test` (single run) or `npm run test:watch` (watch mode)

### Current Coverage (109 tests, 6 suites)
- `useTicketCart` — 25 tests (state, add/remove, tee sizes, cart params, checkout URL, settings preservation)
- `useMetaTracking` — 10 tests (referential stability, consent gating, API shape)
- `useDataLayer` — 8 tests (referential stability, event pushing, tracking helpers)
- `auth` — 38 tests (requireAuth, session handling, middleware auth)
- `wallet-passes` — 18 tests (Apple Wallet, Google Wallet, configuration checks)
- `products` — 10 tests (product CRUD, type validation)

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
- **Full selling path**: Event page → Ticket selection → Checkout → Payment → Order + QR tickets + Email
- Stripe checkout (PaymentIntent, Apple Pay, Google Pay, Klarna)
- Stripe Connect (direct charges, per-event accounts, per-event platform fees)
- QR ticket generation (ticket codes, QR data URLs, PDF download)
- PDF ticket customization (A5 format, configurable colors, logo, QR size, disclaimers)
- Apple Wallet + Google Wallet pass generation
- Email confirmations (Resend — order confirmation with PDF ticket attachment)
- Email template customization (branding, logo, accent color, copy, logo sizing)
- Meta Pixel + CAPI (client-side pixel, server-side conversion API)
- Order management (create, list, detail, refund, CSV export)
- Event CRUD (create events with full content, configure ticket types, set themes)
- Merch catalog (standalone merch with sizes, images, SKUs, linkable to ticket types)
- Ticket store theme editor (multi-theme system with live preview, Shopify-style editor)
- Customer management (profiles, order history, spend tracking, detail view)
- Guest list management (add guests, check-in, export)
- Traffic analytics (funnel tracking, realtime updates)
- Popup analytics (impressions, engagement, conversions)
- Admin dashboard (Tailwind v4 + shadcn/ui, 20+ pages, tabbed event editor)
- White-label branding (per-org logo, colors, fonts — server-side CSS variable injection)
- System health monitoring
- Test infrastructure (109 tests, 6 suites)

### Still To Build
1. **Scanner PWA** — mobile web app for door staff. API endpoints exist (`/api/tickets/[code]` and `/api/tickets/[code]/scan`) but no frontend app.
2. **Ticket Store — additional themes** — the multi-theme editor is built (`/admin/ticketstore/`), with Midnight theme complete. Daylight and Neon themes need full CSS implementations.
3. **Google Ads + TikTok tracking** — placeholders exist in marketing page but no implementation.
4. **Multi-tenant promoter dashboard** — Stripe Connect is built, but the actual promoter-facing dashboard (separate from platform admin) doesn't exist yet.
5. **Rate limiting** — API routes have no request rate limiting. Consider adding for payment and auth endpoints.
6. **Supabase RLS policies** — Row-Level Security policies should be configured in Supabase dashboard to enforce org_id isolation at the database level.

---

## Design System

### Platform Brand (Entry)
- **Primary**: `#8B5CF6` (Electric Violet)
- **Gradient**: `linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)`
- **Glow**: `rgba(139, 92, 246, 0.15)` / `rgba(139, 92, 246, 0.25)`
- The Entry wordmark, login page, admin buttons, and active states all use the Electric Violet palette
- See Admin Design Tokens below for full token list

### Public Event Pages (Tenant-Configurable)
- **Background**: `#0e0e0e` default (overridable via branding `--bg-dark`)
- **Accent**: `#ff0033` default (overridable via branding `--accent`)
- **Card/Section background**: `#1a1a1a` with `#2a2a2a` border (overridable via branding `--card-bg`)
- **Text**: `#fff` (primary), `#888` (secondary), `#555` (muted)
- **Heading font**: `Space Mono` (monospace, uppercase, letter-spacing) (overridable via branding `--font-mono`)
- **Body font**: `Inter` (sans-serif) (overridable via branding `--font-sans`)
- **Effects**: CRT scanlines, noise texture overlays, glitch animations
- **Mobile-first**: Most ticket buyers are on phones
- **No FOUC**: Server-side settings + branding fetch, CSS variables injected in initial HTML
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
| `tailwind.css` | Admin layout (`app/admin/layout.tsx`) | Tailwind v4 theme + utilities + admin-scoped preflight |
| `admin.css` | Admin layout (`app/admin/layout.tsx`) | Admin dashboard supplementary styles |
| `tickets-page.css` | `TicketsPage.tsx` | WeeZTix ticket selection |
| `checkout-page.css` | Checkout components | Checkout + payment form |
| `popup.css` | `DiscountPopup.tsx` | Discount popup |

### CSS Variables (defined in `base.css :root`, overridden by branding)
```css
--bg-dark: #0e0e0e;           --card-bg: #1a1a1a;
--card-border: #2a2a2a;        --accent: #ff0033;
--text-primary: #fff;          --text-secondary: #888;
--text-muted: #555;            --font-mono: 'Space Mono', monospace;
--font-sans: 'Inter', sans-serif;
```

These variables are **overridable per-tenant** via the branding system. The event layout injects org branding as inline CSS variables server-side, so the entire page adapts without FOUC.

### Standardized Breakpoints
```
@media (max-width: 1024px)  — Tablet landscape / small desktop
@media (max-width: 768px)   — Tablet portrait / large phone
@media (max-width: 480px)   — Phone
```

### Rules for New CSS (Public Site)
1. **Component-level imports** — new components import their own CSS file
2. **BEM naming** — `.block__element--modifier` (28 prefixes already in use)
3. **Use CSS custom properties** from `base.css :root` for all colors, fonts, spacing
4. **CSS Modules** for all new components — prevents class name collisions as the platform scales
5. **No Tailwind on public pages** — public site uses hand-written CSS only
6. **Responsive rules live with their component** — media queries go in the same file as the styles they modify

---

## Admin UI Stack (Tailwind + shadcn/ui)

The admin dashboard (`/admin/*`) uses a completely separate UI stack from the public site: **Tailwind CSS v4 + shadcn/ui** (built on Radix UI primitives). The admin shell is branded **Entry** (the platform's name).

### Two Separate CSS Worlds (CRITICAL)
The platform has two CSS systems that must not interfere:

| Area | CSS System | Entry Point |
|------|-----------|-------------|
| Public site (events, checkout, landing) | Hand-written CSS (`base.css`, `event.css`, etc.) | `app/layout.tsx` |
| Admin dashboard (`/admin/*`) | Tailwind v4 + shadcn/ui utilities | `app/admin/layout.tsx` via `tailwind.css` |

**Isolation mechanism**: The admin layout renders `<div data-admin>`. All Tailwind preflight resets are scoped to `[data-admin]` so they never affect public pages.

### CSS Cascade Layer Rules (DO NOT BREAK)
The `src/styles/tailwind.css` file has a carefully tuned layer setup:

```css
@layer theme;
@import "tailwindcss/theme" layer(theme);     /* Variables only — in a layer */
@import "tailwindcss/utilities";               /* UNLAYERED — intentional! */
```

**Why utilities are unlayered**: The public site's `base.css` has an unlayered `* { margin: 0; padding: 0; }` reset. CSS cascade rules say unlayered styles always beat layered styles. If Tailwind utilities were in `@layer utilities`, the `*` reset would override every `p-4`, `m-2`, `gap-3` class — making the entire admin layout broken. By keeping utilities unlayered, they compete on specificity (class > universal selector) and win.

**NEVER**:
- Add `layer(utilities)` to the Tailwind utilities import
- Move the utilities import into any `@layer` block
- Add a global `*` reset that could override Tailwind classes

### shadcn/ui Components

**Location**: `src/components/ui/*.tsx`

**Current components**: Avatar, Badge, Button, Card, Collapsible, Dialog, Input, Label, Progress, Separator, Slider, StatCard, Switch, Table, Tabs, Textarea, Tooltip

**How to add new shadcn components**:
1. Write the component manually in `src/components/ui/` following the shadcn pattern
2. Use Radix UI primitives from the `radix-ui` package (already installed)
3. Use `cn()` from `@/lib/utils` for className merging (clsx + tailwind-merge)
4. Follow the existing component patterns — `React.forwardRef`, `ComponentRef`, CVA variants
5. The shadcn CLI may not have registry access — creating components manually is identical

**Example pattern** (every shadcn component follows this):
```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

function ComponentName({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("base-classes", className)} {...props} />;
}

export { ComponentName };
```

**For Radix-based components** (Tabs, Switch, Slider, etc.):
```tsx
import { Tabs as TabsPrimitive } from "radix-ui";

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("base-classes", className)} {...props} />;
}
```

### Admin Design Tokens
Design tokens are defined in `tailwind.css` via `@theme inline {}`. All shadcn components consume these:

| Token | Value | Usage |
|-------|-------|-------|
| `--color-background` | `#08080c` | Page background |
| `--color-foreground` | `#f0f0f5` | Primary text |
| `--color-primary` | `#8B5CF6` | Electric Violet — accent / brand color |
| `--color-card` | `#111117` | Card backgrounds |
| `--color-muted-foreground` | `#71717a` | Secondary text |
| `--color-border` | `#1e1e2a` | Borders (purple-tinted) |
| `--color-sidebar` | `#0a0a10` | Sidebar background |
| `--color-sidebar-foreground` | `#8888a0` | Sidebar text |
| `--color-sidebar-accent` | `#141420` | Sidebar active item |
| `--color-sidebar-border` | `#161624` | Sidebar borders |

**Always use these tokens** via Tailwind classes (`bg-background`, `text-foreground`, `border-border`, etc.) — never hardcode hex values in admin components.

### Admin UI Patterns

**Image upload with hover overlay** (used for logos):
- Dark preview background (`bg-[#0e0e0e]`) containing the image
- Tiny icon buttons (24x24) positioned at top-right using `absolute top-2 right-2`
- Glass-morphism style: `bg-white/10 backdrop-blur-sm text-white/70`
- Appear on hover via `opacity-0 group-hover:opacity-100` on a parent with `group relative`
- Use Pencil icon (edit) + Trash2 icon (remove) from lucide-react

**Settings forms**:
- Use shadcn `Card` for sections, `Label` + `Input`/`Textarea`/`Switch`/`Slider` for controls
- Use shadcn `Tabs` (variant="line" where appropriate) for Settings/Preview/Full Preview
- Color pickers: native `<input type="color">` with a small preview swatch
- Save via `saveSettings()` from `@/lib/settings` — debounce where appropriate

**Event editor** (`app/admin/events/[slug]/page.tsx`):
- Tabbed interface: Details, Content, Design, Tickets, Settings
- Components in `src/components/admin/event-editor/`
- Each tab is a standalone component receiving the event state and an update callback
- Ticket types managed inline with add/remove/reorder

**Sidebar layout** (`app/admin/layout.tsx`):
- Fixed sidebar (w-64) with sections, mobile overlay with slide transition
- User footer at bottom: avatar (initials), org name, email, click for dropdown
- Dropdown positioned above footer: `absolute inset-x-3 bottom-full mb-2`
- Outside-click dismissal via `mousedown` event listener on `useRef`

### Rules for New Admin Pages
1. **Always `"use client"`** — admin pages use React state, effects, and browser APIs
2. **Import `tailwind.css`** — already done via `admin/layout.tsx`, no extra import needed
3. **Use shadcn components** — never recreate Button, Input, Card, Tabs, etc. from scratch
4. **Use Tailwind classes** — all styling via utility classes, no hand-written CSS for admin
5. **Use design tokens** — `bg-background`, `text-foreground`, `border-border`, etc.
6. **Settings pattern** — fetch from `site_settings` table, save back via `/api/settings`
7. **File uploads** — POST base64 to `/api/upload`, get back a media key for the URL
