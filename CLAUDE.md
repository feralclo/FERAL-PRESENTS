# Entry — Platform Context

## Mission
Entry is a white-label events and ticketing platform ("Shopify for Events"). Today it powers FERAL's events; the goal is any promoter can sell tickets/merch under their own brand, platform takes a fee.

Every database query filters by `org_id`. Every feature must work for promoters who aren't FERAL.

**Status:** Controlled beta (`BETA_MODE = true` in `lib/beta.ts`). Promoters apply via invite codes → onboarding wizard → admin dashboard. Queued workstreams: multi-tenant isolation audit (`AUDIT-PROMPT.md`) and Midnight visual redesign (`MIDNIGHT-REDESIGN-PROMPT.md`).

## Stack

| Layer | Tech | Version |
|-------|------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript (strict) | 5.9.3 |
| Runtime | React | 19.2.3 |
| Database | Supabase (PostgreSQL + REST + Realtime) | — |
| Payments | Stripe (Connect, direct charges) | 20.3.1 |
| Hosting | Vercel | — |
| Analytics | GTM + Meta Pixel + Meta CAPI + Supabase | — |
| Testing | Vitest + Testing Library | 4.0.18 |
| UI | Tailwind CSS v4 + shadcn/ui (Radix UI) | 4.1.x |
| Email | Resend (transactional + PDF attachments) | — |
| Video | Mux (transcoding + streaming) | — |
| Monitoring | Sentry (@sentry/nextjs) | 10.40.0 |
| Other | qrcode, jsPDF, Apple/Google Wallet, Klaviyo, Google Fonts (Space Mono, Inter) | — |

## Project Structure

```
src/
├── instrumentation.ts         # Sentry init (Node.js + Edge)
├── middleware.ts              # Auth, route protection, org_id resolution
├── app/
│   ├── layout.tsx             # Root layout (fonts, GTM, consent, OrgProvider)
│   ├── page.tsx               # Landing page (/)
│   ├── global-error.tsx       # Global error boundary
│   ├── event/[slug]/          # Public event pages (layout, page, checkout, error, loading)
│   ├── admin/                 # Admin dashboard (64 pages). Groups: Dashboard, Events,
│   │                          # Commerce, Growth, Settings, Platform Backend (owner-only).
│   │                          # Standalone: signup, onboarding, beta, invite, account, payments
│   ├── rep/                   # Rep portal (12 pages): dashboard, sales, quests, rewards,
│   │                          # points, leaderboard, profile, login, join, invite, verify-email
│   └── api/                   # ~200 handlers across 152 route files (see API Routes)
├── components/
│   ├── admin/                 # ImageUpload, ArtistLineupEditor, TierSelector, MerchImageGallery,
│   │                          # SocialEmbed, event-editor/, dashboard/, reps/
│   ├── midnight/              # Theme components: MidnightEventPage (orchestrator), Hero,
│   │                          # TicketWidget, TicketCard, MerchModal, SizeSelector, EventInfo,
│   │                          # Lineup, ArtistModal, CartSummary, CartToast, TierProgression,
│   │                          # Footer, SocialProof, FloatingHearts, DiscountPopup,
│   │                          # AnnouncementPage, QueuePage, ExternalPage,
│   │                          # discount-utils.ts, tier-styles.ts
│   ├── aura/                  # DEPRECATED — no new work
│   ├── event/                 # Shared: DiscountPopup, EngagementTracker, ThemeEditorBridge
│   ├── checkout/              # NativeCheckout, StripePaymentForm, ExpressCheckout,
│   │                          # OrderConfirmation, CheckoutTimer, MarketingConsentCheckbox
│   ├── rep/                   # RadialGauge, EmptyState, QuestCard, QuestDetailSheet, etc.
│   ├── landing/               # LandingPage, HeroSection, ParticleCanvas, EventsSection
│   ├── layout/                # Header, Footer, Scanlines, CookieConsent, VerifiedBanner
│   ├── OrgProvider.tsx        # React context: useOrgId()
│   └── ui/                    # shadcn/ui (28 components)
├── hooks/                     # 16 hooks (see Hooks section)
├── lib/                       # ~48 modules (see Architecture sections)
├── types/                     # TypeScript types per domain (15 files)
└── styles/                    # 16 CSS files (see CSS Architecture)
```

