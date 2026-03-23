# Entry — Platform Context

## Mission
Entry is a white-label events and ticketing platform ("Shopify for Events"). Today it powers FERAL's events; the goal is any promoter can sell tickets/merch under their own brand, platform takes a fee.

Every database query filters by `org_id`. Every feature must work for promoters who aren't FERAL.

**Status:** Controlled beta (`BETA_MODE = true` in `lib/beta.ts`). Promoters apply via invite codes → onboarding wizard → admin dashboard. Queued workstreams: multi-tenant isolation audit (`AUDIT-PROMPT.md`) and Midnight visual redesign (`MIDNIGHT-REDESIGN-PROMPT.md`).

## Build Standards (CRITICAL)

This platform is scaling to 1000+ tenants. Every feature must be production-grade — no shortcuts, no scaffolds, no "get it working and fix later."

1. **Complete implementations** — if building a feature, implement it fully: error states, loading states, mobile responsiveness, multi-tenant isolation, proper TypeScript types. Don't leave half-finished code.
2. **Multi-tenant always** — every query filters by `org_id`. Every new table needs `org_id`. Every settings key uses the `{org_id}_` prefix pattern via helpers in `lib/constants.ts`. Mentally test with a non-"feral" org.
3. **Mobile-first** — 70%+ of ticket buyers are on phones. Build for 375px first, then scale up. Touch targets ≥44px.
4. **Follow existing patterns** — before creating a new route, hook, or component, find the closest existing equivalent and match its structure exactly. Don't invent new conventions. Check how auth, error handling, and responses are done in similar routes.
5. **Test what matters** — run `npm test` before committing. Payment/checkout changes need `npm run test:integration`. New hooks need test files.
6. **No dead code** — don't leave commented-out code, unused imports, or TODO placeholders in committed code.
7. **Proper error handling** — API routes return appropriate status codes (400 for bad input, 401/403 for auth, 404 for not found, 500 for server errors). Use try/catch and log to Sentry on unexpected errors.
8. **Use the right Supabase client** — `getSupabaseAdmin()` for data queries, `getSupabaseServer()` for auth only. Wrong client = silent data loss.

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
| UI | Tailwind CSS v4 + shadcn/ui (Radix UI) | 4.1.18 |
| Email | Resend (transactional + PDF attachments) | — |
| Video | Mux (transcoding + streaming) | — |
| Monitoring | Sentry (@sentry/nextjs) | 10.40.0 |
| Other | qrcode, jsPDF, Apple/Google Wallet, Klaviyo, Google Fonts (Space Mono, Inter), web-push (VAPID) | — |

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
│   ├── events/                # Public events list page
│   ├── shop/[slug]/           # Public merch storefront (landing, product, checkout, confirmation)
│   ├── scanner/               # Ticket scanner PWA (6 pages: dashboard, events, scan, login, settings)
│   ├── admin/                 # Admin dashboard (~70 files). Groups: Dashboard, Events,
│   │                          # Commerce, Growth, Settings, Platform Backend (owner-only).
│   │                          # Standalone: signup, onboarding, beta, invite, account, payments
│   │                          # Also: command/ (live city scene), merch-store/, ticketstore/
│   ├── rep/                   # Rep portal (14 pages): dashboard, sales, quests, rewards,
│   │                          # points, leaderboard, profile, profile/[id], login, join, invite/[token], verify-email
│   └── api/                   # ~262 handlers across 192 route files (see API Routes)
├── components/
│   ├── admin/                 # ImageUpload, ArtistLineupEditor, TierSelector, MerchImageGallery,
│   │                          # SocialEmbed, event-editor/, dashboard/, reps/, command/
│   ├── midnight/              # Theme components (26 files): MidnightEventPage (orchestrator),
│   │                          # MidnightHero, MidnightTicketWidget, MidnightTicketCard,
│   │                          # MidnightMerchModal, MidnightSizeSelector, MidnightEventInfo,
│   │                          # MidnightLineup, MidnightArtistModal, MidnightCartSummary,
│   │                          # MidnightCartToast, MidnightTierProgression, MidnightFooter,
│   │                          # MidnightSocialProof, MidnightFloatingHearts, MidnightDiscountPopup,
│   │                          # MidnightAnnouncementPage, MidnightQueuePage, MidnightExternalPage,
│   │                          # MidnightCurrencySelector, MidnightFlashSaleBanner, MidnightTrustBar,
│   │                          # MidnightAnnouncementWidget, CodeRainCanvas, discount-utils.ts, tier-styles.ts
│   ├── aura/                  # DEPRECATED — no new work (18 files still in code)
│   ├── event/                 # Shared: DiscountPopup, EngagementTracker, ThemeEditorBridge,
│   │                          # DynamicEventPage, DynamicTicketWidget, BottomBar, CartSummary,
│   │                          # EventHero, KompassEventPage, SocialProofToast, TeeModal + more
│   ├── checkout/              # NativeCheckout, ExpressCheckout, OrderConfirmation,
│   │                          # CheckoutTimer, MarketingConsentCheckbox, CheckoutServiceUnavailable
│   ├── shop/                  # Merch storefront: ShopLandingPage, ProductCard, ProductDetailModal,
│   │                          # ProductPage, CollectionPage, MerchCheckoutWrapper, MerchOrderConfirmation
│   ├── scanner/               # Scanner PWA: QRScanner, ScanResult, ScanHistory, ScanStats,
│   │                          # EventCard, GuestListSearch, ManualEntry, ModeToggle, ScannerInstallPrompt
│   ├── events/                # EventCard, EventsListPage
│   ├── rep/                   # 19 components (see Rep Portal section)
│   ├── landing/               # LandingPage, HeroSection, ParticleCanvas, EventsSection,
│   │                          # AboutSection, ContactSection, GenericAboutSection, HeroGlitchText
│   ├── layout/                # Header, Footer, Scanlines, CookieConsent, VerifiedBanner, PaymentMethodsStrip
│   ├── OrgProvider.tsx        # React context: useOrgId()
│   ├── CurrencyProvider.tsx   # Currency context provider
│   └── ui/                    # shadcn/ui (28 components)
├── hooks/                     # 21 hooks (see Hooks section)
├── lib/                       # 72 modules across 3 subdirs (see Architecture sections)
├── types/                     # TypeScript types per domain (18 files)
└── styles/                    # 17 CSS files (see CSS Architecture)
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

