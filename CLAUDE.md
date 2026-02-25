# Entry — Platform Context

## Mission
Entry is a white-label events and ticketing platform. Today it powers FERAL's own events. The goal is to become a **"Shopify for Events"** — any promoter or artist can sell tickets, merch, and manage events under their own brand, with the platform taking a fee.

Everything built must serve that multi-tenant future. Every database query filters by `org_id`. Every feature must work for promoters who aren't FERAL.

**Current status:** Platform is in **controlled beta** (`BETA_MODE = true` in `lib/beta.ts`). Real promoters apply for access via invite codes. Signup → onboarding wizard → admin dashboard. Two major workstreams queued: multi-tenant isolation audit and Midnight theme visual redesign.

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
| Video | Mux (transcoding + streaming) | — |
| Error Monitoring | Sentry (@sentry/nextjs) | — |
| Fonts | Google Fonts CDN (Space Mono, Inter) | — |

## Project Structure

```
src/
├── instrumentation.ts         # Sentry init for Node.js + Edge runtimes, onRequestError hook
├── middleware.ts              # Auth, route protection, security headers, org_id resolution
├── app/
│   ├── layout.tsx             # Root layout (fonts, GTM, consent, scanlines, OrgProvider)
│   ├── page.tsx               # Landing page (/)
│   ├── global-error.tsx       # Global error boundary
│   ├── event/[slug]/          # Public event pages
│   │   ├── layout.tsx         # Server Component: fetches event + settings + branding → CSS vars
│   │   ├── page.tsx           # Routes to MidnightEventPage (default theme)
│   │   ├── checkout/page.tsx  # NativeCheckout (Stripe Elements)
│   │   ├── error.tsx          # Error boundary
│   │   └── loading.tsx        # Loading skeleton
│   ├── admin/                 # Admin dashboard (40+ pages). Sidebar groups: Dashboard, Events
│   │                          # (All Events, Artists, Guest List), Commerce (Orders, Customers,
│   │                          # Discounts, Merch, Storefront), Growth (Analytics, Reps,
│   │                          # Communications), Settings (Plan, Branding, General, Users,
│   │                          # Finance, Domains, Integrations).
│   │                          # Platform-owner-only "Entry Backend" section (overview, tenants,
│   │                          # health, connect, beta, platform-settings, plans) gated by
│   │                          # is_platform_owner flag.
│   │                          # Standalone pages (no sidebar): /admin/invite/[token],
│   │                          # /admin/signup/, /admin/beta/, /admin/onboarding/,
│   │                          # /admin/account/, /admin/payments/ (tenant Stripe Connect setup)
│   └── api/                   # ~200 HTTP handlers across 143 route files — see API Routes section
├── components/
│   ├── admin/                 # Admin reusable: ImageUpload, ArtistLineupEditor, TierSelector,
│   │   │                      # MerchImageGallery, SocialEmbed
│   │   ├── event-editor/      # Tabbed event editor (Details, Content, Design, Tickets, Settings)
│   │   │                      # + GroupManager (ticket group CRUD dialog)
│   │   ├── dashboard/         # ActivityFeed, FunnelChart, TopEventsTable, StripeConnectionBanner
│   │   └── reps/              # PlatformXPTab, QuestsTab, RewardsTab, SettingsTab, TeamTab
│   ├── midnight/              # Midnight theme (default): MidnightEventPage, MidnightHero,
│   │                          # MidnightTicketWidget, MidnightTicketCard, MidnightMerchModal,
│   │                          # MidnightSizeSelector, MidnightEventInfo, MidnightLineup,
│   │                          # MidnightArtistModal, MidnightCartSummary, MidnightCartToast,
│   │                          # MidnightTierProgression, MidnightFooter, MidnightSocialProof,
│   │                          # MidnightFloatingHearts, MidnightDiscountPopup,
│   │                          # MidnightAnnouncementPage (full-screen coming-soon),
│   │                          # MidnightAnnouncementWidget (sidebar fallback),
│   │                          # MidnightQueuePage (full-screen hype queue),
│   │                          # discount-utils.ts, tier-styles.ts
│   ├── aura/                  # Aura theme (DEPRECATED — being removed in favor of single
│   │                          # customizable theme). Still routed but no new work.
│   ├── event/                 # Shared: DiscountPopup, EngagementTracker, ThemeEditorBridge.
│   │                          # Old BEM components retained but no longer routed
│   ├── checkout/              # NativeCheckout, StripePaymentForm, ExpressCheckout,
│   │                          # OrderConfirmation, CheckoutTimer, CheckoutServiceUnavailable,
│   │                          # MarketingConsentCheckbox
│   ├── rep/                   # Rep portal shared: RadialGauge, EmptyState, SectionHeader,
│   │                          # ConfettiOverlay, LevelUpOverlay, WelcomeOverlay, QuestCard,
│   │                          # QuestDetailSheet, QuestSubmitSheet, InstallPrompt,
│   │                          # MuxVideoPreview, FullscreenVideo, RepPageError, CurrencyIcon
│   ├── landing/               # LandingPage, HeroSection, ParticleCanvas, EventsSection, etc.
│   ├── layout/                # Header, Footer, Scanlines, CookieConsent
│   ├── OrgProvider.tsx        # React context: useOrgId() for client-side org_id access
│   └── ui/                    # shadcn/ui (28 components — see Admin UI section)
├── hooks/
│   ├── useBranding.ts         # Org branding (module-level cache, single fetch)
│   ├── useSettings.tsx        # Settings context + realtime subscription
│   ├── useDashboardRealtime.ts # Dashboard live updates
│   ├── useMetaTracking.ts     # Meta Pixel + CAPI (consent-aware, stable refs)
│   ├── useDataLayer.ts        # GTM dataLayer push (stable refs)
│   ├── useTraffic.ts          # Supabase funnel tracking
│   ├── useCart.ts              # Cart state: quantities, merch sizes, totals, checkout redirect, sequential visibility
│   ├── useEventTracking.ts    # Unified event tracking: Meta + GTM + CAPI + traffic (stable refs)
│   ├── useHypeQueue.ts         # Hype queue: fake position/progress animation, localStorage gate, social proof
│   ├── useHeaderScroll.ts     # Header hide/show on scroll
│   ├── useScrollReveal.ts     # IntersectionObserver scroll animations
│   ├── useCountUp.ts          # Animated number counter (rep portal gauges)
│   ├── useCountdown.ts        # Countdown timer → { days, hours, mins, secs, passed }
│   ├── useOrgTimezone.ts      # Org timezone from {org_id}_general settings (fallback: browser → Europe/London)
│   ├── usePopupSettings.ts    # Fetches {org_id}_popup settings, exposes PopupSettings
│   └── useRepPWA.ts           # PWA install prompt for rep portal (iOS/Android/desktop detection)
├── lib/
│   ├── supabase/              # admin.ts (data), server.ts (auth only), client.ts (browser), middleware.ts
│   ├── stripe/                # client.ts (browser), server.ts (platform), config.ts (fees/currency)
│   ├── auth.ts                # requireAuth() → {user, orgId}, requireRepAuth(), getSession()
│   ├── org.ts                 # getOrgId() (server), getOrgIdFromRequest() (API routes)
│   ├── constants.ts           # ORG_ID (deprecated fallback), TABLES, key functions
│   ├── settings.ts            # fetchSettings (server), saveSettings (client)
│   ├── orders.ts, email.ts, email-templates.ts  # Order creation + email (Resend)
│   ├── pdf.ts, qr.ts, ticket-utils.ts, wallet-passes.ts  # Ticket delivery (PDF, QR, Apple/Google Wallet)
│   ├── ticket-visibility.ts    # Sequential release: getVisibleTickets(), getSequentialGroupTickets(), validateSequentialPurchase()
│   ├── discount-codes.ts, vat.ts, rate-limit.ts  # Pricing + security
│   ├── beta.ts                # BETA_MODE flag — controls invite-gated signup flow
│   ├── signup.ts              # Self-service signup: slugify(), validateSlug(), RESERVED_SLUGS, provisionOrg()
│   ├── plans.ts               # Platform plans: PLANS constant, getOrgPlan(), ensureStripePriceExists()
│   ├── themes.ts              # Theme system helpers (getActiveTemplate, etc.)
│   ├── timezone.ts            # Timezone utilities (TIMEZONES list, detect, format, UTC↔TZ conversion)
│   ├── vercel-domains.ts      # Vercel Domain API wrapper (add/remove/verify domains)
│   ├── mux.ts                 # Mux video client, getMuxStreamUrl(), getMuxThumbnailUrl()
│   ├── web-push.ts            # Web Push for rep portal (VAPID, rep_push_subscriptions table)
│   ├── checkout-guards.ts     # isRestrictedCheckoutEmail() — blocks known bot emails
│   ├── nicknames.ts           # generateNickname() — display names for anonymous popup leads
│   ├── rep-*.ts               # Rep program: attribution, emails, points, notifications, tiers, social, utils, quest-styles
│   ├── team-emails.ts         # Team invite emails via Resend (branded, fire-and-forget)
│   ├── sentry.ts              # Sentry utilities: org/user/event/checkout context, capturePaymentError, fetchSentryErrorSummary (for AI digest)
│   ├── payment-monitor.ts     # logPaymentEvent() — fire-and-forget append to payment_events
│   ├── payment-alerts.ts      # Resend alerts for payment failures (30min cooldown)
│   ├── payment-digest.ts      # AI payment digest (Claude Haiku analysis of payment health)
│   ├── platform-digest.ts     # AI platform health digest (whole-platform: Sentry + payments + funnel + infra)
│   ├── klaviyo.ts, meta.ts    # Marketing integrations
│   ├── date-utils.ts, image-utils.ts, merch-images.ts  # Utility helpers
│   └── utils.ts               # cn() helper (clsx + tailwind-merge)
├── types/                     # TypeScript types per domain (settings, events, orders, tickets, domains,
│                              # products, discounts, reps, email, analytics, marketing, team, artists)
└── styles/
    ├── base.css               # Reset, CSS variables, typography, reveal animations
    ├── effects.css            # CRT scanlines + noise texture overlays
    ├── header.css             # Header, navigation, mobile menu
    ├── landing.css            # Hero, events grid, about pillars, contact form
    ├── event.css              # Legacy: KompassEventPage + minimal theme only
    ├── midnight.css           # Midnight theme: Tailwind v4 tokens + scoped reset
    ├── midnight-effects.css   # Midnight effects: glass, metallic tiers, keyframes
    ├── hero-effects.css       # Hero section visual effects
    ├── aura.css               # Aura theme styles (DEPRECATED)
    ├── aura-effects.css       # Aura theme effects (DEPRECATED)
    ├── checkout-page.css      # Checkout + payment form
    ├── cookie.css             # Cookie consent banner
    ├── popup.css              # Discount popup
    ├── rep-effects.css        # Rep portal: gaming effects, animations, tier glows (~1,950 lines)
    ├── tailwind.css           # Tailwind v4 theme + utilities (admin only)
    └── admin.css              # Admin supplementary styles
```

