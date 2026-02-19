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
| UI Primitives | Tailwind CSS v4 + shadcn/ui (Radix UI) | 4.x |
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
│   │   ├── page.tsx           # Routes to MidnightEventPage (default) or AuraEventPage
│   │   ├── checkout/page.tsx  # NativeCheckout (Stripe Elements)
│   │   ├── error.tsx          # Error boundary
│   │   └── loading.tsx        # Loading skeleton
│   ├── admin/                 # Admin dashboard (25+ pages: events, orders, customers, guest-list,
│   │                          # merch, discounts, abandoned-carts, reps, ticketstore, finance,
│   │                          # traffic, popup, payments, connect, marketing, communications,
│   │                          # settings, health). Layout: sidebar + Entry-branded shell
│   └── api/                   # API routes — see API Routes section for full list
├── components/
│   ├── admin/                 # Admin reusable: ImageUpload, LineupTagInput, ArtistLineupEditor, TierSelector
│   │   ├── event-editor/      # Tabbed event editor (Details, Content, Design, Tickets, Settings)
│   │   └── dashboard/         # ActivityFeed, FunnelChart, TopEventsTable
│   ├── aura/                  # Aura theme (DORMANT — not in active use, future consideration)
│   ├── midnight/              # Midnight theme (default, active): MidnightEventPage, MidnightHero,
│   │                          # MidnightTicketWidget, MidnightTicketCard, MidnightMerchModal,
│   │                          # MidnightEventInfo, MidnightLineup, MidnightCartSummary,
│   │                          # MidnightCartToast, MidnightSizeSelector, MidnightTierProgression,
│   │                          # MidnightFooter, MidnightArtistModal, MidnightSocialProof,
│   │                          # MidnightFloatingHearts, tier-styles.ts (tier gradient helpers)
│   ├── event/                 # Shared: DiscountPopup, EngagementTracker, ThemeEditorBridge,
│   │                          # BottomBar (shared mobile CTA bar, used by Midnight),
│   │                          # KompassEventPage (legacy). Old BEM components retained but no longer routed
│   ├── checkout/              # NativeCheckout, StripePaymentForm, ExpressCheckout,
│   │                          # OrderConfirmation, OrderSummary, CheckoutTimer, LoadingScreen
│   ├── landing/               # LandingPage, HeroSection, ParticleCanvas, EventsSection, etc.
│   ├── layout/                # Header, Footer, Scanlines, CookieConsent
│   └── ui/                    # shadcn/ui (28 components — see Admin UI section)
├── hooks/
│   ├── useBranding.ts         # Org branding (module-level cache, single fetch)
│   ├── useSettings.tsx        # Settings context + realtime subscription
│   ├── useDashboardRealtime.ts # Dashboard live updates
│   ├── useMetaTracking.ts     # Meta Pixel + CAPI (consent-aware, stable refs)
│   ├── useDataLayer.ts        # GTM dataLayer push (stable refs)
│   ├── useTraffic.ts          # Supabase funnel tracking
│   ├── useCart.ts              # Cart state: quantities, merch sizes, totals, checkout redirect
│   ├── useEventTracking.ts    # Unified event tracking: Meta + GTM + CAPI + traffic (stable refs)
│   ├── useHeaderScroll.ts     # Header hide/show on scroll
│   └── useScrollReveal.ts     # IntersectionObserver scroll animations
├── lib/
│   ├── supabase/              # admin.ts (data), server.ts (auth only), client.ts (browser), middleware.ts
│   ├── stripe/                # client.ts (browser), server.ts (platform), config.ts (fees/currency)
│   ├── auth.ts                # requireAuth(), requireRepAuth(), getSession()
│   ├── constants.ts           # ORG_ID, TABLES, SETTINGS_KEYS, brandingKey(), abandonedCartAutomationKey()
│   ├── settings.ts            # fetchSettings (server), saveSettings (client)
│   ├── orders.ts, email.ts, email-templates.ts  # Order creation + email (Resend)
│   ├── pdf.ts, qr.ts, ticket-utils.ts, wallet-passes.ts  # Ticket delivery (PDF, QR, Apple/Google Wallet)
│   ├── discount-codes.ts, vat.ts, rate-limit.ts  # Pricing + security
│   ├── themes.ts              # Theme system helpers (getActiveTemplate, etc.)
│   ├── checkout-guards.ts     # Checkout validation + guards
│   ├── date-utils.ts, image-utils.ts, nicknames.ts  # Shared utilities
│   ├── merch-images.ts        # Merch image normalization (normalizeMerchImages, hasMerchImages)
│   ├── mux.ts                 # Mux video API helpers
│   ├── rep-*.ts               # Rep program: attribution, emails, points, notifications
│   ├── klaviyo.ts, meta.ts    # Marketing integrations
│   └── utils.ts               # cn() helper (clsx + tailwind-merge)
├── types/                     # TypeScript types per domain (settings, events, artists, orders, tickets,
│                              # products, discounts, reps, email, analytics, marketing)
└── styles/
    ├── base.css               # Reset, CSS variables, typography, reveal animations
    ├── effects.css            # CRT scanlines + noise texture overlays
    ├── header.css             # Header, navigation, mobile menu
    ├── landing.css            # Hero, events grid, about pillars, contact form
    ├── event.css              # Legacy: KompassEventPage + minimal theme only
    ├── midnight.css           # Midnight theme: Tailwind v4 tokens + scoped reset
    ├── midnight-effects.css   # Midnight effects: glass, metallic tiers, keyframes
    ├── aura.css               # Aura theme styles (dormant)
    ├── aura-effects.css       # Aura theme effects (dormant)
    ├── cookie.css             # Cookie consent banner
    ├── popup.css              # Discount popup
    ├── rep-portal.css         # Rep portal: legacy hybrid CSS (2,600+ lines, needs modernization)
    ├── tailwind.css           # Tailwind v4 theme + utilities (admin only)
    └── admin.css              # Admin supplementary styles