**Role flags** (Supabase `app_metadata`, additive): `is_admin`, `is_rep`, `is_platform_owner`. Dual-role supported (same Google account can be admin + rep).

**Rules for new routes:**
1. Admin: `requireAuth()`, use `auth.orgId`
2. Rep portal: `requireRepAuth()`, use `rep.org_id`
3. Platform owner: `requirePlatformOwner()`
4. Public: `getOrgIdFromRequest(request)` from `@/lib/org`, add to `PUBLIC_API_PREFIXES` or `PUBLIC_API_EXACT_GETS` in `middleware.ts`
5. **Never import `ORG_ID`** — use dynamic resolution
6. Never hardcode secrets — use env vars
7. Stripe webhook: always verify signatures in production

**Public routes (no auth):** Stripe payment/checkout, events/settings/merch/branding GETs, track/meta/discounts/popup POSTs, cron (CRON_SECRET), auth/*, beta/*, rep auth, wallet downloads, guest-list (rsvp/submit/apply/application-payment/application-confirm), scanner/manifest, merch-store payment, brand/logo.

### Payment System (Stripe)
Event pages → `NativeCheckout` → `ExpressCheckout` (Apple/Google Pay). Flow: PaymentIntent create (idempotency key) → confirm → webhook → order + tickets + email. Stock reserved atomically via `increment_sold()` RPC (returns false if sold out, triggers rollback). Discounts validated server-side, incremented atomically via `increment_discount_used()` RPC. Payment health monitored via `logPaymentEvent()` → `payment_events` table.

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

Config: `sentry.{client,server,edge}.config.ts`. Auto-instruments API routes, server components, middleware. Session replay 5%/100% on error. Tunnel: `/api/monitoring` (bypasses ad blockers). Context enrichment via `setSentryOrgContext()` / `setSentryUserContext()` in auth helpers. All error boundaries (`global-error.tsx`, `admin/error.tsx`, `event/[slug]/error.tsx`) report to Sentry.

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

## Rep Portal (Ambassador/Street Team Platform)

### Overview
Full gamified ambassador system. Reps sign up, get assigned to events, share discount codes, earn XP + currency (FRL) per sale, compete on leaderboards, complete quests, spend currency in reward shop. Admin manages everything from `/admin/reps/`.

### Rep Lifecycle
Signup (`/rep/join`, Google/email) → Onboarding (`WelcomeOverlay`: nickname, photo, PWA install) → Pending (polls dashboard every 10s) → Admin approves (`PUT /api/reps/[id]` → welcome email + push + auto-assign events) → Active (full dashboard).

### Rep Auth
`requireRepAuth()` → `{ rep }` with `rep.org_id`. Rep routes: `/api/rep-portal/*`. Admin rep routes: `/api/reps/*` (use `requireAuth()`).

### Dual Economy (XP + Currency)
- **XP (points_balance)** — earned per sale/quests/grants, drives leveling, never spent
- **FRL (currency_balance)** — earned alongside XP, spent in reward shop. Name configurable per org
- `awardPoints()` in `lib/rep-points.ts` handles both. `claim_reward_atomic()` RPC deducts `currency_balance`
- Levels: `lib/xp-levels.ts`. Tiers: `lib/rep-tiers.ts` (Bronze → Mythic)

### Quests & Share Links
Quest types: `social_share`, `ugc_photo`, `ugc_video`, `referral`, `custom`. Submit via `QuestSubmitSheet`, admin reviews in ReportsTab. Share links: `{tenant_domain}/event/{slug}?ref={CODE}` — auto-applies discount, attribution via `rep-attribution.ts`.

### Push Notifications
`web-push` + VAPID. SW at `/rep-sw.js`. `createNotification()` in `lib/rep-notifications.ts`: DB + push, never throws. Types (CHECK constraint): `reward_unlocked`, `quest_approved`, `sale_attributed`, `level_up`, `reward_fulfilled`, `manual_grant`, `approved`, `general`.

### Rep Components & Lib
**Components** (`src/components/rep/`): 19 components. **Lib** (`src/lib/rep-*.ts`): 11 modules. PWA: `useRepPWA` hook (SW, push, install prompts with 7-day cooldown).

### Admin Reps (`/admin/reps/`)
6 tabs: Dashboard, Reps (CRUD), Quests, Reports (submissions), Rewards (shop), Settings. Team permissions: `perm_reps` (parent) + `perm_reps_manage|content|award|settings` (sub-perms auto-clear when parent disabled).

---

## Scanner PWA (Ticket Scanning)

Full ticket scanning PWA at `/scanner/`. Scanners (team members with scanner access) can scan QR codes at events, check in guests, and view real-time stats.

**Pages**: `/scanner/` (dashboard), `/scanner/events/` (event list), `/scanner/scan/` (QR scanner), `/scanner/login/`, `/scanner/settings/`. Service worker at `/scanner-sw.js`.

**Components** (`src/components/scanner/`): QRScanner (camera-based QR scanning), ScanResult (scan outcome display), ScanHistory (recent scans), ScanStats (event check-in stats), EventCard, GuestListSearch, ManualEntry, ModeToggle, ScannerInstallPrompt.

**API**: `scanner/events` (GET assigned events), `scanner/events/[id]/stats` (GET check-in stats), `scanner/assignments` (GET/PUT scanner↔event assignments), `scanner/manifest` (GET PWA manifest, public).

**Hook**: `useScannerPWA` — mirrors `useRepPWA` for scanner install flow + camera permissions.

**Auth**: Uses admin auth (`requireAuth()`). Scanner assignments stored in `{org_id}_scanner_assignments` settings key.

---

## Merch Store (Standalone Storefront)

Separate merch storefront system at `/shop/[slug]/` — standalone product pages outside of event context.

**Pages**: `/shop/[slug]/` (landing), product pages, checkout, order confirmation.

**Components** (`src/components/shop/`): ShopLandingPage, ProductCard, ProductDetailModal, ProductPage, CollectionPage, MerchCheckoutWrapper, MerchOrderConfirmation.

**API**: `merch-store/settings` (GET/POST), `merch-store/collections` (GET/POST), `merch-store/collections/[slug]` (GET/PUT/DELETE), `merch-store/payment-intent` (POST, public), `merch-store/confirm-order` (POST, public).

**Database**: `merch_collections` + `merch_collection_items` tables. Settings key: `merchStoreKey()`.

**Types**: `src/types/merch-store.ts`. Lib: `src/lib/merch-orders.ts`.

---

## Currency System

Multi-currency support with exchange rate conversion. Buyer's currency auto-detected from geo-IP (`x-vercel-ip-country` header → `buyer_currency` cookie).

**Lib** (`src/lib/currency/`): `conversion.ts` (rate conversion), `exchange-rates.ts` (rate fetching/caching), `country-currency-map.ts` (country→currency mapping), `types.ts`.

**API**: `currency/rates` (GET, public). **Cron**: `cron/exchange-rates` (every 6h, fetches latest rates). Settings key: `exchangeRatesKey()` (platform-level).

**Components**: `CurrencyProvider.tsx` (context), `MidnightCurrencySelector` (event page selector).

---

## Database (Supabase)

### Tables (32 total — all have `org_id`)

**Core:** `site_settings` (key-value JSONB config), `events`, `ticket_types` (event_id, price, capacity, sold), `products` (merch), `orders` (order_number FERAL-XXXXX, payment_ref), `order_items`, `tickets` (ticket_code FERAL-XXXXXXXX, scanned_at/by), `customers`, `artists`, `event_artists` (junction with sort_order), `guest_list` (source: direct/artist/application, access_level, invite_token), `discounts` (applicable_event_ids[], rep_id nullable), `abandoned_carts`, `traffic_events`, `org_users` (perm_* flags), `domains` (hostname unique), `popup_events`, `payment_events` (append-only health log), `event_interest_signups`, `merch_collections`, `merch_collection_items`.

**Reps Program (11 tables):** `reps` (points_balance, currency_balance, level, status), `rep_events`, `rep_rewards` (metadata JSONB), `rep_milestones`, `rep_points_log`, `rep_quests`, `rep_quest_submissions`, `rep_reward_claims` (metadata JSONB), `rep_event_position_rewards`, `rep_notifications` (type CHECK constraint), `rep_push_subscriptions`. Types: `src/types/reps.ts`.

Table names defined in `TABLES` constant in `lib/constants.ts` — always use `TABLES.X` not raw strings.

**RPCs**: `claim_reward_atomic()` (deducts currency_balance), `reverse_rep_attribution()`, `get_rep_program_stats()`, `increment_sold()` (atomic stock reservation, returns boolean), `increment_discount_used()` (atomic discount count, returns integer).

### Key Constraints
- `orders.order_number` — unique, `FERAL-XXXXX` (sequential)
- `tickets.ticket_code` — unique, `FERAL-XXXXXXXX` (crypto-random)
- `orders.payment_ref` — idempotency (Stripe PaymentIntent ID)
- `ticket_types.product_id` → FK to `products` (ON DELETE SET NULL)
- `rep_notifications.type` — CHECK constraint (must match TypeScript union)
- `rep_push_subscriptions` — unique on `(rep_id, endpoint)`
- All tables have `org_id`

### Supabase Client Rules (CRITICAL)
Wrong client → silent data loss (RLS blocks return empty arrays).
- **`getSupabaseAdmin()`** = ALL data queries (service role, bypasses RLS)
- **`getSupabaseServer()`** = auth ONLY (`requireAuth`, `getSession`)
- **`getSupabaseClient()`** = browser only (realtime, client reads)
- Never create raw `createClient()` with anon key server-side

### Row-Level Security (RLS)
All tables have RLS. Helper `auth_user_org_id()` maps `auth.uid()` → `org_id` via `org_users`/`reps`. **anon**: INSERT on `traffic_events`/`popup_events`, SELECT on public content only. **authenticated**: CRUD scoped to `org_id = auth_user_org_id()`. **service_role**: bypasses all RLS (all API routes via `getSupabaseAdmin()`).

### External Service Rules (CRITICAL)
MCP access: **Supabase** (schema, queries, migrations) + **Vercel** (deployments, logs). Use MCP directly — NEVER give user SQL to run. **Stripe** has no MCP — tell user to use dashboard. If MCP token expired, tell user to run `/mcp`. Never assume table/column exists unless documented here.

### Settings Keys
Stored in `site_settings` as key → JSONB. All helpers in `lib/constants.ts` — **always use helpers, never hardcode keys**.

**Per-org keys** (pattern: `{org_id}_*`): `generalKey()`, `brandingKey()`, `themesKey()`, `vatKey()`, `homepageKey()`, `repsKey()`, `abandonedCartAutomationKey()`, `announcementAutomationKey()`, `popupKey()`, `marketingKey()`, `emailKey()`, `walletPassesKey()`, `eventsListKey()`, `stripeAccountKey()`, `planKey()`, `onboardingKey()`, `merchStoreKey()`, `scannerAssignmentsKey()`, `guestListSettingsKey()`, `guestListSubmissionsKey()`, `guestListCampaignsKey()`. Also `{org_id}_pdf_ticket` (no helper).

**Platform keys**: `platformBillingKey()`, `exchangeRatesKey()`. Also without helpers: `platform_payment_digest`, `platform_health_digest`, `platform_beta_applications`, `platform_beta_invite_codes`, `entry_platform_xp`.

**Other**: `media_[key]` (uploaded media storage).

---

## API Routes (~262 handlers, 192 route files)

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

### Standard CRUD (admin auth)
Events (`events`, `events/[id]`, `events/[id]/artists`), Artists (`artists`, `artists/[id]`), Merch (`merch`, `merch/[id]`, `merch/[id]/linked-tickets`), Customers (`customers`), Discounts (`discounts`, `discounts/[id]`, `discounts/validate`, `discounts/auto`, `discounts/seed`), Settings (`settings`, `branding`, `themes`), Guest List (12 routes — see Guest List section), Domains (3 routes), Team (5 routes incl. public `team/accept-invite`)

### Rep Routes
**Portal** (`/api/rep-portal/*`, ~32 routes, `requireRepAuth()`): auth, dashboard, me, settings, discount, sales, quests, rewards, notifications, push, points, profile, leaderboard, upload, PWA manifest.
**Admin** (`/api/reps/*`, ~35 routes, `requireAuth()`): CRUD, settings, stats, events/assign/summary, quests, submissions, rewards, claims, points, milestones, campaign-events, leaderboard lock/rewards.

### Other Route Categories
**Payment adjacent**: `abandoned-carts` (3 routes), `billing` (checkout/portal/status), `stripe/connect` (owner + tenant self-service)
**Public**: `auth/*`, `beta/*`, `announcement/signup`, `popup/capture`, `track`, `meta/capi`, `brand/logo`, `currency/rates`, `health`, `unsubscribe`, `media/[key]`
**Platform owner**: `platform/*` (dashboard, tenants, beta-applications, invite-codes, xp-config, health, digest, sentry, payment-health, impersonate, rep-override-code)
**Admin dashboard**: `admin/live-sessions`, `admin/checkout-health`, `admin/orders-stats`, `admin/uk-events`
**Integrations**: `mux/*`, `email/*`, `wallet/status`, `upload`, `upload-video`, scanner (4 routes), merch-store (5 routes)

### Vercel Cron Jobs
| Schedule | Route | Purpose |
|----------|-------|---------|
| `*/5 * * * *` | `/api/cron/announcement-emails` | Announcement email steps 2-4 |
| `*/10 * * * *` | `/api/cron/abandoned-carts` | Abandoned cart recovery |
| `*/30 * * * *` | `/api/cron/stripe-health` | Payment health check |
| `0 */6 * * *` | `/api/cron/payment-digest` | AI payment digest |
| `0 */6 * * *` | `/api/cron/exchange-rates` | Currency exchange rate update |

---

## Hooks

### Key Hooks (21 hooks in `src/hooks/`)
`useBranding`, `useSettings`, `useCart`, `useShopCart`, `useEventTracking`, `useMetaTracking`, `useDataLayer`, `useDashboardRealtime`, `useLiveSessions`, `useTraffic`, `useHypeQueue`, `useCountdown`, `useOrgTimezone`, `useOrgCurrency`, `useCurrency`, `useHeaderScroll`, `useScrollReveal`, `useCountUp`, `usePopupSettings`, `useRepPWA`, `useScannerPWA`.

### Referential Stability (CRITICAL)
Hooks returning objects/functions as effect deps MUST use `useMemo`. **Stable ref hooks (do NOT break):** `useMetaTracking()`, `useDataLayer()`, `useEventTracking()`, `useSettings()`, `useBranding()`, `useDashboardRealtime()`. Destructure callbacks as deps — never use the whole object.

### Consent + Module State
`useMetaTracking` checks `feral_cookie_consent` localStorage for `marketing: true`. Both `useMetaTracking` and `useBranding` persist state at module scope — tests must account for this.

---

## Environment Variables

**Required**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`
**Optional**: GTM, Klaviyo, Mux, VAPID, Apple/Google Wallet certs, Vercel API, Sentry, Anthropic API
**Monitoring**: `PLATFORM_ALERT_EMAIL`, `ANTHROPIC_API_KEY` (optional), `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`