---

## Architecture

### Error Monitoring (Sentry)
Three-layer monitoring: **Sentry** (platform-wide crash tracking + session replay), **Payment Monitor** (domain-specific payment health in `payment_events` table), **AI Digest** (Claude Haiku analysis combining both sources every 6h).

Sentry config: `sentry.client.config.ts` (browser), `sentry.server.config.ts` (Node), `sentry.edge.config.ts` (middleware). Auto-instruments API routes, server components, middleware. Client uses session replay (100% on error). Tunnel route `/api/monitoring` bypasses ad blockers.

Context enrichment: `setSentryOrgContext()` / `setSentryUserContext()` called automatically in `requireAuth()` / `requireRepAuth()`. `setSentryEventContext()` called in event layout. All errors tagged with `org_id` for multi-tenant filtering.

AI digest integration: `fetchSentryErrorSummary()` in `lib/sentry.ts` pulls top Sentry issues via API and feeds them into both the payment digest and the platform health digest.

**Platform Health Dashboard** (`/admin/backend/health/`): Whole-platform monitoring — aggregates Sentry errors (frontend + backend + all tenants), system health checks (Database, Payments), payment summary, and AI platform digest. Traffic-light status banner. Data: `/api/platform/platform-health`. AI analysis: `lib/platform-digest.ts` → `/api/platform/platform-digest`. Separate from payment-specific health at `/admin/backend/payment-health/`.