---

## Architecture

### Multi-Tenancy: Dynamic org_id Resolution
Every table has `org_id`. Every query filters by it. **Never hardcode `"feral"`**.

```
Request → Middleware resolves org_id → sets x-org-id header
         ├─ Admin host + logged in → org_users lookup (user.id → org_id)
         ├─ Tenant host → domains table lookup (hostname → org_id)
         └─ Fallback → "feral"
```

**Hosts:** `admin.entry.events` = admin. `{slug}.entry.events` = tenant. Custom domains from `domains` table. `localhost`/`*.vercel.app` = dev.

**Access patterns:** Server: `getOrgId()`. Auth API: `auth.orgId`. Public API: `getOrgIdFromRequest(request)`. Client: `useOrgId()`. Middleware caches 60s TTL.

### Authentication & Security

**Two auth systems:** Admin (`requireAuth()` → `{ user, orgId }`) and Rep portal (`requireRepAuth()` → `{ rep }`). Platform owner: `requirePlatformOwner()` → `{ user, orgId }`.

**Role flags** (Supabase `app_metadata`, additive): `is_admin`, `is_rep`, `is_platform_owner`. Dual-role supported.

**Rules for new routes:**
1. Admin: `requireAuth()`, use `auth.orgId`
2. Rep portal: `requireRepAuth()`, use `rep.org_id`
3. Platform owner: `requirePlatformOwner()`
4. Public: `getOrgIdFromRequest(request)` from `@/lib/org`, add to `PUBLIC_API_PREFIXES` or `PUBLIC_API_EXACT_GETS` in `middleware.ts`
5. **Never import `ORG_ID`** — use dynamic resolution
6. Never hardcode secrets — use env vars
7. Stripe webhook: always verify signatures in production

**Public routes (no auth):** Stripe payment routes, `checkout/*`, `GET events|settings|merch|branding|themes|media|health`, `POST track|meta/capi|discounts/validate|popup/capture`, `/api/cron/*` (CRON_SECRET), `/api/unsubscribe`, wallet routes, rep auth routes, `auth/*`, `beta/*`, `team/accept-invite`.

### Payment System (Stripe)
Event pages → `NativeCheckout` → `StripePaymentForm` + `ExpressCheckout` (Apple/Google Pay). Flow: PaymentIntent create → confirm → webhook → order + tickets + email. Discounts validated server-side. Payment health monitored via `logPaymentEvent()` → `payment_events` table.

**External ticketing**: `payment_method: "external"` → `MidnightExternalPage` (hero + about + lineup + CTA, no checkout).

**Stripe Connect**: Direct charges on connected accounts with application fee. Per-event routing: `event.stripe_account_id` → `{org_id}_stripe_account` → platform-only. Currency: GBP/EUR/USD, smallest unit. Rate limited: 10/min/IP. Tenant self-service: `/admin/payments/` + `/api/stripe/connect/my-account`. Platform owner: `/api/stripe/connect`.

**Plans**: Starter (free, 3.5% + 30p min, advertised 5% + 50p) and Pro (£29/mo, 2% + 10p min, advertised 3.5% + 30p) in `lib/plans.ts`. Stored in `{org_id}_plan`. Billing: `/api/billing/checkout` → Stripe Checkout → webhook.

### Theme System
**Single theme: Midnight** (default for all tenants). Customizable via branding system (colors, fonts, logo). Aura theme is **deprecated** — exists in code but no new work.

**Routing:** `event/[slug]/page.tsx` → `external` → `MidnightExternalPage` | default → `MidnightEventPage`.

**Announcement mode**: `tickets_live_at` in future → `MidnightAnnouncementPage` (coming-soon with countdown + email signup).

**Hype queue**: Optional fake queue. `queue_enabled` + `queue_window_minutes` → `MidnightQueuePage`. Client-side only. `useHypeQueue` hook. `?preview=tickets` bypasses both.

### Error Monitoring (Sentry)
Three layers: **Sentry** (crash tracking + session replay), **Payment Monitor** (`payment_events` table), **AI Digest** (Claude Haiku analysis every 6h).