---

## Testing

**Framework**: Vitest + @testing-library/react (jsdom). Config: `vitest.config.ts` (projects: `unit` + `integration`). Setup: `src/__tests__/setup.ts`.

**Scripts**: `npm test` (unit only, 1.6s), `npm run test:integration` (real DB, ~97s), `npm run test:all` (both).

**Unit tests**: 18 suites (335 tests). **Integration tests**: 3 suites (13 tests, real Supabase, Stripe mocked, scoped to `org_id = '__test_integration__'`).

**Pre-push hook**: `npm test` runs automatically before every `git push`. Blocks push if tests fail. Cannot be skipped.

**CI gate**: `vercel-build` script runs unit tests before `next build`. Failed tests → failed deploy.

**MANDATORY before committing**: Always run `npm test`. When changes touch payment/checkout code (`stripe/`, `lib/orders.ts`, `lib/stripe/`, checkout components), also run `npm run test:integration` before pushing.

**Rules**: New hooks need test files. New API routes should have tests. Referential stability tests mandatory for hooks with object/function deps. Test state logic, API shape, edge cases, payment flows — not UI rendering or CSS.

---

## Platform Health Monitoring — AI Workflow

When asked to "check health," "look at errors," or "fix what's broken":

1. **Fetch**: Sentry unresolved issues (EU region, use `$SENTRY_AUTH_TOKEN` from `.env.local`), `payment_events WHERE resolved = false` via Supabase MCP, `/api/platform/platform-health?period=24h`
2. **Triage**: **FIX** 500s, React errors, checkout/webhook failures. **RESOLVE** (not bugs): card_declined (normal 2-5%), network timeouts, bot 401s. **IGNORE**: single non-reproducible errors
3. **Fix → Commit → Resolve**: Sentry PUT `/api/0/issues/ISSUE_ID/` with `{"status":"resolved"}` + comment. Payment events: Supabase MCP UPDATE `resolved=true, resolution_notes='...'`