### Payment System (Stripe)
Dynamic event pages → `NativeCheckout` → `StripePaymentForm` + `ExpressCheckout` (Apple/Google Pay). PaymentIntent flow: create → confirm → webhook → order + tickets + email. Discounts validated server-side via `/api/discounts/validate`. Payment health monitored via `logPaymentEvent()` → `payment_events` table.

**External ticketing**: `payment_method: "external"` → `MidnightExternalPage` (hero + about + lineup + CTA to `external_link`, no checkout).

### Theme System
**Current:** Single theme — Midnight (default for all tenants). Customizable via branding system (colors, fonts, logo). The Aura theme exists in code but is **deprecated and being removed**. The future direction is one highly customizable theme, not multiple theme choices. Do not build features for Aura or create new theme variants.

**Routing:** `event/[slug]/page.tsx` → `payment_method === "external"` → `MidnightExternalPage` | default → `MidnightEventPage`. (Aura routing still exists in code but should not be extended.)

**Announcement mode**: When `isAnnouncement` is true (event has `tickets_live_at` in the future), `MidnightEventPage` renders `MidnightAnnouncementPage` — full-screen coming-soon with hero, countdown, email signup.

**Hype queue**: Optional fake queue between announcement and tickets. `queue_enabled` + `queue_window_minutes` of `tickets_live_at` → `MidnightQueuePage`. 100% client-side. `useHypeQueue` hook manages progress, social proof, localStorage. Admin config in event editor Settings tab. `?preview=tickets` bypasses both.

**Preview mode**: `?preview=tickets` query param shows ticket page for announcement events with amber banner.

### Sequential Ticket Release
Per-group setting: all tickets visible simultaneously or reveal one-at-a-time as each sells out. Pure computed state from `sold`/`capacity` — no cron. Config: `ticket_group_release_mode` in EventSettings JSONB. Logic in `lib/ticket-visibility.ts`. `useCart()` accepts `releaseConfig` to filter visible tickets. Server validates via `validateSequentialPurchase()` on payment-intent.

### Artist / Lineup System
Reusable artist profiles in `artists` table (name, bio, Instagram, image, Mux video). Linked to events via `event_artists` junction table with `sort_order`. Admin CRUD at `/admin/artists/`. Event lineup managed via `ArtistLineupEditor` component in event editor. `events.lineup` string array kept in sync as backward-compat fallback.

### Timezone System
`DateTimePicker` displays/edits in target timezone, stores UTC. `useOrgTimezone()` fetches org timezone. Conversion via `lib/timezone.ts`. Event editor wires timezone automatically.

### Stripe Connect (Multi-Tenant Payments)
Direct charges on connected accounts with application fee. Per-event routing: `event.stripe_account_id` → `{org_id}_stripe_account` → platform-only. Currency: GBP/EUR/USD, always smallest unit. Rate limited: 10/min/IP.

**Tenant self-service**: `/admin/payments/` page + `/api/stripe/connect/my-account` routes let tenants create and manage their own Stripe Connect account without platform owner intervention. Uses `@stripe/react-connect-js` embedded UI.

**Platform owner**: `/api/stripe/connect` (CRUD all accounts), gated by `requirePlatformOwner()`.

### Platform Plans (Fee Tiers)
**Starter** (free, 5% + £0.50 min) and **Pro** (£29/month, 2.5% + £0.30 min) in `lib/plans.ts`. Stored in `{org_id}_plan`. Tenant billing: `/api/billing/checkout` → Stripe Checkout → webhook.

### Beta Access & Signup Flow
`BETA_MODE = true` gates signup. Flow: `/admin/signup/` → checks invite code in sessionStorage → if none, redirects to `/admin/beta/` (application form) → platform owner reviews at `/admin/backend/beta/` → accept sends invite code email → promoter signs up with code → `/admin/onboarding/` wizard → admin dashboard.