Config: `sentry.{client,server,edge}.config.ts`. Auto-instruments API routes, server components, middleware. Session replay 5%/100% on error. Context enrichment via `setSentryOrgContext()` / `setSentryUserContext()` in auth helpers.

**Platform Health Dashboard** (`/admin/backend/health/`): Aggregates Sentry + system health + payments + AI digest.

### White-Label Branding
`{org_id}_branding`: logo, org name, colors, fonts, copyright. Event layout injects CSS vars server-side (no FOUC). Client: `useBranding()`. API: `GET/POST /api/branding`.

### Sequential Ticket Release
Per-group: reveal one-at-a-time as each sells out. Pure computed from `sold`/`capacity`. Config: `ticket_group_release_mode` in EventSettings JSONB. Logic: `lib/ticket-visibility.ts`. Server validates via `validateSequentialPurchase()`.

### Artist / Lineup System
`artists` table → `event_artists` junction (with `sort_order`). Admin CRUD at `/admin/artists/`. `ArtistLineupEditor` in event editor. `events.lineup` string array kept as fallback.

### Beta Access & Signup
`BETA_MODE = true` gates signup. Flow: `/admin/signup/` → invite code check → `/admin/beta/` (apply) → owner reviews → invite email → signup → `/admin/onboarding/` → dashboard. `provisionOrg()` in `lib/signup.ts`: creates `org_users`, `domains`, `site_settings`.

### Request Flow (Event Pages)
`/event/[slug]/` → Middleware (org_id) → RootLayout (`<OrgProvider>`) → EventLayout (Server Component: parallel fetch event + settings + branding, CSS vars + `data-theme`) → `MidnightEventPage`.

### Caching
Event + admin: `force-dynamic`, `cache: "no-store"`. Media: `max-age=31536000, immutable`. Apple Pay: `max-age=86400`.

---

## Database (Supabase)

### Tables
| Table | Purpose |
|-------|---------|
| `site_settings` | Key-value config (JSONB): key, data, updated_at |
| `events` | Event definitions: slug, name, venue_*, date_*, status, payment_method, currency, stripe_account_id, about/details/lineup, cover/hero_image, external_link, tickets_live_at, queue_*, vat_* |
| `ticket_types` | Pricing/inventory: event_id, name, price, capacity, sold, tier, includes_merch, product_id, status |
| `products` | Merch catalog: name, type, sizes[], price, images, status, sku |
| `orders` | Purchases: order_number (FERAL-XXXXX), event_id, customer_id, status, subtotal, fees, total, payment_ref |
| `order_items` | Line items: order_id, ticket_type_id, qty, unit_price, merch_size |
| `tickets` | Individual tickets: ticket_code (FERAL-XXXXXXXX), order_id, status, holder_*, scanned_at/by |
| `customers` | Profiles: email, name, total_orders/spent, marketing_consent |
| `artists` | Artist profiles: name, description, instagram_handle, image, video_url |
| `event_artists` | Junction: event_id, artist_id, sort_order |
| `guest_list` | Manual entries: event_id, name, email, qty, checked_in/at |
| `discounts` | Codes: code, type, value, max_uses, used_count, applicable_event_ids[], starts/expires_at |
| `abandoned_carts` | Recovery: customer_id, event_id, email, items (jsonb), status, cart_token |
| `traffic_events` | Funnel: event_type, page_path, session_id, referrer, utm_* |
| `org_users` | Team: auth_user_id, email, role, perm_*, status, invite_token |
| `domains` | Routing: hostname (unique), org_id, is_primary, type, status, verification_* |
| `popup_events` | Popup tracking: event_type, email, city, country |
| `payment_events` | Health log (append-only): type, severity, stripe_*, error_*, resolved |
| `event_interest_signups` | Coming-soon signups: event_id, email, notification_count (0-4), unsubscribe_token |

**Reps Program** (11 tables): `reps`, `rep_events`, `rep_rewards`, `rep_milestones`, `rep_points_log`, `rep_quests`, `rep_quest_submissions`, `rep_reward_claims`, `rep_event_position_rewards`, `rep_notifications`, `rep_push_subscriptions`. All have `org_id`. Types: `src/types/reps.ts`.