**Rules**: Investigate before resolving — never bulk-resolve. **Payment orphans are CRITICAL** (money taken, no ticket). Card declines are normal. Without `org_id` = platform-wide (higher priority). For Stripe actions — give step-by-step instructions.

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
| Admin (`/admin/*`) | Tailwind v4 + shadcn/ui + `command.css` | `app/admin/layout.tsx` via `tailwind.css` |
| Rep portal (`/rep/*`) | Tailwind v4 + shadcn/ui + `rep-effects.css` | `app/rep/layout.tsx` |
| Scanner (`/scanner/*`) | Tailwind v4 + `scanner.css` | `app/scanner/layout.tsx` |

**Isolation**: `[data-admin]`, `[data-theme="midnight"]`, `[data-rep]`. Preflight resets scoped via `@layer admin-reset`.

**Layer rules (DO NOT BREAK)**: `@layer theme, admin-reset;` then `@import "tailwindcss/utilities"` UNLAYERED. NEVER add `layer(utilities)` or global `*` resets.

**New CSS**: Component-level imports. Themes scoped via `[data-theme]`. Landing: BEM (breakpoints: 1024/768/480px).

---

## Component Rules

### Midnight Theme Components
- Live in `src/components/midnight/`. Orchestrator `MidnightEventPage` imports CSS. Children don't.
- Tailwind + shadcn/ui for layout. Effects in `midnight-effects.css`, tokens in `midnight.css`
- Scope to `[data-theme="midnight"]`. Mobile-first (375px). Support `prefers-reduced-motion`
- Shared hooks: `useCart()`, `useEventTracking()`, `useSettings()`, `useBranding()`, `useHeaderScroll()`

