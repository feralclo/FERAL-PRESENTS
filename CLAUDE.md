# Entry — Platform Context

## Mission
Entry is a white-label events and ticketing platform. Today it powers FERAL's own events. The goal is to become a **"Shopify for Events"** — any promoter or artist can sell tickets, merch, and manage events under their own brand, with the platform taking a fee.

Everything built must serve that multi-tenant future. Every database query filters by `org_id`. Every feature must work for promoters who aren't FERAL.

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript (strict) | 5.9.3 |
| Runtime | React | 19.2.3 |
| Database | Supabase (PostgreSQL + REST + Realtime) | — |
| Payments | Stripe (Connect, direct charges) | 20.3.1 |
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
├── middleware.ts              # Auth session refresh, route protection, security headers
├── app/
│   ├── layout.tsx             # Root layout (fonts, GTM, consent, scanlines)
│   ├── page.tsx               # Landing page (/)
│   ├── global-error.tsx       # Global error boundary
│   ├── event/[slug]/          # Public event pages
│   │   ├── layout.tsx         # Server Component: fetches event + settings + branding → CSS vars
│   │   ├── page.tsx           # Routes to DynamicEventPage (Stripe) or legacy event page
│   │   ├── checkout/page.tsx  # NativeCheckout (Stripe Elements)
│   │   ├── error.tsx          # Error boundary
│   │   └── loading.tsx        # Loading skeleton
│   ├── admin/                 # Admin dashboard (25+ pages)
│   │   ├── layout.tsx         # Sidebar nav + logout (Entry-branded shell)
│   │   ├── login/             # Supabase Auth login (email/password)
│   │   ├── page.tsx           # Dashboard (KPIs, activity feed, funnel chart)
│   │   ├── events/            # Event list + tabbed event editor
│   │   ├── orders/            # Order list + detail + refund + PDF
│   │   ├── customers/         # Customer search + detail
│   │   ├── guest-list/        # Per-event guest list + check-in
│   │   ├── merch/             # Merch catalog + editor
│   │   ├── discounts/         # Discount code management
│   │   ├── abandoned-carts/   # Abandoned cart tracking
│   │   ├── reps/              # Rep program (list, detail, quests, rewards, settings)
│   │   ├── ticketstore/       # Theme management + Shopify-style editor
│   │   ├── finance/           # Finance overview
│   │   ├── traffic/           # Funnel analytics (realtime)
│   │   ├── popup/             # Popup performance (realtime)
│   │   ├── payments/          # Stripe Connect setup (promoter-facing)
│   │   ├── connect/           # Stripe Connect admin (platform-level)
│   │   ├── marketing/         # Meta Pixel + CAPI config
│   │   ├── communications/    # Email templates, PDF tickets, wallet passes, marketing campaigns
│   │   ├── settings/          # Platform settings + danger zone
│   │   └── health/            # System health monitoring
│   └── api/                   # See API Routes section for full endpoint list
│       ├── auth/              # login, logout, recover
│       ├── admin/             # dashboard, orders-stats
│       ├── events/            # CRUD + ticket types
│       ├── orders/            # CRUD, refund, PDF, wallet passes, resend email, export
│       ├── stripe/            # payment-intent, confirm-order, webhook, connect, apple-pay
│       ├── checkout/          # capture (post-payment order creation)
│       ├── customers/         # list + search
│       ├── guest-list/        # CRUD per event
│       ├── merch/             # CRUD + linked tickets
│       ├── discounts/         # CRUD, validate, seed
│       ├── reps/              # Admin rep management (19 routes)
│       ├── rep-portal/        # Rep-facing API (16 routes)
│       ├── abandoned-carts/   # Cart tracking
│       ├── email/             # test send, delivery status
│       ├── wallet/            # wallet pass status
│       ├── track/             # traffic + popup analytics
│       ├── meta/capi/         # Meta Conversions API
│       ├── health/            # system health checks
│       ├── settings/          # key-value settings CRUD
│       ├── branding/          # org branding CRUD
│       ├── upload/            # image upload (base64 → media key)
│       └── media/[key]/       # serve uploaded images
├── components/
│   ├── admin/                 # Admin reusable: ImageUpload, LineupTagInput, TierSelector
│   │   ├── event-editor/      # Tabbed event editor (Details, Content, Design, Tickets, Settings)
│   │   └── dashboard/         # ActivityFeed, FunnelChart, TopEventsTable
│   ├── aura/                  # Aura theme components (full event page + checkout variant)
│   ├── event/                 # DynamicEventPage, DynamicTicketWidget, EventHero, BottomBar,
│   │                          # TeeModal, DiscountPopup, EngagementTracker, SocialProofToast
│   ├── checkout/              # NativeCheckout, StripePaymentForm, ExpressCheckout,
│   │                          # OrderConfirmation, OrderSummary, CheckoutTimer, LoadingScreen
│   ├── landing/               # LandingPage, HeroSection, ParticleCanvas, EventsSection, etc.
│   ├── layout/                # Header, Footer, Scanlines, CookieConsent
│   └── ui/                    # shadcn/ui (27 components — see Admin UI section)
├── hooks/
│   ├── useBranding.ts         # Org branding (module-level cache, single fetch)
│   ├── useSettings.tsx        # Settings context + realtime subscription
│   ├── useDashboardRealtime.ts # Dashboard live updates
│   ├── useMetaTracking.ts     # Meta Pixel + CAPI (consent-aware, stable refs)
│   ├── useDataLayer.ts        # GTM dataLayer push (stable refs)
│   ├── useTraffic.ts          # Supabase funnel tracking
│   ├── useHeaderScroll.ts     # Header hide/show on scroll
│   └── useScrollReveal.ts     # IntersectionObserver scroll animations
├── lib/
│   ├── supabase/              # admin.ts (data), server.ts (auth only), client.ts (browser), middleware.ts
│   ├── stripe/                # client.ts (browser), server.ts (platform), config.ts (fees/currency)
│   ├── auth.ts                # requireAuth(), requireRepAuth(), getSession()
│   ├── constants.ts           # ORG_ID, TABLES, SETTINGS_KEYS, brandingKey()
│   ├── settings.ts            # fetchSettings (server), saveSettings (client)
│   ├── orders.ts              # Order creation helpers
│   ├── email.ts               # Order confirmation email (Resend + PDF attachment)
│   ├── email-templates.ts     # HTML email template builder
│   ├── pdf.ts                 # PDF ticket generation (jsPDF, A5, custom branding)
│   ├── qr.ts                  # QR code generation
│   ├── ticket-utils.ts        # generateTicketCode, generateOrderNumber
│   ├── wallet-passes.ts       # Apple Wallet + Google Wallet pass generation
│   ├── discount-codes.ts      # Discount code validation + application
│   ├── vat.ts                 # VAT calculation
│   ├── rate-limit.ts          # API rate limiting
│   ├── themes.ts              # Theme system helpers
│   ├── rep-attribution.ts     # Rep sale attribution
│   ├── rep-emails.ts          # Rep notification emails
│   ├── rep-points.ts          # Rep points calculation
│   ├── klaviyo.ts             # Email subscription + identify
│   ├── meta.ts                # Meta CAPI: hash PII, send events
│   ├── nicknames.ts           # Customer nickname generation
│   ├── date-utils.ts          # Date formatting helpers
│   ├── image-utils.ts         # Image processing utilities
│   └── utils.ts               # cn() helper (clsx + tailwind-merge)
├── types/                     # TypeScript types per domain
│   ├── settings.ts            # EventSettings, BrandingSettings, EventThemeOverrides
│   ├── events.ts              # Event, TicketTypeRow, EventStatus, PaymentMethod
│   ├── orders.ts              # Order, OrderItem, Ticket, Customer, GuestListEntry
│   ├── tickets.ts             # TicketKey, TicketType, TeeSize, CartItem
│   ├── products.ts            # Product (standalone merch catalog)
│   ├── discounts.ts           # Discount code types
│   ├── reps.ts                # Rep program types
│   ├── email.ts               # EmailSettings, PdfTicketSettings, OrderEmailData
│   ├── analytics.ts           # TrafficEvent, PopupEvent types
│   └── marketing.ts           # MarketingSettings, MetaEventPayload, MetaCAPIRequest
└── styles/
    ├── base.css               # Reset, CSS variables, typography, reveal animations
    ├── effects.css            # CRT scanlines + noise texture overlays
    ├── header.css             # Header, navigation, mobile menu
    ├── landing.css            # Hero, events grid, about pillars, contact form
    ├── event.css              # Event pages, tickets, modals, bottom bar, minimal theme
    ├── aura.css               # Aura theme styles
    ├── aura-effects.css       # Aura theme effects
    ├── checkout-page.css      # Checkout + payment form
    ├── cookie.css             # Cookie consent banner
    ├── popup.css              # Discount popup
    ├── rep-portal.css         # Rep portal styles
    ├── tailwind.css           # Tailwind v4 theme + utilities (admin only)
    └── admin.css              # Admin supplementary styles