Routes: `/api/beta/apply` (POST public), `/api/beta/verify-code` (POST public), `/api/beta/track-usage` (POST public), `/api/platform/beta-applications` (GET/POST platform owner), `/api/platform/invite-codes` (GET/POST platform owner).

To disable beta: set `BETA_MODE = false` in `lib/beta.ts`.

### Self-Service Signup (Promoter Registration)
`provisionOrg()` (`lib/signup.ts`): creates `org_users` (owner), `domains` (`{slug}.entry.events`), `site_settings` (Starter plan). Slug: `slugify()` → `[a-z0-9-]` (3-40 chars), `validateSlug()` checks ~50 reserved + collisions. Two auth paths: email/password or Google OAuth. Separate `/api/auth/provision-org` endpoint for onboarding wizard flow.

### Multi-Tenancy: Dynamic org_id Resolution
Every table has `org_id`. Every query filters by it. **Never hardcode `"feral"`**.

```
Request → Middleware resolves org_id → sets x-org-id header → downstream reads it
         ├─ Admin host + logged in → org_users lookup (user.id → org_id)
         ├─ Tenant host → domains table lookup (hostname → org_id)
         └─ Fallback → "feral"
```

**Domain routing:** `admin.entry.events` = admin host. `{slug}.entry.events` = tenant subdomain. Custom domains from `domains` table. `localhost`/`*.vercel.app` = dev.

**Access patterns:** Server: `getOrgId()`. Auth API: `auth.orgId`. Public API: `getOrgIdFromRequest(request)`. Client: `useOrgId()`. Middleware caches (60s TTL).

### White-Label Branding System
Org branding in `{org_id}_branding`: logo, org name, colors, fonts, copyright. Event layout injects CSS vars server-side (no FOUC). Client: `useBranding()`. API: `GET/POST /api/branding`. Branding page syncs logo to email settings.

### Settings System
**Settings keys** (stored in `site_settings` table as key → JSONB, dynamic via helpers in `lib/constants.ts`):
| Key pattern | Helper | Purpose |
|-------------|--------|---------|
| `{org_id}_general` | — | Org general settings (name, timezone, support email) |
| `{org_id}_branding` | `brandingKey()` | Org branding (logo, colors, fonts) |
| `{org_id}_themes` | `themesKey()` | Theme store (active template, configs) |
| `{org_id}_vat` | `vatKey()` | VAT configuration |
| `{org_id}_homepage` | `homepageKey()` | Homepage settings |
| `{org_id}_reps` | `repsKey()` | Reps program settings |
| `{org_id}_abandoned_cart_automation` | `abandonedCartAutomationKey()` | Abandoned cart email automation |
| `{org_id}_announcement_automation` | `announcementAutomationKey()` | Announcement email sequence (4-step) |
| `{org_id}_popup` | `popupKey()` | Popup settings |
| `{org_id}_marketing` | `marketingKey()` | Meta Pixel + CAPI settings |
| `{org_id}_email` | `emailKey()` | Email template settings |
| `{org_id}_wallet_passes` | `walletPassesKey()` | Wallet pass configuration |
| `{org_id}_events_list` | `eventsListKey()` | Events list configuration |
| `{org_id}_stripe_account` | `stripeAccountKey()` | Stripe Connect account (fallback) |
| `{org_id}_plan` | `planKey()` | Platform plan (Starter/Pro) + subscription status |
| `{org_id}_onboarding` | `onboardingKey()` | Onboarding wizard data (event_types, experience_level) |
| `platform_stripe_billing` | `platformBillingKey()` | Stripe Product + Price IDs for Pro plan billing |
| `platform_payment_digest` | — | Latest AI payment health digest (generated every 6h) |
| `platform_beta_applications` | — | Beta applicant records (JSONB array) |
| `platform_beta_invite_codes` | — | Invite code records with usage tracking |
| `entry_platform_xp` | — | Platform-wide XP/level config for rep program |

### Request Flow (Event Pages)
`/event/[slug]/` → Middleware (org_id) → RootLayout (`<OrgProvider>`) → EventLayout (Server Component: event + settings + branding + template in parallel, CSS vars + `data-theme`) → `MidnightEventPage`.

### Caching Strategy
Event + admin: `force-dynamic`, `cache: "no-store"`. Media: `max-age=31536000, immutable`. Apple Pay: `max-age=86400`.

### Authentication & Security

**Two auth systems:** Admin (`/admin/*` + `/api/*`, `requireAuth()`) and Rep portal (`/rep/*` + `/api/rep-portal/*`, `requireRepAuth()`).

**Role flags** (Supabase `app_metadata`, additive): `is_admin`, `is_rep`, `is_platform_owner` (manual SQL). Dual-role supported.

**Auth helpers** (`lib/auth.ts`): `requireAuth()` → `{ user, orgId }`. `requireRepAuth()` → `{ rep }`. `requirePlatformOwner()` → `{ user, orgId }`. Two layers: middleware blocks at edge, then handler verifies role.

**Public API routes (no auth):** Stripe (`payment-intent`, `confirm-order`, `webhook`, `account`, `apple-pay-verify`), `checkout/capture`, `checkout/error`, `GET events|settings|merch|branding|themes|media/[key]|health`, `POST track|meta/capi|discounts/validate|popup/capture`, `/api/cron/*` (CRON_SECRET), `/api/unsubscribe`, `orders/[id]/wallet/*`, rep auth routes, `auth/*`, `beta/*`, `/api/team/accept-invite`.