**RPCs**: `claim_reward_atomic()`, `reverse_rep_attribution()`, `get_rep_program_stats()`, `increment_sold()`.

### Key Constraints
- `orders.order_number` — unique, `FERAL-XXXXX` (sequential)
- `tickets.ticket_code` — unique, `FERAL-XXXXXXXX` (crypto-random)
- `orders.payment_ref` — idempotency (Stripe PaymentIntent ID)
- `ticket_types.product_id` → FK to `products` (ON DELETE SET NULL)
- All tables have `org_id`

### Supabase Client Rules (CRITICAL)
Wrong client → silent data loss (RLS blocks return empty arrays).
- **`getSupabaseAdmin()`** = ALL data queries (service role, bypasses RLS)
- **`getSupabaseServer()`** = auth ONLY (`requireAuth`, `getSession`)
- **`getSupabaseClient()`** = browser only (realtime, client reads)
- Never create raw `createClient()` with anon key server-side

### External Service Rules (CRITICAL)
MCP access: **Supabase** (schema, queries, migrations) + **Vercel** (deployments, logs). Use MCP directly — NEVER give user SQL to run. **Stripe** has no MCP — tell user to use dashboard. If MCP token expired, tell user to run `/mcp`. Never assume table/column exists unless documented here.

### Settings Keys
Stored in `site_settings` as key → JSONB. Helpers in `lib/constants.ts`:

| Key | Helper | Purpose |
|-----|--------|---------|
| `{org_id}_general` | — | Org settings (name, timezone, email) |
| `{org_id}_branding` | `brandingKey()` | Logo, colors, fonts |
| `{org_id}_themes` | `themesKey()` | Theme configs |
| `{org_id}_vat` | `vatKey()` | VAT config |
| `{org_id}_homepage` | `homepageKey()` | Homepage settings |
| `{org_id}_reps` | `repsKey()` | Reps program |
| `{org_id}_abandoned_cart_automation` | `abandonedCartAutomationKey()` | Cart recovery emails |
| `{org_id}_announcement_automation` | `announcementAutomationKey()` | Announcement email sequence |
| `{org_id}_popup` | `popupKey()` | Popup settings |
| `{org_id}_marketing` | `marketingKey()` | Meta Pixel + CAPI |
| `{org_id}_email` | `emailKey()` | Email templates |
| `{org_id}_wallet_passes` | `walletPassesKey()` | Wallet pass config |
| `{org_id}_events_list` | `eventsListKey()` | Events list config |
| `{org_id}_stripe_account` | `stripeAccountKey()` | Stripe Connect fallback |
| `{org_id}_plan` | `planKey()` | Plan + subscription |
| `{org_id}_onboarding` | `onboardingKey()` | Onboarding wizard |
| `{org_id}_pdf_ticket` | — | PDF ticket template |
| `media_[key]` | — | Uploaded media storage |
| `platform_stripe_billing` | `platformBillingKey()` | Pro plan billing IDs |
| `platform_payment_digest` | — | AI payment digest |
| `platform_health_digest` | — | AI platform digest |
| `platform_beta_applications` | — | Beta applicants |
| `platform_beta_invite_codes` | — | Invite codes |
| `entry_platform_xp` | — | Platform XP config |

---

## API Routes (~200 handlers, 152 route files)