```

---

## Architecture

### Payment System (Stripe)
All events use Stripe for payment processing:
- Dynamic event pages (`MidnightEventPage` / `AuraEventPage`) rendered from `events` table
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
  → template === "midnight" → MidnightEventPage / NativeCheckout (default, active)
  → template === "aura"    → AuraEventPage / AuraCheckout (dormant — code exists but not in use)
```

- Default and only active template: `midnight` (falls back if no theme configured)
- Aura theme is dormant — fully built but not in active use. Future plan: allow color customization within Midnight rather than separate themes
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
| `{org_id}_abandoned_cart_automation` | Abandoned cart email automation config — `abandonedCartAutomationKey()` |
| `feral_marketing` | Meta Pixel + CAPI settings |
| `feral_email` | Email template settings |
| `feral_wallet_passes` | Wallet pass configuration |
| `feral_events_list` | Events list configuration |
| `feral_stripe_account` | Global Stripe Connect account (fallback) |
| `feral_pdf_ticket` | PDF ticket design settings (`PdfTicketSettings` in `types/email.ts`) |
| `feral_event_{slug}` | Dynamic per-event settings (e.g. `feral_event_liverpool`) — pattern, not a single key |

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
  └─ template === "midnight" → MidnightEventPage (default)
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

**Public API routes (no auth):** Stripe (`payment-intent`, `confirm-order`, `webhook`, `account`, `apple-pay-verify`), `checkout/capture`, `GET events|settings|merch|branding|themes|media/[key]|health`, `POST track|meta/capi|discounts/validate`, `/api/cron/*` (CRON_SECRET), `/api/unsubscribe` (token), `orders/[id]/wallet/*` (UUID), rep public auth routes, `auth/*`.