**Rules for new routes:**
1. Admin API routes: call `requireAuth()`, use `auth.orgId` for all queries
2. Rep portal API routes: call `requireRepAuth()`, use `rep.org_id` for all queries
3. Platform-owner API routes: call `requirePlatformOwner()`, use `auth.orgId`
4. Public API routes: use `getOrgIdFromRequest(request)` from `@/lib/org`, add to `PUBLIC_API_PREFIXES` or `PUBLIC_API_EXACT_GETS` in `middleware.ts`
5. **Never import `ORG_ID`** — use dynamic resolution
6. Never hardcode secrets — use environment variables only
7. Stripe webhook must always verify signatures in production

---

## Database (Supabase)

### Tables
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `site_settings` | Key-value config store (JSONB) | key, data, updated_at |
| `events` | Event definitions | slug, name, venue_*, date_*, status, payment_method, currency, stripe_account_id, about_text, lineup, details_text, tag_line, doors_time, cover_image, hero_image, external_link, tickets_live_at, announcement_title/subtitle, queue_enabled/duration_seconds/window_minutes/title/subtitle, vat_registered/rate/prices_include/number |
| `ticket_types` | Ticket pricing/inventory | event_id, name, price, capacity, sold, tier, includes_merch, merch_name/description/images, product_id, status |
| `products` | Standalone merch catalog | name, type, sizes[], price, images, status, sku |
| `orders` | Purchase records | order_number (FERAL-XXXXX), event_id, customer_id, status, subtotal, fees, total, payment_ref |
| `order_items` | Line items per order | order_id, ticket_type_id, qty, unit_price, merch_size |
| `tickets` | Individual tickets with QR | ticket_code (FERAL-XXXXXXXX), order_id, status, holder_*, scanned_at/by |
| `customers` | Customer profiles | email, first/last_name, total_orders/spent, marketing_consent (bool/null), marketing_consent_at/source |
| `artists` | Reusable artist profiles | name, description, instagram_handle, image, video_url |
| `event_artists` | Junction: events ↔ artists | event_id, artist_id, sort_order |
| `guest_list` | Manual guest entries | event_id, name, email, qty, checked_in/at |
| `discounts` | Discount codes | code, type, value, max_uses, used_count, applicable_event_ids[], starts_at, expires_at |
| `abandoned_carts` | Checkout abandonment + recovery | customer_id, event_id, email, items (jsonb), status, cart_token (UUID) |
| `traffic_events` | Funnel tracking | event_type, page_path, session_id, referrer, utm_* |
| `org_users` | Team members + invites | auth_user_id, email, role (owner/member), perm_*, status, invite_token |
| `domains` | Hostname → org_id mapping | hostname (unique), org_id, is_primary, type, status, verification_* |
| `popup_events` | Popup interaction tracking | event_type, email, city, country |
| `payment_events` | Payment health log (append-only) | type, severity, event_id, stripe_*, error_*, metadata (jsonb), resolved, resolution_notes |
| `event_interest_signups` | Coming-soon signups + email automation | event_id, customer_id, email, notification_count (0-4), unsubscribe_token |

**Reps Program** (11 tables): `reps` (+ `email_verified`, `email_verification_token`), `rep_events`, `rep_rewards`, `rep_milestones`, `rep_points_log`, `rep_quests`, `rep_quest_submissions`, `rep_reward_claims`, `rep_event_position_rewards`, `rep_notifications`, `rep_push_subscriptions` (web push endpoints). All have `org_id`. Types in `src/types/reps.ts`.

**Database RPCs**: `claim_reward_atomic()` (atomic points deduction + claim creation), `reverse_rep_attribution()` (reverses rep stats on refund), `get_rep_program_stats()` (aggregate stats without full fetch).

### Key Constraints
- `orders.order_number` — unique, format `FERAL-XXXXX` (sequential, padded)
- `tickets.ticket_code` — unique, format `FERAL-XXXXXXXX` (random, crypto-safe)
- `orders.payment_ref` — used for idempotency (Stripe PaymentIntent ID)
- `products.product_id` on `ticket_types` — FK to `products` table (ON DELETE SET NULL)
- `uq_rep_quest_pending_approved` — prevents duplicate quest submissions per rep
- All tables have `org_id` column

### Supabase Client Rules (CRITICAL — Data Access)
Wrong client → silent data loss (empty arrays when RLS blocks). **`getSupabaseAdmin()`** = ALL data queries (service role, bypasses RLS). **`getSupabaseServer()`** = auth ONLY (`requireAuth`, `getSession`). **`getSupabaseClient()`** = browser-side only (realtime, client reads, subject to RLS). Never create raw `createClient()` with anon key server-side.

### External Service Changes Rule (CRITICAL)
MCP access: **Supabase** (schema, queries, migrations) + **Vercel** (deployments, logs). Use MCP directly — NEVER give user SQL to run. **Stripe** has no MCP — tell user to use dashboard. If MCP token expired, tell user to run `/mcp`. Never hardcode secrets. Document changes in this file. Never assume table/column exists unless documented here.

---

## API Routes (~200 handlers, 143 route files)