### Critical Path (Payment → Order)
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/stripe/payment-intent` | Create PaymentIntent (validates tickets + sequential, discounts + VAT, rate limited) |
| POST | `/api/stripe/confirm-order` | Verify payment → create order + tickets + email |
| POST | `/api/checkout/capture` | Upsert customer + abandoned cart |
| POST | `/api/checkout/error` | Report checkout errors to payment monitor |
| POST | `/api/stripe/webhook` | payment_intent.succeeded/failed + subscription lifecycle |
| GET | `/api/stripe/account` | Connected Stripe account ID |

### Orders & Tickets
`orders` (GET/POST), `orders/[id]` (GET), `orders/[id]/refund|resend-email|rep-info|pdf` (POST/GET), `orders/[id]/wallet/apple|google` (GET), `orders/export` (GET CSV), `tickets/[code]` (GET), `tickets/[code]/scan|merch` (POST)

### Standard CRUD
Events (`events`, `events/[id]`, `events/[id]/artists`), Artists (`artists`, `artists/[id]`), Merch (`merch`, `merch/[id]`, `merch/[id]/linked-tickets`), Customers (`customers`, `customers/[id]`), Guest List (`guest-list`, `guest-list/[eventId]`), Discounts (`discounts`, `discounts/[id]`, `discounts/validate`, `discounts/seed`), Settings (`settings`, `branding`, `themes`)

### Other Routes
- **Abandoned Carts**: `abandoned-carts` (list+stats), `preview-email`, `send-test`, `cron/abandoned-carts`
- **Announcements**: `announcement/signup` (public), `signups`, `preview-email`, `cron/announcement-emails`
- **Account**: `account` (GET/PUT)
- **Auth** (public): `auth/signup|login|logout|recover|check-slug|check-org|provision-org`
- **Beta** (public): `beta/apply|verify-code|track-usage`
- **Billing** (tenant): `billing/checkout|portal|status`
- **Domains**: `domains`, `domains/[id]`, `domains/[id]/verify`
- **Email/Wallet**: `email/status|test`, `wallet/status`
- **Mux Video**: `mux/upload|status`
- **Popup**: `popup/capture` (public), `popup/leads`
- **Stripe Connect — Owner**: `stripe/connect` (CRUD), `connect/[id]/onboarding`, `apple-pay-domain|verify`
- **Stripe Connect — Tenant**: `stripe/connect/my-account`, `my-account/onboarding`
- **Platform** (owner): `platform/dashboard|tenants|tenants/[orgId]|beta-applications|invite-codes|xp-config|plans`
- **Platform Health** (owner): `platform/platform-health|platform-digest|sentry|payment-health|payment-health/[id]/resolve|payment-health/resolve-all|payment-digest`
- **Reps** (~46 routes): `reps/*` (admin CRUD, settings, stats), `rep-portal/*` (auth, dashboard, sales, quests, rewards, notifications, push, upload, verify-email)
- **Team**: `team` (GET/POST), `team/[id]`, `team/[id]/resend-invite`, `team/accept-invite` (public)
- **Uploads**: `upload` (POST base64), `upload-video` (POST signed URL)
- **Tracking**: `track`, `meta/capi`, `admin/dashboard`, `admin/orders-stats`
- **Other**: `media/[key]`, `health`, `unsubscribe`

### Vercel Cron Jobs
| Schedule | Route | Purpose |
|----------|-------|---------|
| `*/5 * * * *` | `/api/cron/announcement-emails` | Announcement email steps 2-4 |
| `*/10 * * * *` | `/api/cron/abandoned-carts` | Abandoned cart recovery |
| `*/30 * * * *` | `/api/cron/stripe-health` | Payment health check |
| `0 */6 * * *` | `/api/cron/payment-digest` | AI payment digest |

---

## Hooks

### Key Hooks
| Hook | Purpose |
|------|---------|
| `useBranding` | Org branding (module-level cache) |
| `useSettings` | Settings context + realtime subscription |
| `useCart` | Cart state, quantities, merch sizes, totals, checkout redirect, sequential visibility |
| `useEventTracking` | Unified tracking: Meta + GTM + CAPI + traffic (stable refs) |
| `useMetaTracking` | Meta Pixel + CAPI (consent-aware, stable refs) |
| `useDataLayer` | GTM dataLayer push (stable refs) |
| `useDashboardRealtime` | Dashboard live updates |
| `useTraffic` | Supabase funnel tracking |
| `useHypeQueue` | Fake queue progress, localStorage gate, social proof |
| `useCountdown` | Countdown timer → { days, hours, mins, secs, passed } |
| `useOrgTimezone` | Org timezone from settings (fallback: Europe/London) |
| `useHeaderScroll` | Header hide/show on scroll |
| `useScrollReveal` | IntersectionObserver animations |
| `useCountUp` | Animated counter (rep gauges) |
| `usePopupSettings` | Popup settings fetch |
| `useRepPWA` | PWA install prompt (iOS/Android/desktop) |

### Referential Stability (CRITICAL)
Hooks returning objects/functions as effect deps MUST use `useMemo`. **Stable ref hooks (do NOT break):** `useMetaTracking()`, `useDataLayer()`, `useEventTracking()`, `useSettings()`, `useBranding()`, `useDashboardRealtime()`. Destructure callbacks as deps — never use the whole object.

### Consent + Module State
`useMetaTracking` checks `feral_cookie_consent` localStorage for `marketing: true`. Both `useMetaTracking` and `useBranding` persist state at module scope — tests must account for this.

---

## Environment Variables

**Required**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
**Payments**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
**Email/URLs**: `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL`
**Cron**: `CRON_SECRET`
**Optional**: `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_KLAVIYO_LIST_ID`, `NEXT_PUBLIC_KLAVIYO_COMPANY_ID`
**Video**: `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`
**Push**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
**Wallet**: `APPLE_PASS_CERTIFICATE`, `APPLE_PASS_CERTIFICATE_PASSWORD`, `APPLE_WWDR_CERTIFICATE`, `APPLE_PASS_TYPE_IDENTIFIER`, `APPLE_PASS_TEAM_IDENTIFIER`, `GOOGLE_WALLET_SERVICE_ACCOUNT_KEY`, `GOOGLE_WALLET_ISSUER_ID`
**Domains**: `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`
**Monitoring**: `PLATFORM_ALERT_EMAIL`, `ANTHROPIC_API_KEY` (optional), `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`

---

## Testing

**Framework**: Vitest + @testing-library/react (jsdom). Config: `vitest.config.ts`. Setup: `src/__tests__/setup.ts`.
**Run**: `npm test` (single) or `npm run test:watch` (watch).

**13 test suites**: `auth`, `signup`, `useMetaTracking`, `useDataLayer`, `useDashboardRealtime`, `useTraffic`, `wallet-passes`, `products`, `orders`, `rate-limit`, `rep-deletion`, `vat`, `merch-images`

**Rules**: New hooks need test files. New API routes should have tests. Referential stability tests mandatory for hooks with object/function deps. Test state logic, API shape, edge cases, payment flows — not UI rendering or CSS.

---

## Platform Health Monitoring — AI Workflow

When asked to "check health," "look at errors," or "fix what's broken":

### Step 1: Fetch unresolved issues
```bash
source .env.local && curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/projects/$SENTRY_ORG/$SENTRY_PROJECT/issues/?query=is:unresolved&sort=freq&limit=25"
```
For payment health: Supabase MCP → query `payment_events` where `resolved = false`.
If dev server running: `GET /api/platform/platform-health?period=24h`.

### Step 2: Triage
- **FIX**: Server 500s, React errors, checkout breaks, webhook failures → find file, fix bug
- **RESOLVE** (not bugs): `card_declined`/`insufficient_funds` (normal 2-5%), transient network timeouts, bot 401s, browser extension errors
- **IGNORE**: Single non-reproducible errors with no user impact

### Step 3: Fix → Commit → Resolve
```bash
# Resolve Sentry issue
source .env.local && curl -X PUT -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"resolved"}' \
  "https://sentry.io/api/0/issues/ISSUE_ID/"