```

---

## Architecture

### Payment System (Stripe)
All events use Stripe for payment processing:
- Dynamic event pages (`DynamicEventPage` / `AuraEventPage`) rendered from `events` table
- Ticket types stored in `ticket_types` table with pricing, capacity, tiers, merch links
- Checkout via `NativeCheckout` or `AuraCheckout` → `StripePaymentForm` + `ExpressCheckout`
- PaymentIntent flow: create → confirm → webhook creates order + tickets + email
- Apple Pay / Google Pay via Stripe ExpressCheckoutElement
- Discount codes applied at checkout (validated server-side via `/api/discounts/validate`)

**One legacy exception**: The slug `kompass-klub-7-march` routes to a hardcoded `KompassEventPage` using external ticketing (Paylogic). All other slugs use the DB-driven flow.

### Theme-Based Routing
Event pages route to different component trees based on the **active template**:

```
event/[slug]/page.tsx
  → getActiveTemplate() reads from site_settings ({org_id}_themes)
  → template === "aura"    → AuraEventPage / AuraCheckout
  → template === "midnight" → DynamicEventPage / NativeCheckout (default)
```

- Default template: `midnight` (falls back if no theme configured)
- Admin can preview non-active themes via `?editor=1&template=aura`
- Theme store managed in `/admin/ticketstore/` with Shopify-style editor

### Stripe Connect (Multi-Tenant Payments)
- **Model**: Direct charges on connected accounts with application fee
- **Account type**: Custom (white-labeled — promoter never sees Stripe dashboard)
- **Platform fee**: 5% default, £0.50 minimum (configurable per event via `platform_fee_percent`)
- **Per-event routing**: `event.stripe_account_id` → fallback to `feral_stripe_account` in site_settings → fallback to platform-only charge
- **Account verification**: `verifyConnectedAccount()` validates account is accessible; falls back to platform if revoked
- **Currency**: GBP, EUR, USD. Amounts always in smallest unit (pence/cents) — use `toSmallestUnit()` / `fromSmallestUnit()` from `lib/stripe/config.ts`
- **VAT**: `lib/vat.ts` calculates VAT (inclusive or exclusive), configured via `feral_vat` settings key
- **Discounts**: Validated server-side during PaymentIntent creation. Supports percentage and fixed-amount codes with expiry, usage limits, and per-event restrictions
- **Rate limiting**: Payment endpoint: 10 requests/minute/IP via `createRateLimiter()`
- Admin pages: `/admin/payments/` (promoter-facing setup), `/admin/connect/` (platform admin), `/admin/finance/` (finance overview)

### Multi-Tenancy: org_id on EVERYTHING
Every database table has an `org_id` column. Every query must filter by it.
- Current value: `'feral'` (from `lib/constants.ts`)
- Every new table, every new query, every new API route must include `org_id`
- Supabase RLS policies should enforce org_id isolation
- This is non-negotiable — it's the foundation for the multi-promoter platform

### White-Label Branding System
Each tenant can fully customize their visual identity:

**Org-level branding** (`BrandingSettings` in `site_settings` under key `{org_id}_branding`):
- Logo, org name, accent color, background color, card color, text color
- Heading font, body font, copyright text

**How it flows — no FOUC:**
1. Event layout (Server Component) fetches branding from `site_settings` in parallel with other data
2. CSS variables (`--accent`, `--bg-dark`, `--card-bg`, `--text-primary`, `--font-mono`, `--font-sans`) injected server-side
3. Client components use `useBranding()` hook (module-level cache, single fetch) for text/logo
4. `GET /api/branding` serves branding to checkout pages (public, no auth)
5. `POST /api/branding` saves branding (admin auth required)

### Settings System
**Event data**: `events` + `ticket_types` tables
- Event content (name, venue, dates, theme, about, lineup, images) in `events` table
- Ticket configuration (price, capacity, sold, tier, merch) in `ticket_types` table
- Marketing settings stored under key `feral_marketing`
- Branding settings stored under key `{org_id}_branding`

**Settings keys** (stored in `site_settings` table as key → JSONB):
| Key | Purpose |
|-----|---------|
| `{org_id}_branding` | Org branding (logo, colors, fonts) — `brandingKey()` |
| `{org_id}_themes` | Theme store (active template, theme configs) — `themesKey()` |
| `{org_id}_vat` | VAT configuration — `vatKey()` |
| `{org_id}_reps` | Reps program settings — `repsKey()` |
| `feral_marketing` | Meta Pixel + CAPI settings |
| `feral_email` | Email template settings |
| `feral_wallet_passes` | Wallet pass configuration |
| `feral_events_list` | Events list configuration |
| `feral_stripe_account` | Global Stripe Connect account (fallback) |

### Request Flow (Event Pages)
```
Browser → /event/[slug]/
  ↓