### Critical Path (Payment → Order)
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/stripe/payment-intent` | Create PaymentIntent (validates tickets + sequential release, applies discounts + VAT, rate limited) |
| POST | `/api/stripe/confirm-order` | Verify payment → create order + tickets + email confirmation |
| POST | `/api/checkout/capture` | Upsert customer + abandoned cart on checkout email capture |
| POST | `/api/checkout/error` | Report client-side checkout errors to payment monitor |
| POST | `/api/stripe/webhook` | Handle payment_intent.succeeded/failed + subscription lifecycle |
| GET | `/api/stripe/account` | Get connected Stripe account ID for checkout |

### Orders & Tickets
`/api/orders` (GET/POST), `/api/orders/[id]` (GET), `/api/orders/[id]/refund` (POST), `/api/orders/[id]/resend-email` (POST), `/api/orders/[id]/rep-info` (GET — rep attribution for refund warning), `/api/orders/[id]/pdf` (GET), `/api/orders/[id]/wallet/apple|google` (GET), `/api/orders/export` (GET CSV), `/api/tickets/[code]` (GET validate), `/api/tickets/[code]/scan` (POST), `/api/tickets/[code]/merch` (POST)

### Standard CRUD Groups
| Group | Routes | Operations |
|-------|--------|------------|
| Events | `/api/events`, `/api/events/[id]`, `/api/events/[id]/artists` | GET/POST/PUT/DELETE + ticket types + artist lineup |
| Artists | `/api/artists`, `/api/artists/[id]` | GET/POST/PUT/DELETE |
| Merch | `/api/merch`, `/api/merch/[id]`, `/api/merch/[id]/linked-tickets` | GET/POST/PUT/DELETE |
| Customers | `/api/customers` | GET (list + search) |
| Guest List | `/api/guest-list`, `/api/guest-list/[eventId]` | POST/GET/PUT/DELETE |
| Discounts | `/api/discounts`, `/api/discounts/[id]`, `/api/discounts/validate`, `/api/discounts/seed` | GET/POST/PUT/DELETE + public validate |
| Settings | `/api/settings`, `/api/branding`, `/api/themes` | GET/POST |

### Other Route Groups
- **Abandoned Cart Recovery**: `/api/abandoned-carts` (list + stats), `/api/abandoned-carts/preview-email`, `/api/abandoned-carts/send-test`, `/api/cron/abandoned-carts` (Vercel cron), `/api/unsubscribe` (supports `type=cart_recovery` and `type=announcement`)
- **Account**: `/api/account` (GET/PUT — current user profile, password management)
- **Announcement / Coming Soon**: `/api/announcement/signup` (POST public), `/api/announcement/signups` (GET admin), `/api/announcement/preview-email` (GET admin), `/api/cron/announcement-emails` (cron 5min — steps 2-4)
- **Beta Access** (public): `/api/beta/apply` (POST, 5/hr), `/api/beta/verify-code` (POST, 10/5min), `/api/beta/track-usage` (POST)
- **Billing** (tenant — `requireAuth()`): `/api/billing/checkout` (POST), `/api/billing/portal` (POST), `/api/billing/status` (GET)
- **Email & Wallet** (admin): `/api/email/status` (GET), `/api/email/test` (POST), `/api/wallet/status` (GET)
- **Mux Video** (admin): `/api/mux/upload` (POST — create Mux asset from URL), `/api/mux/status` (GET — poll processing status)
- **Popup** (public + admin): `/api/popup/capture` (POST public — email capture + customer upsert), `/api/popup/leads` (GET admin)
- **Stripe Connect — Platform Owner** (`requirePlatformOwner()`): `/api/stripe/connect` (CRUD), `/api/stripe/connect/[accountId]/onboarding`, `/api/stripe/apple-pay-domain`, `/api/stripe/apple-pay-verify`
- **Stripe Connect — Tenant** (`requireAuth()`): `/api/stripe/connect/my-account` (GET/POST), `/api/stripe/connect/my-account/onboarding` (GET/POST)
- **Platform Dashboard** (`requirePlatformOwner()`): `/api/platform/dashboard`, `/api/platform/tenants`, `/api/platform/tenants/[orgId]`
- **Platform Beta** (`requirePlatformOwner()`): `/api/platform/beta-applications` (GET/POST), `/api/platform/invite-codes` (GET/POST)
- **Platform XP Config** (`requirePlatformOwner()`): `/api/platform/xp-config` (GET/POST)
- **Platform Health** (`requirePlatformOwner()`): `/api/platform/platform-health` (GET — aggregates Sentry errors + system checks + payment summary), `/api/platform/platform-digest` (GET/POST — AI whole-platform health digest)
- **Payment Health** (`requirePlatformOwner()`): `/api/platform/payment-health` (GET), `/api/platform/payment-health/[id]/resolve` (POST), `/api/platform/payment-health/resolve-all` (POST). Cron: `/api/cron/stripe-health` (30min)
- **AI Payment Digest** (`requirePlatformOwner()`): `/api/platform/payment-digest` (GET/POST). Cron: `/api/cron/payment-digest` (6h)
- **Plans** (`requirePlatformOwner()`): `/api/plans` (GET/POST)
- **Reps Program** (~42 routes): `/api/reps/*` (admin CRUD, settings, stats), `/api/rep-portal/*` (rep-facing — auth, dashboard, sales, quests, rewards, notifications, push, upload, verify-email)
- **Team Management**: `/api/team` (GET/POST — owner only), `/api/team/[id]` (PUT/DELETE), `/api/team/[id]/resend-invite`, `/api/team/accept-invite` (public)
- **Domain Management**: `/api/domains` (GET/POST), `/api/domains/[id]` (PUT/DELETE), `/api/domains/[id]/verify`
- **Self-Service Auth** (public): `/api/auth/signup` (POST), `/api/auth/check-slug` (GET), `/api/auth/check-org` (GET), `/api/auth/provision-org` (POST), `/api/auth/login`, `/api/auth/logout`, `/api/auth/recover`
- **Uploads**: `/api/upload` (POST base64), `/api/upload-video` (POST — signed Supabase Storage URL for large files, bucket: `artist-media`)
- **Tracking & Analytics**: `/api/track`, `/api/meta/capi`, `/api/admin/dashboard`, `/api/admin/orders-stats`
- **Other**: `/api/media/[key]`, `/api/health`

---

## Hooks (Patterns & Rules)

### Referential Stability (CRITICAL)
Hooks returning objects/functions as effect deps MUST use `useMemo`. **Stable ref hooks (do NOT break):** `useMetaTracking()`, `useDataLayer()`, `useEventTracking()`, `useSettings()`, `useBranding()`, `useDashboardRealtime()`. Destructure callbacks as deps — never use the whole object.

### Consent + Module State
`useMetaTracking` checks `feral_cookie_consent` localStorage for `marketing: true`. Both `useMetaTracking` and `useBranding` persist state at module scope — tests must account for this.

---

## Environment Variables

**Required**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)
**Payments**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
**Selling path**: `RESEND_API_KEY` (emails), `NEXT_PUBLIC_SITE_URL` (used in emails, PDFs, CAPI)
**Cron**: `CRON_SECRET` (Vercel cron auth, set automatically)
**Optional**: `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_KLAVIYO_LIST_ID`, `NEXT_PUBLIC_KLAVIYO_COMPANY_ID` (all have fallbacks)
**Video**: `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` (Mux video transcoding for artist profiles)
**Push notifications**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (web push for rep portal)
**Wallet passes**: `APPLE_PASS_CERTIFICATE`, `APPLE_PASS_CERTIFICATE_PASSWORD`, `APPLE_WWDR_CERTIFICATE`, `APPLE_PASS_TYPE_IDENTIFIER`, `APPLE_PASS_TEAM_IDENTIFIER`, `GOOGLE_WALLET_SERVICE_ACCOUNT_KEY`, `GOOGLE_WALLET_ISSUER_ID`
**Domain management**: `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`
**Monitoring**: `PLATFORM_ALERT_EMAIL` (payment/health alerts), `ANTHROPIC_API_KEY` (AI payment digest — optional), `NEXT_PUBLIC_SENTRY_DSN` (Sentry error tracking), `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` (source map upload + API access)

---

## Testing

### Setup
- **Framework**: Vitest + @testing-library/react (jsdom)
- **Config**: `vitest.config.ts` — path aliases, jsdom, setup file
- **Setup**: `src/__tests__/setup.ts` — localStorage mock, crypto.randomUUID mock, jest-dom
- **Run**: `npm test` (single run) or `npm run test:watch` (watch mode)

### Test Suites (12 suites)
`auth`, `signup`, `useMetaTracking`, `useDataLayer`, `useDashboardRealtime`, `useTraffic`, `wallet-passes`, `products`, `orders`, `rate-limit`, `rep-deletion`, `vat`

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
2. **Google Ads + TikTok tracking** — placeholders exist in marketing admin but no implementation
3. **Supabase RLS policies** — should be configured to enforce org_id isolation at database level
4. **Cron multi-org** — `/api/cron/*` routes still use `ORG_ID` fallback. Should iterate over all orgs
5. **Aura theme removal** — Aura components and routing still in code, pending removal. Single customizable theme is the target

---

## Design System

### Platform Brand (Entry — Admin)
- **Primary**: `#8B5CF6` (Electric Violet)
- **Gradient**: `linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)`
- The Entry wordmark, login page, admin buttons, and active states all use Electric Violet

### Public Event Pages (Tenant-Configurable)
Defaults in `base.css :root`, overridable per-tenant via branding:
```css
--accent: #ff0033;        --bg-dark: #0e0e0e;       --card-bg: #1a1a1a;
--card-border: #2a2a2a;   --text-primary: #fff;      --text-secondary: #888;
--text-muted: #555;       --font-mono: 'Space Mono'; --font-sans: 'Inter';
```
`midnight.css` maps these to Tailwind semantic tokens so `bg-background`, `text-primary`, `border-border` reflect tenant branding.

- **Midnight visual identity**: Cyberpunk — glassmorphism, metallic tier gradients, CRT suppression, red glow accents. **Note**: A ground-up redesign ("Modern Editorial Luxury") is planned — see `MIDNIGHT-REDESIGN-PROMPT.md`
- **Mobile-first**: Most ticket buyers are on phones — design for 375px, enhance up

---

## CSS Architecture

### CSS Areas
| Area | CSS System | Entry Point |
|------|-----------|-------------|
| Public site (landing, legacy) | Hand-written CSS (`base.css`, `header.css`) | `app/layout.tsx` |
| Event pages: Midnight | Tailwind v4 + effects layer (`midnight.css`, `midnight-effects.css`, `hero-effects.css`) | Imported by `MidnightEventPage` |
| Admin dashboard (`/admin/*`) | Tailwind v4 + shadcn/ui utilities | `app/admin/layout.tsx` via `tailwind.css` |
| Rep portal (`/rep/*`) | Tailwind v4 + shadcn/ui + effects (`rep-effects.css`) | `app/rep/layout.tsx` |

**Isolation mechanism**: Admin layout renders `<div data-admin>`. All Tailwind preflight resets are scoped to `[data-admin]` via `@layer admin-reset`. Event themes scoped via `[data-theme="themename"]`. Rep portal scoped via `[data-rep]`.

### CSS Layer Rules (DO NOT BREAK)
Layers: `@layer theme, admin-reset;` then `@import "tailwindcss/utilities"` **UNLAYERED** (intentional — wins over `base.css` global `*` reset). **NEVER** add `layer(utilities)` or global `*` resets that override Tailwind.

### Rules for New CSS
1. Component-level imports. Event themes scoped via `[data-theme="themename"]`
2. Landing/legacy: hand-written BEM. Breakpoints: `1024px` / `768px` / `480px`

---

## Event Theme Architecture (Public-Facing UI)

Event pages are the revenue-generating surface — where ticket buyers browse, explore, and purchase. The Midnight theme is the primary (and soon only) theme.

### Midnight Component Pattern
Lives in `src/components/midnight/`. Orchestrator `MidnightEventPage` imports CSS. Children don't.

Key components: `MidnightEventPage` (orchestrator), `MidnightHero` (banner + CTA), `MidnightTicketWidget` (ticket selection + cart), `MidnightTicketCard` (tier with qty controls), `MidnightMerchModal` (image gallery + size selector), `MidnightSizeSelector`, `MidnightEventInfo` (about/details/venue), `MidnightLineup`, `MidnightArtistModal`, `MidnightCartSummary`, `MidnightCartToast`, `MidnightTierProgression`, `MidnightFooter`, `MidnightSocialProof`, `MidnightFloatingHearts`, `MidnightDiscountPopup`, `MidnightAnnouncementPage`, `MidnightQueuePage`. Helpers: `discount-utils.ts`, `tier-styles.ts`.

### Rules for Event Theme Components
1. **Tailwind + shadcn/ui** for layout/interactive elements. Effects CSS in `midnight-effects.css`, tokens in `midnight.css`
2. **Scope** to `[data-theme="midnight"]`. Mobile-first (375px). Support `prefers-reduced-motion`
3. **Shared hooks**: `useCart()`, `useEventTracking()`, `useSettings()`, `useBranding()`, `useHeaderScroll()`
4. **CSS imports at orchestrator level** — `MidnightEventPage` imports CSS. Children don't

---

## Rep Portal Architecture (Social App)

The rep portal (`/rep/*`) is the brand ambassador / street team app. Currently at 12 page routes with its own layout, auth system (`requireRepAuth()`), PWA support, web push notifications, and API routes (`/api/rep-portal/*`).

### Rep Portal Pages (12)
Dashboard (`/rep`), Sales, Quests, Rewards, Points, Leaderboard, Profile, Login, Join, Invite/[token], Verify-email. Auth separate from admin.

### CSS Architecture
Tailwind + shadcn/ui + admin tokens. Gaming effects in `rep-effects.css` (~1,950 lines, scoped to `[data-rep]`). Shared components in `src/components/rep/`. Utilities: `lib/rep-tiers.ts`, `lib/rep-social.ts`, `lib/rep-utils.ts`, `lib/rep-quest-styles.ts`, `hooks/useCountUp.ts`, `hooks/useRepPWA.ts`.

### Rules for New Rep Portal Pages
1. **shadcn/ui + Tailwind** — Card, Button, Badge, etc. Admin design tokens. No new `--rep-*` CSS vars
2. **Gaming effects only in `rep-effects.css`** — applied via class names, not inline styles
3. **Mobile-first** (375px). Auth: `requireRepAuth()`. Layout handles email verification + pending review gates

---

## Shared UI Primitives (shadcn/ui)

### shadcn/ui Components
**Location**: `src/components/ui/*.tsx` (28 components) — used by admin pages AND event themes

Alert, Avatar, Badge, Button, Calendar, Card, Collapsible, ColorPicker, DatePicker, Dialog, Input, Label, LiveIndicator, LiveStatCard, NativeSelect, Popover, Progress, Select, Separator, Skeleton, Slider, StatCard, Switch, Table, Tabs, Textarea, Tooltip, TrendBadge

**How to add new shadcn components**: Create in `src/components/ui/`, use Radix UI primitives (`radix-ui` package), use `cn()` from `@/lib/utils` for className merging. Follow existing component patterns.

### Admin Design Tokens
Defined in `tailwind.css` via `@theme inline {}`. Key tokens: `background` (#08080c), `foreground` (#f0f0f5), `primary` (#8B5CF6), `card` (#111117), `secondary` (#151520), `muted-foreground` (#8888a0), `border` (#1e1e2a), `destructive` (#F43F5E), `success` (#34D399), `warning` (#FBBF24), `info` (#38BDF8). Sidebar variants: `sidebar` (#0a0a10), `sidebar-foreground` (#8888a0), `sidebar-accent` (#141420), `sidebar-border` (#161624).

Use via Tailwind classes — never hardcode hex. Custom utilities: `.glow-primary`, `.glow-success`, `.glow-warning`, `.glow-destructive`, `.text-gradient`, `.surface-noise`

### Rules for New Admin Pages
1. `"use client"` — shadcn/ui + Tailwind + design tokens (`bg-background`, `text-foreground`, `border-border`)
2. Settings: fetch from `site_settings`, save via `/api/settings`. Uploads: POST base64 to `/api/upload`

---

## Document Maintenance

1. **Read this file fully at the start of every session** — it is the single source of truth for the platform architecture
2. **Update it after any architecture change**, new module, new database table, or new API route group
3. **Delete deprecated references immediately** — never leave dead code documented
4. **Keep it under 40K characters** — if approaching the limit, compress verbose sections rather than removing useful information
5. **Scale detail to complexity** — simple things get one line, complex systems get diagrams or tables
6. **This file is the map.** If something isn't documented here, Claude won't know it exists. If something is documented wrong, Claude will build on broken assumptions