**Security headers**: `nosniff`, `SAMEORIGIN`, `XSS-Protection`, HSTS (production), strict-origin referrer, restrictive permissions policy.

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
| `abandoned_carts` | Checkout abandonment + recovery | customer_id, event_id, email, first_name, items (jsonb), subtotal, currency, status (abandoned/recovered/expired), notification_count, notified_at, cart_token (UUID), recovered_at, recovered_order_id, unsubscribed_at |
| `artists` | Reusable artist catalog per org | name, description, instagram_handle, image |
| `event_artists` | Event↔Artist junction (many-to-many, ordered) | event_id (FK→events, CASCADE), artist_id (FK→artists, CASCADE), sort_order, UNIQUE(event_id, artist_id) |
| `traffic_events` | Funnel tracking | event_type, page_path, session_id, referrer, utm_* |
| `popup_events` | Popup interaction tracking | event_type (impressions, engaged, conversions, dismissed) |

**Reps Program tables** (10 tables): `reps`, `rep_events`, `rep_rewards`, `rep_milestones`, `rep_points_log`, `rep_quests`, `rep_quest_submissions`, `rep_reward_claims`, `rep_event_position_rewards`, `rep_notifications`. All have `org_id`. See `src/types/reps.ts` for full column types.

### Key Constraints
- `orders.order_number` — unique, format `FERAL-XXXXX` (sequential, padded)
- `tickets.ticket_code` — unique, format `FERAL-XXXXXXXX` (random, crypto-safe)
- `orders.payment_ref` — used for idempotency (Stripe PaymentIntent ID)
- `products.product_id` on `ticket_types` — FK to `products` table (ON DELETE SET NULL)
- All tables have `org_id` column
- `reps` table has `email_verified` (bool) and `email_verification_token` (text) columns for rep email verification flow

### PostgreSQL RPCs (Database Functions)
| Function | Purpose |
|----------|---------|
| `claim_reward_atomic(rep_id, reward_id, points_cost)` | Atomic reward claiming — deducts points + creates claim in one transaction |
| `reverse_rep_attribution(order_id)` | Reverses rep points/sales when an order is refunded |
| `get_rep_program_stats(org_id)` | Aggregate stats for the rep program (total reps, active, points issued, etc.) |

### Supabase Client Rules (CRITICAL — Data Access)
Using the wrong client causes silent data loss (empty arrays instead of errors when RLS blocks).

| Client | File | When to Use |
|--------|------|-------------|
| `getSupabaseAdmin()` | `lib/supabase/admin.ts` | **ALL data queries** — API routes, server components, lib. Service role key (bypasses RLS). |
| `getSupabaseServer()` | `lib/supabase/server.ts` | **Auth ONLY** — `requireAuth()`, `requireRepAuth()`, `getSession()`, login/logout. |
| `getSupabaseClient()` | `lib/supabase/client.ts` | **Browser-side only** — realtime subscriptions, client reads. Subject to RLS. |

**Rules:** Use `getSupabaseAdmin()` for all data queries. Use `getSupabaseServer()` only for auth. Never create raw `createClient()` with anon key server-side. Add new tables to health check. Show API errors in admin pages.

### External Service Changes Rule (CRITICAL)
Claude has MCP access to **Supabase** and **Vercel**. Use MCP tools directly — **NEVER** give the user SQL to run manually or tell them to go to dashboards. Always execute migrations and queries via MCP yourself.

**If Supabase or Vercel MCP token has expired**, do NOT fall back to giving the user raw SQL or manual instructions. Instead, stop and display a highly visible reconnection prompt:

```
## ⚠️  SUPABASE MCP DISCONNECTED

Run /mcp in this terminal to re-authorize, then I'll continue.
```

**Stripe** has no MCP — tell user to use dashboard or provide copy-paste instructions.

**Rules:** Never hardcode secrets. Document changes in this file. Never assume a table/column exists unless documented here. Never give the user SQL to run — that's Claude's job via MCP.

---

## API Routes (~105 route files)