# Add comment (audit trail)
source .env.local && curl -X POST -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  -H "Content-Type: application/json" -d '{"text":"Fixed in commit abc — reason"}' \
  "https://sentry.io/api/0/issues/ISSUE_ID/comments/"
```
Payment events: Supabase MCP → `UPDATE payment_events SET resolved=true, resolution_notes='...'`.

### Health monitoring rules
1. Always investigate before resolving — don't bulk-resolve blindly
2. Leave clear notes — future sessions need context
3. **Payment orphans are CRITICAL** — money taken, no ticket. Never ignore
4. Card declines are normal (2-5%). Not bugs
5. Check recurrence — 1 occurrence = noise, 50 = real bug
6. Errors with `org_id` = tenant-specific. Without = platform-wide (higher priority)
7. Never resolve what you don't understand — investigate first
8. Fix and commit before resolving
9. For manual actions (Stripe dashboard, etc.) — give step-by-step instructions

---

## Design System

### Platform Brand (Entry — Admin)
Primary: `#8B5CF6` (Electric Violet). Gradient: `linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)`.

### Public Event Pages (Tenant-Configurable)
Defaults in `base.css :root`, overridable per-tenant via branding:
```css
--accent: #ff0033; --bg-dark: #0e0e0e; --card-bg: #1a1a1a; --card-border: #2a2a2a;
--text-primary: #fff; --text-secondary: #888; --font-mono: 'Space Mono'; --font-sans: 'Inter';
```
`midnight.css` maps to Tailwind semantic tokens. Midnight identity: cyberpunk, glassmorphism, metallic tiers. Mobile-first (375px).