### shadcn/ui (28 components in `src/components/ui/`)
New components: create in `ui/`, use Radix UI, use `cn()` from `@/lib/utils`.

### Admin Pages
`"use client"` — shadcn/ui + Tailwind + design tokens. Settings: fetch from `site_settings`, save via `/api/settings`. Uploads: POST base64 to `/api/upload`.

### Rep Portal Pages
shadcn/ui + Tailwind + admin tokens. Gaming effects in `rep-effects.css` (class names, not inline). Mobile-first. Auth: `requireRepAuth()`. No new `--rep-*` CSS vars.

---

## Guest List Manager

Admin page at `/admin/guest-list/` with tabs: Guests, Artist Links, Applications, Settings. Access levels: `guest_list` (default), `vip`, `backstage`, `aaa`, `artist`. Hidden ticket types auto-created per event per level.

### Three Guest Sources
- **Direct** (`source: 'direct'`): Admin adds guest → invite email → RSVP at `/guest-list/rsvp/[token]` → ticket issued via `issueGuestListTicket()`
- **Artist** (`source: 'artist'`): Submission link with quotas → `/guest-list/submit/[token]` → admin approves → invite → RSVP → ticket
- **Application** (`source: 'application'`): Campaign landing page at `/guest-list/apply/[campaignId]` → admin reviews → accepts free (invite email) or paid (acceptance → card payment → ticket)