### Critical Path (Payment → Order)
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/stripe/payment-intent` | Create PaymentIntent (validates tickets, applies discounts + VAT, rate limited) |
| POST | `/api/stripe/confirm-order` | Verify payment → create order + tickets + email confirmation |
| POST | `/api/checkout/capture` | Upsert customer + abandoned cart on checkout email capture |
| POST | `/api/stripe/webhook` | Handle payment_intent.succeeded / failed |
| GET | `/api/stripe/account` | Get connected Stripe account ID for checkout |

### Orders & Tickets
`/api/orders` (GET list, POST create), `/api/orders/[id]` (GET detail), `/api/orders/[id]/refund` (POST), `/api/orders/[id]/resend-email` (POST), `/api/orders/[id]/pdf` (GET), `/api/orders/[id]/wallet/apple|google` (GET), `/api/orders/export` (GET CSV), `/api/tickets/[code]` (GET validate), `/api/tickets/[code]/scan` (POST), `/api/tickets/[code]/merch` (GET)

### Standard CRUD Groups
| Group | Routes | Operations |
|-------|--------|------------|
| Events | `/api/events`, `/api/events/[id]`, `/api/events/[id]/artists` | GET/POST/PUT/DELETE + ticket types + artist lineup |
| Artists | `/api/artists`, `/api/artists/[id]` | GET (list + search)/POST/PUT/DELETE |
| Merch | `/api/merch`, `/api/merch/[id]`, `/api/merch/[id]/linked-tickets` | GET/POST/PUT/DELETE |
| Customers | `/api/customers` | GET (list + search) |
| Guest List | `/api/guest-list`, `/api/guest-list/[eventId]` | POST/GET/PUT/DELETE |
| Discounts | `/api/discounts`, `/api/discounts/[id]`, `/api/discounts/validate`, `/api/discounts/seed` | GET/POST/PUT/DELETE + public validate |
| Abandoned Carts | `/api/abandoned-carts`, `/api/abandoned-carts/preview-email` | GET (list + stats, email HTML preview) |
| Settings | `/api/settings`, `/api/branding`, `/api/themes` | GET/POST |

### Other Route Groups
- **Abandoned Cart Recovery**: `/api/abandoned-carts` (list + stats), `/api/abandoned-carts/preview-email`, `/api/cron/abandoned-carts` (Vercel cron), `/api/unsubscribe`
- **Stripe Connect**: `/api/stripe/connect` (CRUD), `/api/stripe/connect/[accountId]/onboarding`, `/api/stripe/apple-pay-domain`, `/api/stripe/apple-pay-verify`
- **Reps Program**: `/api/reps/*` (admin routes — CRUD for reps, events, quests, rewards, milestones, leaderboard, claims, stats, settings), `/api/rep-portal/*` (rep-facing routes — auth, auth-check, verify-email, signup, login, logout, dashboard, sales, quests, submissions, rewards, claims, leaderboard, notifications, profile, discount, upload, invite/[token])
- **Video (Mux)**: `/api/upload-video` (POST — signed Supabase upload URL), `/api/mux/upload` (POST — create Mux asset from URL), `/api/mux/status` (GET — poll asset processing status). Flow: browser→Supabase Storage (signed URL) → Mux ingests server-to-server → poll until ready → store playback ID
- **Admin & Utilities**: `/api/admin/dashboard`, `/api/admin/orders-stats`, `/api/auth/*` (login, logout, recover), `/api/track`, `/api/meta/capi`, `/api/upload`, `/api/media/[key]`, `/api/email/*` (test, status), `/api/wallet/status`, `/api/health`

---

## Hooks (Patterns & Rules)

### Referential Stability (CRITICAL)
Hooks that return objects/functions consumed as `useEffect`/`useCallback` dependencies MUST use `useMemo` to return a stable reference. Without this, every re-render creates a new object, causing all dependent effects to re-fire.

**Hooks with stable refs (do NOT break this):**
- `useMetaTracking()` — returns `useMemo({ trackPageView, trackViewContent, ... })`
- `useDataLayer()` — returns `useMemo({ push, trackViewContent, trackAddToCart, ... })`
- `useEventTracking()` — returns `useMemo({ trackPageView, trackViewContent, trackAddToCart, ... })` (unified facade over Meta + GTM + CAPI + traffic)
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
Checks `feral_cookie_consent` in localStorage for `marketing: true`. Listens for consent changes via `storage` event (cross-tab) and `feral_consent_update` custom event (same-tab, dispatched by `CookieConsent.tsx`). Pixel only loads after consent.

### Module-Level State (`useMetaTracking`, `useBranding`)
Both hooks persist state at module scope — `_settings`, `_fetchPromise`, `_pixelLoaded`, `_cachedBranding`. Single fetch shared across all instances. Tests must account for this — module state doesn't reset between test cases.

---

## Environment Variables

**Required**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)
**Payments**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
**Selling path**: `RESEND_API_KEY` (emails), `NEXT_PUBLIC_SITE_URL` (used in emails, PDFs, CAPI)
**Video**: `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` (Mux API credentials for video upload/processing — graceful degradation if missing, upload returns 503)
**Cron**: `CRON_SECRET` (Vercel cron auth, set automatically)
**Optional**: `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_KLAVIYO_LIST_ID`, `NEXT_PUBLIC_KLAVIYO_COMPANY_ID` (all have fallbacks)
**URL fallback chain** (for emails, PDFs, wallet passes): `NEXT_PUBLIC_SITE_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` → `localhost:3000`
**Wallet passes**: `APPLE_PASS_CERTIFICATE`, `APPLE_PASS_CERTIFICATE_PASSWORD`, `APPLE_WWDR_CERTIFICATE`, `APPLE_PASS_TYPE_IDENTIFIER`, `APPLE_PASS_TEAM_IDENTIFIER`, `GOOGLE_WALLET_SERVICE_ACCOUNT_KEY`, `GOOGLE_WALLET_ISSUER_ID`

---

## Testing

### Setup
- **Framework**: Vitest + @testing-library/react (jsdom)
- **Config**: `vitest.config.ts` — path aliases, jsdom, setup file
- **Setup**: `src/__tests__/setup.ts` — localStorage mock, crypto.randomUUID mock, jest-dom
- **Run**: `npm test` (single run) or `npm run test:watch` (watch mode)

### Test Suites (12 suites)
`auth`, `useMetaTracking`, `useDataLayer`, `useDashboardRealtime`, `useTraffic`, `wallet-passes`, `products`, `orders`, `rate-limit`, `rep-deletion`, `vat`, `merch-images`

### Rules for Writing Tests
1. Every new hook must have a test file — `src/__tests__/useHookName.test.ts`
2. Every new API route should have a test file — `src/__tests__/api/routeName.test.ts`
3. Referential stability tests are mandatory for hooks returning objects/functions used in effect dependencies
4. Test what matters — state logic, referential stability, API shape, edge cases, payment flows
5. Don't test — pure UI rendering, CSS classes, static text
6. Tests must pass before committing — run `npm test` and fix failures

---

## Known Gaps
1. **Rep portal CSS modernization** — Hybrid of shadcn + hand-written CSS + inline styles. Needs rebuild to pure Tailwind + shadcn
2. **Scanner PWA** — API endpoints exist (`/api/tickets/[code]` + `/api/tickets/[code]/scan`) but no frontend
3. **Multi-tenant promoter dashboard** — Stripe Connect is built, but no separate promoter-facing dashboard yet
4. **Google Ads + TikTok tracking** — placeholders exist in marketing admin but no implementation
5. **Supabase RLS policies** — should enforce org_id isolation at database level
6. **Aura theme dormant** — Fully built (16 components) but not in active use. Future direction: color customization within Midnight rather than separate themes

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
Each theme's `{theme}.css` maps these to Tailwind semantic tokens (`--color-primary`, `--color-background`, `--color-card`, etc.) so Tailwind classes like `bg-background`, `text-primary`, `border-border` automatically reflect tenant branding.

- **Midnight visual identity** (active): Cyberpunk — glassmorphism (`backdrop-filter: blur`), metallic tier gradients (platinum shimmer, obsidian silver, valentine pink), CRT suppression, red glow accents
- **Aura visual identity** (dormant): Clean, modern — rounded cards, soft shadows, minimal animation, purple-tinted neutrals
- **Mobile-first**: Most ticket buyers are on phones — design for 375px, enhance up

---

## CSS Architecture

### CSS Areas
| Area | CSS System | Entry Point |
|------|-----------|-------------|
| Public site (landing, legacy) | Hand-written CSS (`base.css`, `header.css`) | `app/layout.tsx` |
| Event pages: Midnight (active) | Tailwind v4 + effects layer (`midnight.css`, `midnight-effects.css`) | Imported by `MidnightEventPage` |
| Event pages: Aura (dormant) | Tailwind v4 (`aura.css`, `aura-effects.css`) | Imported by `AuraEventPage` |
| Admin dashboard (`/admin/*`) | Tailwind v4 + shadcn/ui utilities | `app/admin/layout.tsx` via `tailwind.css` |

**Isolation mechanism**: Admin layout renders `<div data-admin>`. All Tailwind preflight resets are scoped to `[data-admin]` via `@layer admin-reset` so they never affect public pages. Event themes are scoped via `[data-theme="themename"]` on the layout wrapper div.

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

### Rules for New CSS
1. **Component-level imports** — new components import their own CSS file
2. **Use CSS custom properties** from `base.css :root` for all colors, fonts, spacing
3. **Event themes use Tailwind + Radix** — All event page themes (Midnight, Aura, future themes) use Tailwind for layout/spacing/responsive, Radix UI primitives (via shadcn/ui) for interactive elements (Dialog, Tabs, etc.), and optional theme-specific CSS for visual effects. Each theme is scoped via `[data-theme="themename"]`.
4. **Landing/legacy pages** — Hand-written BEM CSS only (`base.css`, `header.css`, `landing.css`)
5. **Breakpoints**: `1024px` (tablet), `768px` (portrait), `480px` (phone)

---

## Midnight Theme Architecture (Active Event UI)

Event pages are the revenue-generating surface. **Midnight is the only active theme.** Aura exists as dormant code (16 components in `src/components/aura/`) but is not in use. Future direction: color customization within Midnight rather than adding more themes.

### Midnight Component Structure
All in `src/components/midnight/`. `MidnightEventPage` is the orchestrator — it imports `midnight.css` + `midnight-effects.css` and composes all child components. The shared `BottomBar` lives in `components/event/BottomBar.tsx`.

### Rules for Midnight Components
1. **Tailwind for layout** — all spacing, responsive, grid, flex via utility classes
2. **shadcn/ui for interactive elements** — Dialog, Button, Card, Badge, Separator. Never build custom overlays from scratch
3. **Effects in `midnight-effects.css`** — glassmorphism, metallic gradients, animations. Applied via `cn()`. Keep layout and visual identity separate
4. **Scoped to `[data-theme="midnight"]`** — never leak styles. Token mapping in `midnight.css` via `@theme inline {}`
5. **Mobile-first** — design for 375px, enhance up. BottomBar for mobile CTA
6. **Shared hooks** — `useCart()`, `useEventTracking()`, `useSettings()`, `useBranding()`, `useHeaderScroll()`
7. **Shared components** — `DiscountPopup`, `EngagementTracker`, `ExpressCheckout`, `Header`, `BottomBar` are theme-agnostic
8. **CSS imports at orchestrator level only** — child components don't import CSS

### Theme Design Tokens Flow
```
base.css :root (--accent, --bg-dark, --card-bg, --text-primary, --font-mono, --font-sans)
  ↓ overridden by server-injected branding CSS vars (event layout.tsx)
  ↓ consumed by midnight.css @theme inline {} mapping to Tailwind tokens
  ↓ available as Tailwind classes: bg-background, text-foreground, text-primary, border-border
  ↓ midnight-effects.css uses var() directly for animations/gradients
```

Change the accent color in admin branding → every Midnight component updates automatically. Pure CSS cascade — no prop drilling, no re-renders.

---

## Rep Portal Architecture (Social App)

The rep portal (`/rep/*`) is the brand ambassador / street team app. It will evolve into a full social platform. Has its own layout, auth system (`requireRepAuth()`), and API routes (`/api/rep-portal/*`).

### Current State (Needs Modernization)
Hybrid CSS: ~70% shadcn/ui + `rep-portal.css` (2,600+ lines of `.rep-*` BEM classes scoped to `[data-rep]`) + inline styles. Has its own `--rep-*` CSS variables that duplicate admin Tailwind tokens. **Target**: pure Tailwind + shadcn/ui (admin dashboard pattern), gaming effects extracted to `rep-effects.css`.

### Rep Portal Pages
| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/rep` | Hero card, stats gauges, XP bar, discount weapon, quick actions |
| Sales | `/rep/sales` | Sales history, revenue gauges, event breakdown |
| Quests | `/rep/quests` | Task cards (social_post, story_share, content_creation), proof submission |
| Rewards | `/rep/rewards` | Milestones, points shop, reward claims |
| Points | `/rep/points` | Points ledger, balance history |
| Leaderboard | `/rep/leaderboard` | Per-event and global rankings |
| Profile | `/rep/profile` | Own profile. `/rep/profile/[id]` for viewing other reps |
| Verify Email | `/rep/verify-email` | Email verification flow for new reps |
| Accept Invite | `/rep/invite/[token]` | Accept admin invitation via token |
| Login/Join | `/rep/login`, `/rep/join` | Auth (separate from admin) |

### Rules for New Rep Portal Pages
1. **Use shadcn/ui** — Card, Button, Badge, Input, Progress, Skeleton, Dialog, Tabs. No custom overlays
2. **Use Tailwind classes** — no new `.rep-*` CSS classes, no inline `style={{}}`
3. **Use admin design tokens** — `bg-background`, `text-foreground`, `border-border`. Do NOT create new `--rep-*` CSS variables
4. **Mobile-first** — reps use their phones. Design for 375px, enhance up
5. **Auth**: All pages use `requireRepAuth()`. Layout handles unverified email and pending review gates

---

## Shared UI Primitives (shadcn/ui)

### shadcn/ui Components
**Location**: `src/components/ui/*.tsx` (28 components) — used by admin pages AND event themes

Alert, Avatar, Badge, Button, Calendar, Card, Collapsible, ColorPicker, DatePicker, Dialog, Input, Label, LiveIndicator, LiveStatCard, NativeSelect, Popover, Progress, Select, Separator, Skeleton, Slider, StatCard, Switch, Table, Tabs, Textarea, Tooltip, TrendBadge

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
Defined in `tailwind.css` via `@theme inline {}`. Key tokens: `background` (#08080c), `foreground` (#f0f0f5), `primary` (#8B5CF6 Electric Violet), `card` (#111117), `secondary` (#151520), `muted-foreground` (#8888a0), `border` (#1e1e2a), `destructive` (#F43F5E), `success` (#34D399), `warning` (#FBBF24), `info` (#38BDF8). Sidebar variants: `sidebar` (#0a0a10), `sidebar-foreground` (#8888a0), `sidebar-accent` (#141420), `sidebar-border` (#161624).

Use via Tailwind classes (`bg-background`, `text-foreground`, `border-border`, etc.) — never hardcode hex values. Custom utilities: `.glow-primary`, `.glow-success`, `.glow-warning`, `.glow-destructive`, `.text-gradient`, `.surface-noise`

### Rules for New Admin Pages
1. **Always `"use client"`** — admin pages use React state, effects, and browser APIs
2. **Use shadcn components** — never recreate Button, Input, Card, Tabs, etc.
3. **Use Tailwind classes** — all styling via utility classes, no hand-written CSS
4. **Use design tokens** — `bg-background`, `text-foreground`, `border-border`, etc.
5. **Settings pattern** — fetch from `site_settings` table, save back via `/api/settings`
6. **File uploads** — POST base64 to `/api/upload`, get back a media key

---

## Document Maintenance

1. **Read this file fully at the start of every session** — it is the single source of truth for the platform architecture
2. **Update it after any architecture change**, new module, new database table, or new API route group
3. **Delete deprecated references immediately** — never leave dead code documented
4. **Keep it under 40K characters** — if approaching the limit, compress verbose sections rather than removing useful information
5. **Scale detail to complexity** — simple things get one line, complex systems get diagrams or tables
6. **This file is the map.** If something isn't documented here, Claude won't know it exists. If something is documented wrong, Claude will build on broken assumptions