### Admin Design Tokens
In `tailwind.css` via `@theme inline {}`: `background` (#08080c), `foreground` (#f0f0f5), `primary` (#8B5CF6), `card` (#111117), `border` (#1e1e2a), `destructive` (#F43F5E), `success` (#34D399), `warning` (#FBBF24), `info` (#38BDF8). Use Tailwind classes — never hardcode hex.

---

## CSS Architecture

| Area | CSS System | Entry Point |
|------|-----------|-------------|
| Public site (landing) | Hand-written CSS (`base.css`, `header.css`) | `app/layout.tsx` |
| Event pages: Midnight | Tailwind v4 + effects (`midnight.css`, `midnight-effects.css`, `hero-effects.css`) | `MidnightEventPage` imports |
| Admin (`/admin/*`) | Tailwind v4 + shadcn/ui | `app/admin/layout.tsx` via `tailwind.css` |
| Rep portal (`/rep/*`) | Tailwind v4 + shadcn/ui + `rep-effects.css` | `app/rep/layout.tsx` |

**Isolation**: Admin: `<div data-admin>`. Events: `[data-theme="midnight"]`. Reps: `[data-rep]`. Preflight resets scoped to `[data-admin]` via `@layer admin-reset`.

**Layer rules (DO NOT BREAK)**: `@layer theme, admin-reset;` then `@import "tailwindcss/utilities"` UNLAYERED. NEVER add `layer(utilities)` or global `*` resets that override Tailwind.

**New CSS**: Component-level imports. Event themes scoped via `[data-theme]`. Landing: hand-written BEM (breakpoints: 1024/768/480px).

---

## Component Rules

### Midnight Theme Components
- Live in `src/components/midnight/`. Orchestrator `MidnightEventPage` imports CSS. Children don't.
- Tailwind + shadcn/ui for layout. Effects in `midnight-effects.css`, tokens in `midnight.css`
- Scope to `[data-theme="midnight"]`. Mobile-first (375px). Support `prefers-reduced-motion`
- Shared hooks: `useCart()`, `useEventTracking()`, `useSettings()`, `useBranding()`, `useHeaderScroll()`

### shadcn/ui (28 components in `src/components/ui/`)
Alert, Avatar, Badge, Button, Calendar, Card, Collapsible, ColorPicker, DatePicker, Dialog, Input, Label, LiveIndicator, LiveStatCard, NativeSelect, Popover, Progress, Select, Separator, Skeleton, Slider, StatCard, Switch, Table, Tabs, Textarea, Tooltip, TrendBadge

New components: create in `ui/`, use Radix UI, use `cn()` from `@/lib/utils`.

### Admin Pages
`"use client"` — shadcn/ui + Tailwind + design tokens. Settings: fetch from `site_settings`, save via `/api/settings`. Uploads: POST base64 to `/api/upload`.

### Rep Portal Pages
shadcn/ui + Tailwind + admin tokens. Gaming effects in `rep-effects.css` (class names, not inline). Mobile-first. Auth: `requireRepAuth()`. No new `--rep-*` CSS vars.

---

## Known Gaps
1. **Scanner PWA** — API exists (`tickets/[code]` + `scan`) but no frontend
2. **Google Ads + TikTok tracking** — placeholders only
3. **Supabase RLS** — should enforce org_id at DB level
4. **Cron multi-org** — `/api/cron/*` still uses `ORG_ID` fallback, should iterate all orgs
5. **Aura theme** — still in code, pending removal

---

## Document Maintenance

1. **Read this file at session start** — single source of truth
2. **Update after architecture changes** — new tables, routes, modules
3. **Delete deprecated references** — no dead code documented
4. **Keep under 40K characters** — compress verbose sections, don't remove useful info. Current budget: ~38K target
5. **This file is the map.** Undocumented = unknown. Wrong docs = wrong assumptions