### Payment (Paid Applications)
Card form (Stripe CardNumberElement/CardExpiryElement/CardCvcElement). PaymentIntent via `/api/guest-list/application-payment` (card only). Confirmation via `/api/guest-list/application-confirm` → `issueGuestListTicket()`. Webhook backup for `metadata.type === "guest_list_application"`.

### Key Files
Core lib: `src/lib/guest-list.ts`. Types: `src/types/guest-list.ts`, `src/types/orders.ts`. Admin: `src/app/admin/guest-list/page.tsx` + `src/components/admin/guest-list/` (4 tabs). Public: `src/app/guest-list/` (rsvp, submit, apply, accept). Settings keys: `guestListSettingsKey()`, `guestListSubmissionsKey()`, `guestListCampaignsKey()` in `lib/constants.ts`. Scanner: guest list tickets scan identically to paid tickets; scan route syncs `guest_list.checked_in`.

---

## Known Gaps
1. **Google Ads + TikTok tracking** — placeholders only
2. **Aura theme** — 18 components still in `src/components/aura/`, deprecated, pending removal

---

## Document Maintenance

1. **Read this file at session start** — single source of truth
2. **Update after architecture changes** — new tables, routes, modules
3. **Delete deprecated references** — no dead code documented
4. **Keep under 40K characters** — compress verbose sections, don't remove useful info
5. **This file is the map.** Undocumented = unknown. Wrong docs = wrong assumptions