RootLayout (fonts, GTM consent, scanlines, cookie consent)
  ↓
EventLayout [Server Component, force-dynamic]
  ├─ Fetch event from events table (theme, cover_image, settings_key)
  ├─ Fetch settings from site_settings (parallel)
  ├─ Fetch org branding for CSS variable injection (parallel)
  ├─ Fetch active template via getActiveTemplate() (parallel)
  ├─ Inject CSS variables + data-theme attribute
  ├─ Mount ThemeEditorBridge (live editor support)
  └─ Wrap children in SettingsProvider
  ↓
EventPage [Server Component, force-dynamic]
  ├─ template === "aura"    → AuraEventPage
  └─ template === "midnight" → DynamicEventPage (default)
```

### Caching Strategy
- Event + admin pages: `export const dynamic = "force-dynamic"` — every request fetches fresh data
- All Supabase fetches: `cache: "no-store"` — admin changes appear immediately
- Uploaded media (`/api/media/[key]`): `max-age=31536000, immutable`
- Apple Pay verification file: `max-age=86400`

### Authentication & Security

**Two auth systems:**

| System | Middleware protection | Route handler | Users |
|--------|---------------------|---------------|-------|
| Admin | `/admin/*` pages, all non-public `/api/*` | `requireAuth()` | Created in Supabase Auth dashboard (invitation-only) |
| Rep portal | `/rep/*` pages, `/api/rep-portal/*` | `requireRepAuth()` | Self-signup or admin invite via `/api/reps/[id]/invite` |

**Role flags** (in Supabase `app_metadata`, additive):
- `is_admin: true` — set on admin login. Grants admin access. Always wins over `is_rep`.
- `is_rep: true` — set on rep signup/invite. Grants rep portal access.
- Dual-role users supported (same email can be admin + rep)

**Two layers of API protection:**
1. **Middleware** (first layer) — blocks unauthenticated requests to protected routes at the edge
2. **`requireAuth()` / `requireRepAuth()`** (second layer) — each handler verifies auth + role independently

**Public API routes (no auth required):**
- Stripe: `payment-intent`, `confirm-order`, `webhook`, `account`, `apple-pay-verify`
- Checkout: `checkout/capture`
- Data: `GET /api/events`, `GET /api/settings`, `GET /api/merch`, `GET /api/branding`, `GET /api/themes`
- Media: `GET /api/media/[key]`
- Analytics: `POST /api/track`, `POST /api/meta/capi`
- Discounts: `POST /api/discounts/validate`
- Health: `GET /api/health`
- Wallet: `GET /api/orders/[id]/wallet/*` (order UUID = unguessable access token)
- Rep public: `signup`, `login`, `logout`, `verify-email`, `invite/[token]`
- Auth: `login`, `logout`, `recover`

**Security headers** (applied via middleware):
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (production only)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=*, interest-cohort=()`

**Rules for new routes:**
1. Admin API routes: call `requireAuth()` at the top
2. Rep portal API routes: call `requireRepAuth()` at the top
3. New public API routes: add to `PUBLIC_API_PREFIXES` or `PUBLIC_API_EXACT_GETS` in `middleware.ts`
4. Never hardcode secrets — use environment variables only
5. Stripe webhook must always verify signatures in production

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
| `discounts` | Discount codes | code, type (percentage/fixed), value, max_uses, used_count, applicable_event_ids[], starts_at, expires_at, min_order_amount |
| `abandoned_carts` | Checkout abandonment | customer_id, event_id, items (jsonb), subtotal, status, notification_count |
| `traffic_events` | Funnel tracking | event_type, page_path, session_id, referrer, utm_* |
| `popup_events` | Popup interaction tracking | event_type (impressions, engaged, conversions, dismissed) |

**Reps Program tables** (brand ambassador / street team system):
| Table | Purpose |
|-------|---------|
| `reps` | Rep profiles — points_balance, total_sales, total_revenue, level, invite_token, auth_user_id |
| `rep_events` | Rep-to-event assignments with per-rep discount_id, sales_count, revenue |
| `rep_rewards` | Rewards catalog — reward_type (milestone/points_shop/manual), points_cost, product_id |
| `rep_milestones` | Achievement thresholds — milestone_type (sales_count/revenue/points), threshold_value |
| `rep_points_log` | Points ledger — source_type (sale/quest/manual/reward_spend/refund), points, balance_after |
| `rep_quests` | Tasks for reps — quest_type (social_post/story_share/content_creation/custom), points_reward |
| `rep_quest_submissions` | Proof submissions — proof_type (screenshot/url/text), status (pending/approved/rejected) |
| `rep_reward_claims` | Reward claims — claim_type (milestone/points_shop/manual), status (claimed/fulfilled/cancelled) |

### Key Constraints
- `orders.order_number` — unique, format `FERAL-XXXXX` (sequential, padded)
- `tickets.ticket_code` — unique, format `FERAL-XXXXXXXX` (random, crypto-safe)
- `orders.payment_ref` — used for idempotency (Stripe PaymentIntent ID)
- `products.product_id` on `ticket_types` — FK to `products` table (ON DELETE SET NULL)
- All tables have `org_id` column

### Supabase Client Rules (CRITICAL — Data Access)

The platform has THREE Supabase clients. Using the wrong one causes silent data loss (queries return empty arrays instead of errors when blocked by RLS).

| Client | File | When to Use |
|--------|------|-------------|
| `getSupabaseAdmin()` | `lib/supabase/admin.ts` | **ALL data queries** in API routes, server components, and lib functions. Uses service role key (bypasses RLS). Falls back to session-based client if unavailable. |
| `getSupabaseServer()` | `lib/supabase/server.ts` | **Auth operations ONLY** — `requireAuth()`, `requireRepAuth()`, `getSession()`, login/logout. Needs session cookies. |
| `getSupabaseClient()` | `lib/supabase/client.ts` | **Browser-side only** — realtime subscriptions, client-side reads. Subject to RLS. |

**Rules for new code:**
1. **Every API route that reads/writes data** must use `getSupabaseAdmin()` — NEVER `getSupabaseServer()` for data queries
2. **Only auth routes** should use `getSupabaseServer()` — they need session cookies
3. **Never create a raw `createClient()` with the anon key** for server-side data access — blocked by RLS
4. **New tables must be added to the health check** in `/api/health/route.ts` → `checkDataAccess()`
5. **Admin pages must show API errors** — never silently swallow `fetch()` failures

### External Service Changes Rule (CRITICAL)
The user manages Supabase, Vercel, Stripe, and other services manually via their dashboards. They do NOT use migration files, CLI tools, or infrastructure-as-code. Whenever code requires a change to an external service, you MUST:

1. **Tell the user immediately** — in the same response where the code is written
2. **Make it copy-paste ready** — exact SQL, exact env var names, exact settings to toggle
3. **Say exactly where to go** — "Supabase dashboard → SQL Editor", etc.
4. **Never assume it already exists** unless documented in this file

This applies to: Supabase (SQL for tables/columns/RLS/indexes), Vercel (env vars, build settings), Stripe (webhooks, Connect settings), and any other service (Resend, Klaviyo, GTM).

---

## API Routes (85 endpoints)

### Critical Path (Payment → Order)
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/stripe/payment-intent` | Create PaymentIntent (validates tickets, applies discounts + VAT, rate limited) |
| POST | `/api/stripe/confirm-order` | Verify payment → create order + tickets + email confirmation |
| POST | `/api/checkout/capture` | Post-payment order creation (alternative capture flow) |
| POST | `/api/stripe/webhook` | Handle payment_intent.succeeded / failed |
| GET | `/api/stripe/account` | Get connected Stripe account ID for checkout |

### Orders & Tickets
| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/orders` | List (filter by event/status/date) / create (test mode) |
| GET | `/api/orders/[id]` | Full order detail with customer, items, tickets |
| POST | `/api/orders/[id]/refund` | Refund order → cancel tickets → update stats |
| POST | `/api/orders/[id]/resend-email` | Resend order confirmation email |
| GET | `/api/orders/[id]/pdf` | Generate PDF tickets with QR codes |
| GET | `/api/orders/[id]/wallet/apple` | Download Apple Wallet pass |
| GET | `/api/orders/[id]/wallet/google` | Get Google Wallet pass URL |
| GET | `/api/orders/export` | Export CSV (one row per ticket) |
| GET | `/api/tickets/[code]` | Validate ticket (scanner API) |
| POST | `/api/tickets/[code]/scan` | Mark scanned (prevents double-scan) |
| GET | `/api/tickets/[code]/merch` | Get merch details for a ticket |

### Standard CRUD Groups
| Group | Routes | Operations |
|-------|--------|------------|
| Events | `/api/events`, `/api/events/[id]` | GET/POST/PUT/DELETE + ticket types |
| Merch | `/api/merch`, `/api/merch/[id]`, `/api/merch/[id]/linked-tickets` | GET/POST/PUT/DELETE |
| Customers | `/api/customers` | GET (list + search) |
| Guest List | `/api/guest-list`, `/api/guest-list/[eventId]` | POST/GET/PUT/DELETE |
| Discounts | `/api/discounts`, `/api/discounts/[id]`, `/api/discounts/validate`, `/api/discounts/seed` | GET/POST/PUT/DELETE + public validate |
| Abandoned Carts | `/api/abandoned-carts` | GET |
| Settings | `/api/settings`, `/api/branding`, `/api/themes` | GET/POST |

### Stripe Connect
| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/stripe/connect` | List / create Connect accounts |
| GET/DELETE | `/api/stripe/connect/[accountId]` | Get / delete account |
| GET/POST | `/api/stripe/connect/[accountId]/onboarding` | Onboarding link / session |
| GET/POST | `/api/stripe/apple-pay-domain` | List / register domains |
| GET | `/api/stripe/apple-pay-verify` | Serve Apple Pay verification file |

### Reps Program (35 routes)
**Admin routes** (`/api/reps/*`, 19 routes): CRUD for reps, event assignments, quests, quest submissions, rewards, milestones, reward claims, leaderboard, stats, settings, invite.

**Rep portal routes** (`/api/rep-portal/*`, 16 routes): signup, login, logout, verify-email, invite/[token], me, dashboard, sales, points, quests, quest submissions, rewards, reward claims, leaderboard, discount.

### Admin & Utilities
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/admin/dashboard` | Dashboard KPI data |
| GET | `/api/admin/orders-stats` | Order statistics |
| POST/GET | `/api/auth/login`, `logout`, `recover` | Admin authentication |
| POST | `/api/track` | Traffic/popup analytics |
| POST | `/api/meta/capi` | Meta Conversions API |
| POST | `/api/upload` | Image upload (base64 → media key) |
| GET | `/api/media/[key]` | Serve uploaded images |
| POST | `/api/email/test` | Send test email |
| GET | `/api/email/status` | Email delivery status |
| GET | `/api/wallet/status` | Wallet pass config status |
| GET | `/api/health` | System health checks |

---

## Hooks (Patterns & Rules)

### Referential Stability (CRITICAL)
Hooks that return objects/functions consumed as `useEffect`/`useCallback` dependencies MUST use `useMemo` to return a stable reference. Without this, every re-render creates a new object, causing all dependent effects to re-fire.

**Hooks with stable refs (do NOT break this):**
- `useMetaTracking()` — returns `useMemo({ trackPageView, trackViewContent, ... })`
- `useDataLayer()` — returns `useMemo({ push, trackViewContent, trackAddToCart, ... })`
- `useSettings()` — context value wrapped in `useMemo`
- `useBranding()` — returns `useMemo(branding)` with module-level cache
- `useDashboardRealtime()` — returns `useMemo(dashboardState)`

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
NEXT_PUBLIC_SUPABASE_URL            # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY       # Supabase anonymous key
SUPABASE_SERVICE_ROLE_KEY           # Supabase service role key (bypasses RLS — used by getSupabaseAdmin())
```

### Required for Payments
```
STRIPE_SECRET_KEY                   # Stripe secret key (server-side only)
STRIPE_WEBHOOK_SECRET               # Stripe webhook signature verification
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  # Stripe public key (client-side)
```

### Required for Full Selling Path
```
RESEND_API_KEY                      # Resend API key (order confirmation emails + PDF attachments)
NEXT_PUBLIC_SITE_URL                # Site URL (used in emails, PDFs, wallet passes, CAPI)
```

### Optional — Analytics
```
NEXT_PUBLIC_GTM_ID                  # Google Tag Manager container ID (has hardcoded fallback)
NEXT_PUBLIC_KLAVIYO_LIST_ID         # Klaviyo email list ID (has hardcoded fallback)
NEXT_PUBLIC_KLAVIYO_COMPANY_ID      # Klaviyo company ID (has hardcoded fallback)
```

### Optional — Wallet Passes
```
APPLE_PASS_CERTIFICATE              # Apple pass signing certificate (PEM)
APPLE_PASS_CERTIFICATE_PASSWORD     # Certificate password
APPLE_WWDR_CERTIFICATE              # Apple WWDR certificate
APPLE_PASS_TYPE_IDENTIFIER          # Pass type ID
APPLE_PASS_TEAM_IDENTIFIER          # Apple team ID
GOOGLE_WALLET_SERVICE_ACCOUNT_KEY   # Google service account key (JSON)
GOOGLE_WALLET_ISSUER_ID             # Google Wallet issuer ID
```

---

## Testing

### Setup
- **Framework**: Vitest + @testing-library/react (jsdom)
- **Config**: `vitest.config.ts` — path aliases, jsdom, setup file
- **Setup**: `src/__tests__/setup.ts` — localStorage mock, crypto.randomUUID mock, jest-dom
- **Run**: `npm test` (single run) or `npm run test:watch` (watch mode)

### Test Suites (11 suites)
- `auth` — requireAuth, requireRepAuth, session handling, middleware auth
- `useMetaTracking` — referential stability, consent gating, API shape
- `useDataLayer` — referential stability, event pushing, tracking helpers
- `useDashboardRealtime` — realtime state management
- `useTraffic` — funnel tracking
- `wallet-passes` — Apple Wallet, Google Wallet, configuration checks
- `products` — product CRUD, type validation
- `orders` — order creation, validation
- `rate-limit` — rate limiter behavior
- `rep-deletion` — rep cascade deletion
- `vat` — VAT calculation

### Rules for Writing Tests
1. Every new hook must have a test file — `src/__tests__/useHookName.test.ts`
2. Every new API route should have a test file — `src/__tests__/api/routeName.test.ts`
3. Referential stability tests are mandatory for hooks returning objects/functions used in effect dependencies
4. Test what matters — state logic, referential stability, API shape, edge cases, payment flows
5. Don't test — pure UI rendering, CSS classes, static text
6. Tests must pass before committing — run `npm test` and fix failures

---

## Known Gaps
1. **Scanner PWA** — API endpoints exist (`/api/tickets/[code]` + `/api/tickets/[code]/scan`) but no frontend
2. **Multi-tenant promoter dashboard** — Stripe Connect is built, but no separate promoter-facing dashboard yet
3. **Google Ads + TikTok tracking** — placeholders exist in marketing admin but no implementation
4. **Supabase RLS policies** — should be configured to enforce org_id isolation at database level

---

## Design System

### Platform Brand (Entry — Admin)
- **Primary**: `#8B5CF6` (Electric Violet)
- **Gradient**: `linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)`
- The Entry wordmark, login page, admin buttons, and active states all use Electric Violet

### Public Event Pages (Tenant-Configurable)
Defaults defined in `base.css :root`, overridable per-tenant via branding system:
```css
--accent: #ff0033;        --bg-dark: #0e0e0e;       --card-bg: #1a1a1a;
--card-border: #2a2a2a;   --text-primary: #fff;      --text-secondary: #888;
--text-muted: #555;       --font-mono: 'Space Mono'; --font-sans: 'Inter';
```
- **Effects**: CRT scanlines, noise texture overlays, glitch animations
- **Mobile-first**: Most ticket buyers are on phones

---

## CSS Architecture

### Two Separate CSS Worlds (CRITICAL)
| Area | CSS System | Entry Point |
|------|-----------|-------------|
| Public site (events, checkout, landing) | Hand-written CSS (`base.css`, `event.css`, etc.) | `app/layout.tsx` |
| Admin dashboard (`/admin/*`) | Tailwind v4 + shadcn/ui utilities | `app/admin/layout.tsx` via `tailwind.css` |

**Isolation mechanism**: Admin layout renders `<div data-admin>`. All Tailwind preflight resets are scoped to `[data-admin]` via `@layer admin-reset` so they never affect public pages.

### CSS Cascade Layer Rules (DO NOT BREAK)
```css
@layer theme, admin-reset;
@import "tailwindcss/theme" layer(theme);
@import "tailwindcss/utilities";               /* UNLAYERED — intentional! */
```

**Why utilities are unlayered**: `base.css` has an unlayered `* { margin: 0; padding: 0; }`. Unlayered styles always beat layered styles. If Tailwind utilities were layered, that `*` reset would override every `p-4`, `m-2`, `gap-3` class. By keeping utilities unlayered, they win on specificity (class > universal selector).

**NEVER**:
- Add `layer(utilities)` to the Tailwind utilities import
- Move the utilities import into any `@layer` block
- Add a global `*` reset that could override Tailwind classes

### CSS File Organization
| File | Scope |
|------|-------|
| `base.css` | Global — reset, CSS variables, typography, reveal animations |
| `effects.css` | Global — CRT scanlines + noise overlays |
| `cookie.css` | Global — consent banner |
| `header.css` | Header, navigation, mobile menu |
| `landing.css` | Hero, events grid, about pillars, contact form |
| `event.css` | Event pages, tickets, modals, bottom bar, minimal theme |
| `aura.css` | Aura theme styles |
| `aura-effects.css` | Aura theme effects |
| `checkout-page.css` | Checkout + payment form |
| `popup.css` | Discount popup |
| `rep-portal.css` | Rep portal styles |
| `tailwind.css` | Tailwind v4 theme + utilities (admin only) |
| `admin.css` | Admin supplementary styles |

### Rules for New CSS (Public Site)
1. **Component-level imports** — new components import their own CSS file
2. **BEM naming** — `.block__element--modifier`
3. **Use CSS custom properties** from `base.css :root` for all colors, fonts, spacing
4. **No Tailwind on public pages** — public site uses hand-written CSS only
5. **Breakpoints**: `1024px` (tablet), `768px` (portrait), `480px` (phone)

---

## Admin UI Stack (Tailwind + shadcn/ui)

### shadcn/ui Components
**Location**: `src/components/ui/*.tsx` (27 components)

Alert, Avatar, Badge, Button, Calendar, Card, Collapsible, ColorPicker, DatePicker, Dialog, Input, Label, LiveIndicator, LiveStatCard, NativeSelect, Popover, Progress, Select, Separator, Slider, StatCard, Switch, Table, Tabs, Textarea, Tooltip, TrendBadge

**How to add new shadcn components**:
1. Create in `src/components/ui/` following the pattern below
2. Use Radix UI primitives from the `radix-ui` package (already installed)
3. Use `cn()` from `@/lib/utils` for className merging

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

function ComponentName({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("base-classes", className)} {...props} />;
}
export { ComponentName };
```

### Admin Design Tokens
Defined in `tailwind.css` via `@theme inline {}`:

| Token | Value | Usage |
|-------|-------|-------|
| `--color-background` | `#08080c` | Page background |
| `--color-foreground` | `#f0f0f5` | Primary text |
| `--color-primary` | `#8B5CF6` | Electric Violet — brand / accent |
| `--color-card` | `#111117` | Card backgrounds |
| `--color-secondary` | `#151520` | Nested surfaces inside cards |
| `--color-muted-foreground` | `#8888a0` | Secondary text |
| `--color-border` | `#1e1e2a` | Borders (purple-tinted) |
| `--color-destructive` | `#F43F5E` | Danger / delete actions |
| `--color-success` | `#34D399` | Success states |
| `--color-warning` | `#FBBF24` | Warning states |
| `--color-info` | `#38BDF8` | Info states |
| `--color-sidebar` | `#0a0a10` | Sidebar background |
| `--color-sidebar-foreground` | `#8888a0` | Sidebar text |
| `--color-sidebar-accent` | `#141420` | Sidebar active item |
| `--color-sidebar-border` | `#161624` | Sidebar borders |

Use via Tailwind classes (`bg-background`, `text-foreground`, `border-border`, etc.) — never hardcode hex values.

Custom utilities: `.glow-primary`, `.glow-success`, `.glow-warning`, `.glow-destructive`, `.text-gradient`, `.surface-noise`

### Rules for New Admin Pages
1. **Always `"use client"`** — admin pages use React state, effects, and browser APIs
2. **Use shadcn components** — never recreate Button, Input, Card, Tabs, etc.
3. **Use Tailwind classes** — all styling via utility classes, no hand-written CSS
4. **Use design tokens** — `bg-background`, `text-foreground`, `border-border`, etc.
5. **Settings pattern** — fetch from `site_settings` table, save back via `/api/settings`
6. **File uploads** — POST base64 to `/api/upload`, get back a media key
