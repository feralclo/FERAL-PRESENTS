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
├── middleware.ts              # Auth, route protection, security headers, org_id resolution
├── app/
│   ├── layout.tsx             # Root layout (fonts, GTM, consent, scanlines, OrgProvider)
│   ├── page.tsx               # Landing page (/)
│   ├── global-error.tsx       # Global error boundary
│   ├── event/[slug]/          # Public event pages
│   │   ├── layout.tsx         # Server Component: fetches event + settings + branding → CSS vars
│   │   ├── page.tsx           # Routes to MidnightEventPage (default) or AuraEventPage
│   │   ├── checkout/page.tsx  # NativeCheckout (Stripe Elements)
│   │   ├── error.tsx          # Error boundary
│   │   └── loading.tsx        # Loading skeleton
│   ├── admin/                 # Admin dashboard (25+ pages). Sidebar groups: Dashboard, Events,
│   │                          # Commerce, Storefront, Analytics, Marketing, Settings (incl. Users, Domains).
│   │                          # Platform-owner-only "Entry Backend" section (overview dashboard, tenants,
│   │                          # health, connect, platform-settings, plans) gated by is_platform_owner flag.
│   │                          # /admin/invite/[token] — standalone invite acceptance page (no auth).
│   │                          # /admin/signup/ — self-service promoter registration (no auth).
│   └── api/                   # 99 endpoints — see API Routes section for full list
├── components/
│   ├── admin/                 # Admin reusable: ImageUpload, LineupTagInput, TierSelector
│   │   ├── event-editor/      # Tabbed event editor (Details, Content, Design, Tickets, Settings)
│   │   └── dashboard/         # ActivityFeed, FunnelChart, TopEventsTable, StripeConnectionBanner
│   ├── aura/                  # Aura theme components (full event page + checkout variant)
│   ├── midnight/              # Midnight theme (default): MidnightEventPage, MidnightHero,
│   │                          # MidnightTicketWidget, MidnightTicketCard, MidnightMerchModal,
│   │                          # MidnightBottomBar, MidnightEventInfo, MidnightLineup,
│   │                          # MidnightCartSummary, MidnightTierProgression, MidnightFooter,
│   │                          # MidnightSocialProof, MidnightFloatingHearts,
│   │                          # MidnightAnnouncementPage (full-screen coming-soon),
│   │                          # MidnightAnnouncementWidget (sidebar fallback),
│   │                          # MidnightQueuePage (full-screen hype queue)
│   ├── event/                 # Shared: DiscountPopup, EngagementTracker, ThemeEditorBridge.
│   │                          # Old BEM components (DynamicEventPage, EventHero, TeeModal,
│   │                          # KompassEventPage) retained but no longer routed
│   ├── checkout/              # NativeCheckout, StripePaymentForm, ExpressCheckout,
│   │                          # OrderConfirmation, OrderSummary, CheckoutTimer, LoadingScreen
│   ├── rep/                   # Rep portal shared: RadialGauge, EmptyState, HudSectionHeader,
│   │                          # ConfettiOverlay, LevelUpOverlay, TikTokIcon
│   ├── landing/               # LandingPage, HeroSection, ParticleCanvas, EventsSection, etc.
│   ├── layout/                # Header, Footer, Scanlines, CookieConsent
│   ├── OrgProvider.tsx        # React context: useOrgId() for client-side org_id access
│   └── ui/                    # shadcn/ui (27 components — see Admin UI section)
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
│   └── useOrgTimezone.ts      # Org timezone from {org_id}_general settings (fallback: browser → Europe/London)
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
│   ├── signup.ts              # Self-service signup: slugify(), validateSlug(), RESERVED_SLUGS, provisionOrg()
│   ├── plans.ts               # Platform plans: PLANS constant, getOrgPlan(), getOrgPlanSettings(), ensureStripePriceExists(), updateOrgPlanSettings()
│   ├── themes.ts              # Theme system helpers (getActiveTemplate, etc.)
│   ├── timezone.ts            # Timezone utilities (TIMEZONES list, detect, format, UTC↔TZ conversion)
│   ├── vercel-domains.ts      # Vercel Domain API wrapper (add/remove/verify domains)
│   ├── rep-*.ts               # Rep program: attribution, emails, points, notifications
│   ├── team-emails.ts         # Team invite emails via Resend (branded, fire-and-forget)
│   ├── klaviyo.ts, meta.ts    # Marketing integrations
│   └── utils.ts               # cn() helper (clsx + tailwind-merge)
├── types/                     # TypeScript types per domain (settings, events, orders, tickets, domains,
│                              # products, discounts, reps, email, analytics, marketing, team)
└── styles/
    ├── base.css               # Reset, CSS variables, typography, reveal animations
    ├── effects.css            # CRT scanlines + noise texture overlays
    ├── header.css             # Header, navigation, mobile menu
    ├── landing.css            # Hero, events grid, about pillars, contact form
    ├── event.css              # Legacy: KompassEventPage + minimal theme only
    ├── midnight.css           # Midnight theme: Tailwind v4 tokens + scoped reset
    ├── midnight-effects.css   # Midnight effects: glass, metallic tiers, keyframes
    ├── aura.css               # Aura theme styles
    ├── aura-effects.css       # Aura theme effects
    ├── checkout-page.css      # Checkout + payment form
    ├── cookie.css             # Cookie consent banner
    ├── popup.css              # Discount popup
    ├── rep-effects.css        # Rep portal: gaming effects, animations, tier glows (~1,950 lines)
    ├── tailwind.css           # Tailwind v4 theme + utilities (admin only)
    └── admin.css              # Admin supplementary styles
```

---

## Architecture

### Payment System (Stripe)
Dynamic event pages → `NativeCheckout`/`AuraCheckout` → `StripePaymentForm` + `ExpressCheckout` (Apple/Google Pay). PaymentIntent flow: create → confirm → webhook → order + tickets + email. Discounts validated server-side via `/api/discounts/validate`.

**External ticketing**: `payment_method: "external"` → `MidnightExternalPage` (hero + about + lineup + CTA to `external_link`, no checkout).

### Theme-Based Routing
`event/[slug]/page.tsx` → `payment_method === "external"` → `MidnightExternalPage` | `getActiveTemplate()` from `{org_id}_themes` → `"aura"` → `AuraEventPage` | default `"midnight"` → `MidnightEventPage`. Preview via `?editor=1&template=aura`. Theme store: `/admin/ticketstore/`.

**Announcement mode**: When `isAnnouncement` is true (event has `tickets_live_at` in the future), `MidnightEventPage` does an early return rendering `MidnightAnnouncementPage` — a full-screen immersive coming-soon page with hero background, glassmorphic card, live countdown, and email signup. The old sidebar `MidnightAnnouncementWidget` is retained as fallback but no longer routed in the default flow.

**Hype queue**: Optional fake queue experience between announcement and tickets. When `queue_enabled` is true on the event, and the current time is within `queue_window_minutes` of `tickets_live_at`, visitors see a full-screen queue page (Midnight: `MidnightQueuePage`, Aura: inline `AuraQueuePage` widget). 100% client-side — no backend queue. `useHypeQueue` hook manages progress (non-linear easing), animated position counter, social proof messages, anxiety flashes, and localStorage for refresh safety + skip-on-return. Queue duration configurable (15–120s, default 45s), active window configurable (15–120min, default 60min). State logic in `getQueueState()` (`lib/announcement.ts`). Admin config in event editor Settings tab under "Ticket Sales Timing". `?preview=tickets` bypasses both announcement and queue.

**Preview mode**: Admin can preview ticket pages for announcement events via `?preview=tickets` query param. Both `MidnightEventPage` and `AuraEventPage` read this param on mount and skip the announcement and queue early-returns, showing an amber "Preview Mode" banner instead. The `EventEditorHeader` renders a split preview button when the event is in announcement mode — left side opens the announcement page, chevron dropdown offers "Announcement Page" and "Ticket Page" options.

### Sequential Ticket Release
Per-group setting controlling whether all tickets show simultaneously or reveal one-at-a-time as each sells out. Pure computed state from existing `sold`/`capacity` columns — no cron or background workers.

**Config**: `ticket_group_release_mode` in `EventSettings` (`site_settings` JSONB). Key = group name or `"__ungrouped__"` for ungrouped tickets. Values: `"all"` (default, show all active) or `"sequential"` (reveal one at a time). A ticket is "sold out" when `capacity != null && sold >= capacity`.

**Visibility logic** (`lib/ticket-visibility.ts`):
- `getVisibleTickets(ticketTypes, groupMap, releaseMode)` — returns only visible tickets. Sequential groups: all sold-out tickets + first non-sold-out ticket per group. "All" groups: all active tickets
- `getSequentialGroupTickets(ticketTypes, groupName, groupMap)` — returns ALL tickets in a group (for progression bar roadmap)
- `validateSequentialPurchase(ticketType, allTypes, groupMap, releaseMode)` — server-side: returns error string if preceding tickets aren't sold out

**Integration points**:
- `useCart()` accepts optional `releaseConfig: { groupMap, releaseMode }` → filters `activeTypes` through `getVisibleTickets()`
- `AuraTicketWidget` filters its own `activeTypes` via `getVisibleTickets()` when `ticketGroupReleaseMode` prop is set
- `MidnightTicketWidget` renders `MidnightTierProgression` per sequential named group (shows full roadmap including hidden tickets)
- `payment-intent` route loads event settings, calls `validateSequentialPurchase()` per cart item → 400 if ticket not yet revealed

**Admin UI** (event editor Tickets tab):
- `GroupHeader` — release mode dropdown ("All at once" / "Sequential release") per named group, with info line
- `TicketsTab` — release mode selector for ungrouped tickets (shown when 2+), computes `waitingForMap` for sequential tickets
- `TicketCard` — Lock icon + "Queued" badge when waiting on a preceding ticket; capacity warning when sequential group has unlimited capacity

### Timezone System
Admin date pickers (`DateTimePicker`) accept optional `timezone` and `showTimezone` props. When set, the picker displays and edits dates in the target timezone while storing UTC. `useOrgTimezone()` hook fetches the org's timezone from `{org_id}_general` settings. Conversion via `utcToTzLocal()` / `tzLocalToUtc()` in `lib/timezone.ts`. `TIMEZONES` list (~45 IANA zones) used by General Settings and the hook. Event editor (DetailsTab, SettingsTab) wires timezone to all date pickers automatically.

### Stripe Connect (Multi-Tenant Payments)
Direct charges on connected accounts with application fee. Per-event routing: `event.stripe_account_id` → `{org_id}_stripe_account` → platform-only. Currency: GBP/EUR/USD, always smallest unit (`toSmallestUnit()`/`fromSmallestUnit()`). VAT: `lib/vat.ts`. Discounts: server-side validation. Rate limited: 10/min/IP. Connect routes gated by `requirePlatformOwner()`.

### Platform Plans (Fee Tiers)
**Starter** (free, 5% + £0.50 min) and **Pro** (£29/month, 2.5% + £0.30 min) in `lib/plans.ts`. Stored in `{org_id}_plan`. Tenant billing: `/api/billing/checkout` → Stripe Checkout → webhook. `ensureStripePriceExists()` auto-provisions Stripe Product+Price.

### Self-Service Signup (Promoter Registration)
New promoters self-register at `/admin/signup/`. Two auth paths: email/password (`POST /api/auth/signup` → `provisionOrg()`) or Google OAuth (cookie-based → `/auth/callback/` → `provisionOrg()`).

**`provisionOrg()`** (`lib/signup.ts`): creates `org_users` (owner), `domains` (`{slug}.entry.events`), `site_settings` (Starter plan). **Slug system:** `slugify()` → `[a-z0-9-]` (3-40 chars), `validateSlug()` checks ~50 reserved + collisions, auto-suffix `-2`..`-99`. Live check via `GET /api/auth/check-slug`. Rate limited 5/hr/IP. `?welcome=1` shows first-event CTA on `/admin/`.

### Multi-Tenancy: Dynamic org_id Resolution
Every database table has an `org_id` column. Every query must filter by it. org_id is resolved dynamically per request — **never hardcode `"feral"`**.

**Resolution flow** (middleware → header → helpers):
```
Request → Middleware resolves org_id → sets x-org-id header → downstream reads it
         ├─ Admin host + logged in → org_users lookup (user.id → org_id)
         ├─ Tenant host → domains table lookup (hostname → org_id)
         └─ Fallback → "feral"
```

**Domain routing:** `admin.entry.events` = admin host. `{slug}.entry.events` = tenant subdomain. Custom domains from `domains` table. `localhost`/`*.vercel.app` = dev. Domain management via `/admin/settings/domains/`.

**Access patterns:** Server: `getOrgId()` (`@/lib/org`). Auth API: `auth.orgId` from `requireAuth()`. Public API: `getOrgIdFromRequest(request)`. Client: `useOrgId()`. Middleware caches lookups (60s TTL). Cron uses `ORG_ID` fallback (future: iterate all orgs). RLS should enforce org_id isolation.

### White-Label Branding System
Org-level branding in `site_settings` under `{org_id}_branding`: logo, org name, colors, fonts, copyright. Event layout injects CSS vars server-side (no FOUC). Client: `useBranding()`. API: `GET/POST /api/branding`.

**Centralized branding page**: `/admin/settings/branding/`. On save syncs logo to `{org_id}_email` (unless `logo_override: true`). `getEmailSettings()` falls back to branding logo if no email logo and no `logo_override`.

### Settings System
**Event data**: `events` + `ticket_types` tables
- Event content (name, venue, dates, theme, about, lineup, images) in `events` table
- Ticket configuration (price, capacity, sold, tier, merch) in `ticket_types` table. Sequential release via `ticket_group_release_mode` in event settings
- Marketing settings stored under key `{org_id}_marketing`
- Branding settings stored under key `{org_id}_branding`

**Settings keys** (stored in `site_settings` table as key → JSONB). All keys are dynamic via helper functions in `lib/constants.ts`:
| Key pattern | Helper | Purpose |
|-------------|--------|---------|
| `{org_id}_general` | — | Org general settings (name, timezone, support email) |
| `{org_id}_branding` | `brandingKey()` | Org branding (logo, colors, fonts) |
| `{org_id}_themes` | `themesKey()` | Theme store (active template, theme configs) |
| `{org_id}_vat` | `vatKey()` | VAT configuration |
| `{org_id}_homepage` | `homepageKey()` | Homepage settings |
| `{org_id}_reps` | `repsKey()` | Reps program settings |
| `{org_id}_abandoned_cart_automation` | `abandonedCartAutomationKey()` | Abandoned cart email automation config |
| `{org_id}_announcement_automation` | `announcementAutomationKey()` | Announcement email sequence config (4-step: confirmation, hype, live, reminder) |
| `{org_id}_popup` | `popupKey()` | Popup settings |
| `{org_id}_marketing` | `marketingKey()` | Meta Pixel + CAPI settings |
| `{org_id}_email` | `emailKey()` | Email template settings |
| `{org_id}_wallet_passes` | `walletPassesKey()` | Wallet pass configuration |
| `{org_id}_events_list` | `eventsListKey()` | Events list configuration |
| `{org_id}_stripe_account` | `stripeAccountKey()` | Stripe Connect account (fallback) |
| `{org_id}_plan` | `planKey()` | Platform plan assignment + subscription status (Starter/Pro) |
| `platform_stripe_billing` | `platformBillingKey()` | Stripe Product + Price IDs for Pro plan billing |
| `platform_payment_digest` | — | Latest AI payment health digest (generated every 6h) |

### Request Flow (Event Pages)
`/event/[slug]/` → Middleware (org_id) → RootLayout (`<OrgProvider>`) → EventLayout (Server Component: event + settings + branding + template in parallel, CSS vars + `data-theme`) → `AuraEventPage` or `MidnightEventPage`.

### Caching Strategy
Event + admin: `force-dynamic`, `cache: "no-store"`. Media: `max-age=31536000, immutable`. Apple Pay: `max-age=86400`.

### Authentication & Security

**Two auth systems:** Admin (`/admin/*` + `/api/*`, `requireAuth()`) and Rep portal (`/rep/*` + `/api/rep-portal/*`, `requireRepAuth()`).

**Role flags** (Supabase `app_metadata`, additive): `is_admin` (admin access), `is_rep` (rep portal), `is_platform_owner` (Entry Backend — manual SQL). Dual-role supported.

**Auth helpers** (`lib/auth.ts`): `requireAuth()` → `{ user, orgId }` (admin). `requireRepAuth()` → `{ rep }` (rep portal). `requirePlatformOwner()` → `{ user, orgId }` (platform owner). Two layers: middleware blocks at edge, then handler verifies role.

**Public API routes (no auth):** Stripe (`payment-intent`, `confirm-order`, `webhook`, `account`, `apple-pay-verify`), `checkout/capture`, `GET events|settings|merch|branding|themes|media/[key]|health`, `POST track|meta/capi|discounts/validate`, `/api/cron/*` (CRON_SECRET), `/api/unsubscribe`, `orders/[id]/wallet/*`, rep auth routes, `auth/*`, `/api/team/accept-invite`.

**Rules for new routes:**
1. Admin API routes: call `requireAuth()`, use `auth.orgId` for all queries
2. Rep portal API routes: call `requireRepAuth()`, use `rep.org_id` for all queries
3. Platform-owner API routes: call `requirePlatformOwner()`, use `auth.orgId`
4. Public API routes: use `getOrgIdFromRequest(request)` from `@/lib/org`, add to `PUBLIC_API_PREFIXES` or `PUBLIC_API_EXACT_GETS` in `middleware.ts`
5. **Never import `ORG_ID`** — use dynamic resolution (see Multi-Tenancy section)
6. Never hardcode secrets — use environment variables only
7. Stripe webhook must always verify signatures in production

---

## Database (Supabase)

### Tables
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `site_settings` | Key-value config store (JSONB) | key, data, updated_at |
| `events` | Event definitions | slug, name, venue_*, date_*, status, payment_method, currency, stripe_account_id, tickets_live_at (announcement mode), announcement_title/subtitle, queue_enabled/queue_duration_seconds/queue_window_minutes (hype queue) |
| `ticket_types` | Ticket pricing/inventory | event_id, name, price, capacity, sold, tier, includes_merch, merch_*, product_id, status |
| `products` | Standalone merch catalog | name, type, sizes[], price, images, status, sku |
| `orders` | Purchase records | order_number (FERAL-XXXXX), event_id, customer_id, status, subtotal, fees, total, payment_ref |
| `order_items` | Line items per order | order_id, ticket_type_id, qty, unit_price, merch_size |
| `tickets` | Individual tickets with QR | ticket_code (FERAL-XXXXXXXX), order_id, status, holder_*, scanned_at/by |
| `customers` | Customer profiles | email, first/last_name, total_orders/spent, marketing_consent (bool/null), marketing_consent_at/source |
| `guest_list` | Manual guest entries | event_id, name, email, qty, checked_in/at |
| `discounts` | Discount codes | code, type, value, max_uses, used_count, applicable_event_ids[], starts_at, expires_at |
| `abandoned_carts` | Checkout abandonment + recovery | customer_id, event_id, email, items (jsonb), status, cart_token (UUID) |
| `traffic_events` | Funnel tracking | event_type, page_path, session_id, referrer, utm_* |
| `org_users` | Team members + invites | auth_user_id, email, role (owner/member), perm_*, status, invite_token |
| `domains` | Hostname → org_id mapping | hostname (unique), org_id, is_primary, type, status, verification_* |
| `popup_events` | Popup interaction tracking | event_type (impressions/engaged/conversions/dismissed) |
| `payment_events` | Payment health log (append-only) | type, severity, event_id, stripe_*, error_*, metadata (jsonb), resolved, resolution_notes |
| `event_interest_signups` | Coming-soon signups + email automation | event_id, customer_id, email, notification_count (0-4), unsubscribe_token |

**Reps Program** (10 tables): `reps`, `rep_events`, `rep_rewards`, `rep_milestones`, `rep_points_log`, `rep_quests`, `rep_quest_submissions`, `rep_reward_claims`, `rep_event_position_rewards`, `rep_notifications`. All have `org_id`. Types in `src/types/reps.ts`.

### Key Constraints
- `orders.order_number` — unique, format `FERAL-XXXXX` (sequential, padded)
- `tickets.ticket_code` — unique, format `FERAL-XXXXXXXX` (random, crypto-safe)
- `orders.payment_ref` — used for idempotency (Stripe PaymentIntent ID)
- `products.product_id` on `ticket_types` — FK to `products` table (ON DELETE SET NULL)
- All tables have `org_id` column

### Supabase Client Rules (CRITICAL — Data Access)
Wrong client → silent data loss (empty arrays when RLS blocks). **`getSupabaseAdmin()`** = ALL data queries (service role, bypasses RLS). **`getSupabaseServer()`** = auth ONLY (`requireAuth`, `getSession`). **`getSupabaseClient()`** = browser-side only (realtime, client reads, subject to RLS). Never create raw `createClient()` with anon key server-side.

### External Service Changes Rule (CRITICAL)
MCP access: **Supabase** (schema, queries, migrations) + **Vercel** (deployments, logs). Use MCP directly — NEVER give user SQL to run. **Stripe** has no MCP — tell user to use dashboard. If MCP token expired, tell user to run `/mcp`. Never hardcode secrets. Document changes in this file. Never assume table/column exists unless documented here.

---

## API Routes (101 endpoints)

### Critical Path (Payment → Order)
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/stripe/payment-intent` | Create PaymentIntent (validates tickets + sequential release, applies discounts + VAT, rate limited) |
| POST | `/api/stripe/confirm-order` | Verify payment → create order + tickets + email confirmation |
| POST | `/api/checkout/capture` | Upsert customer + abandoned cart on checkout email capture |
| POST | `/api/stripe/webhook` | Handle payment_intent.succeeded / failed |
| GET | `/api/stripe/account` | Get connected Stripe account ID for checkout |

### Orders & Tickets
`/api/orders` (GET list, POST create), `/api/orders/[id]` (GET detail), `/api/orders/[id]/refund` (POST), `/api/orders/[id]/resend-email` (POST), `/api/orders/[id]/pdf` (GET), `/api/orders/[id]/wallet/apple|google` (GET), `/api/orders/export` (GET CSV), `/api/tickets/[code]` (GET validate), `/api/tickets/[code]/scan` (POST), `/api/tickets/[code]/merch` (GET)

### Standard CRUD Groups
| Group | Routes | Operations |
|-------|--------|------------|
| Events | `/api/events`, `/api/events/[id]` | GET/POST/PUT/DELETE + ticket types |
| Merch | `/api/merch`, `/api/merch/[id]`, `/api/merch/[id]/linked-tickets` | GET/POST/PUT/DELETE |
| Customers | `/api/customers` | GET (list + search) |
| Guest List | `/api/guest-list`, `/api/guest-list/[eventId]` | POST/GET/PUT/DELETE |
| Discounts | `/api/discounts`, `/api/discounts/[id]`, `/api/discounts/validate`, `/api/discounts/seed` | GET/POST/PUT/DELETE + public validate |
| Abandoned Carts | `/api/abandoned-carts`, `/api/abandoned-carts/preview-email` | GET (list + stats, email HTML preview) |
| Settings | `/api/settings`, `/api/branding`, `/api/themes` | GET/POST |

### Other Route Groups
- **Abandoned Cart Recovery**: `/api/abandoned-carts` (list + stats), `/api/abandoned-carts/preview-email`, `/api/cron/abandoned-carts` (Vercel cron), `/api/unsubscribe` (supports `type=cart_recovery` and `type=announcement`)
- **Billing** (tenant self-serve — `requireAuth()`): `/api/billing/checkout` (POST — Stripe Checkout Session for Pro upgrade), `/api/billing/portal` (POST — Stripe Customer Portal), `/api/billing/status` (GET — plan + subscription status). Webhook handlers in `/api/stripe/webhook` for subscription lifecycle events.
- **Stripe Connect** (platform owner only — `requirePlatformOwner()`): `/api/stripe/connect` (CRUD), `/api/stripe/connect/[accountId]/onboarding`, `/api/stripe/apple-pay-domain`, `/api/stripe/apple-pay-verify`
- **Platform Dashboard** (platform owner only — `requirePlatformOwner()`): `/api/platform/dashboard` (GET aggregated cross-tenant metrics — tenant counts, GMV, platform fees, onboarding funnel, recent signups/orders, top tenants). Dashboard page at `/admin/backend/`
- **Tenants** (platform owner only — `requirePlatformOwner()`): `/api/platform/tenants` (GET enriched tenant list + platform summary — GMV, estimated fees, counts), `/api/platform/tenants/[orgId]` (GET single tenant detail — team, domains, events, orders, Stripe account, onboarding checklist, estimated fees). Detail page at `/admin/backend/tenants/[orgId]/`
- **Payment Health** (platform owner — `requirePlatformOwner()`): `/api/platform/payment-health` (GET — summary, failure rates, trends; params: `period`, `org_id`), `/api/platform/payment-health/[id]/resolve` (POST, accepts `notes`), `/api/platform/payment-health/resolve-all` (POST bulk resolve by `severity`/`type`). Page: `/admin/backend/payment-health/`. `lib/payment-monitor.ts` (fire-and-forget `logPaymentEvent()`, 14 event types including `incomplete_payment`), `lib/payment-alerts.ts` (Resend alerts, 30min cooldown). Cron: `/api/cron/stripe-health` (30min — Connect health, anomaly detection, incomplete PI detection, retention purge)
- **AI Payment Digest** (platform owner — `requirePlatformOwner()`): `/api/platform/payment-digest` (GET latest / POST generate on-demand, `period_hours` param). `lib/payment-digest.ts` — gathers payment_events + Stripe data, calls Claude Haiku API for analysis, stores in `platform_payment_digest` settings key. Cron: `/api/cron/payment-digest` (every 6h). Emails HTML digest to `PLATFORM_ALERT_EMAIL` when risk is concern/critical. Requires `ANTHROPIC_API_KEY` env var. Cost: ~£0.01-0.03/day
- **Plans** (platform owner only — `requirePlatformOwner()`): `/api/plans` (GET list orgs + plans, POST assign plan to org)
- **Reps Program** (39 routes): `/api/reps/*` (22 admin CRUD), `/api/rep-portal/*` (20 rep-facing — auth, dashboard, sales, quests, rewards, notifications)
- **Team Management** (7 routes): `/api/team` (GET/POST — owner only), `/api/team/[id]` (PUT/DELETE), `/api/team/[id]/resend-invite`, `/api/team/accept-invite` (public, rate limited)
- **Domain Management** (5 routes): `/api/domains` (GET/POST), `/api/domains/[id]` (PUT primary/DELETE), `/api/domains/[id]/verify`. All `requireAuth()`. POST calls Vercel Domain API
- **Self-Service Signup** (2 public): `/api/auth/signup` (POST, 5/hr), `/api/auth/check-slug` (GET, 20/min). Uses `lib/signup.ts`
- **Announcement / Coming Soon** (4 routes): `/api/announcement/signup` (POST public — upsert customer + interest + step 1 email), `/api/announcement/signups` (GET admin — list + `?stats=true`), `/api/announcement/preview-email` (GET admin — `?step=1|2|3|4`), `/api/cron/announcement-emails` (cron 5min — steps 2-4). `tickets_live_at` controls announcement mode; payment-intent rejects early purchases.
- **Admin & Utilities**: `/api/admin/dashboard`, `/api/admin/orders-stats`, `/api/auth/*`, `/api/track`, `/api/meta/capi`, `/api/upload`, `/api/media/[key]`, `/api/email/*`, `/api/wallet/status`, `/api/health`

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
**Wallet passes**: `APPLE_PASS_CERTIFICATE`, `APPLE_PASS_CERTIFICATE_PASSWORD`, `APPLE_WWDR_CERTIFICATE`, `APPLE_PASS_TYPE_IDENTIFIER`, `APPLE_PASS_TEAM_IDENTIFIER`, `GOOGLE_WALLET_SERVICE_ACCOUNT_KEY`, `GOOGLE_WALLET_ISSUER_ID`
**Domain management**: `VERCEL_API_TOKEN` (Vercel API token for domain CRUD), `VERCEL_PROJECT_ID` (feral-presents project ID), `VERCEL_TEAM_ID` (Vercel team ID)
**Monitoring**: `PLATFORM_ALERT_EMAIL` (platform owner email for critical payment/health alerts via Resend), `ANTHROPIC_API_KEY` (Claude API for AI payment digest — optional, digest gracefully degrades without it)

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
4. **Cron multi-org** — `/api/cron/*` routes still use `ORG_ID` fallback (no request context). Should iterate over all orgs

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

- **Midnight visual identity**: Cyberpunk — glassmorphism (`backdrop-filter: blur`), metallic tier gradients (platinum shimmer, obsidian silver, valentine pink), CRT suppression, red glow accents
- **Aura visual identity**: Clean, modern — rounded cards, soft shadows, minimal animation, purple-tinted neutrals
- **Mobile-first**: Most ticket buyers are on phones — design for 375px, enhance up

---

## CSS Architecture

### CSS Areas
| Area | CSS System | Entry Point |
|------|-----------|-------------|
| Public site (landing, legacy) | Hand-written CSS (`base.css`, `header.css`) | `app/layout.tsx` |
| Event pages: Midnight | Tailwind v4 + effects layer (`midnight.css`, `midnight-effects.css`) | Imported by `MidnightEventPage` |
| Event pages: Aura | Tailwind v4 (`aura.css`) | Imported by `AuraEventPage` |
| Admin dashboard (`/admin/*`) | Tailwind v4 + shadcn/ui utilities | `app/admin/layout.tsx` via `tailwind.css` |
| Rep portal (`/rep/*`) | Tailwind v4 + shadcn/ui + effects (`rep-effects.css`) | `app/rep/layout.tsx` |

**Isolation mechanism**: Admin layout renders `<div data-admin>`. All Tailwind preflight resets are scoped to `[data-admin]` via `@layer admin-reset` so they never affect public pages. Event themes are scoped via `[data-theme="themename"]` on the layout wrapper div. Rep portal is scoped via `[data-rep]` on the layout wrapper div.

### CSS Layer Rules (DO NOT BREAK)
Layers: `@layer theme, admin-reset;` then `@import "tailwindcss/utilities"` **UNLAYERED** (intentional — wins over `base.css` global `*` reset). **NEVER** add `layer(utilities)` or global `*` resets that override Tailwind.

### Rules for New CSS
1. Component-level imports. Event themes scoped via `[data-theme="themename"]`
2. Landing/legacy: hand-written BEM. Breakpoints: `1024px` / `768px` / `480px`

---

## Event Theme Architecture (Public-Facing UI)

Event pages are the revenue-generating surface — where ticket buyers browse, explore, and purchase. Every theme must be polished, fast, accessible, and mobile-first. Both Midnight and Aura serve as reference implementations.

### Theme Component Pattern
Each theme lives in `src/components/{themename}/` with a consistent structure:

Each theme has: `{Theme}EventPage` (orchestrator), `{Theme}Hero` (banner + CTA), `{Theme}TicketWidget` (ticket selection + cart), `{Theme}TicketCard` (tier with qty controls), `{Theme}MerchModal` (image gallery + size selector), `{Theme}EventInfo` (about/details/venue), `{Theme}Lineup`, `{Theme}CartSummary`, `{Theme}TierProgression`, `{Theme}BottomBar` (mobile CTA), `{Theme}SocialProof`, `{Theme}Footer`. All use shadcn/ui (Button, Card, Dialog, Badge, Separator).

### Rules for New Event Theme Components
1. **Tailwind + shadcn/ui** for layout/interactive elements. Effects CSS in `{theme}-effects.css`, tokens in `{theme}.css`
2. **Scope** to `[data-theme="{themename}"]`. Mobile-first (375px). Support `prefers-reduced-motion`
3. **Shared hooks**: `useCart()`, `useEventTracking()`, `useSettings()`, `useBranding()`, `useHeaderScroll()`
4. **CSS imports at orchestrator level** — `{Theme}EventPage` imports CSS. Children don't

### Adding a New Theme
(1) `src/components/{name}/` with orchestrator + children, (2) `{name}.css` + `{name}-effects.css`, (3) Route in `page.tsx` + `checkout/page.tsx`, (4) Add to `StoreTheme.template` in `types/settings.ts`, (5) `TEMPLATES` in `admin/ticketstore/page.tsx`. Token flow: `base.css :root` → branding vars → `{theme}.css @theme inline {}` → Tailwind classes.

---

## Rep Portal Architecture (Social App)

The rep portal (`/rep/*`) is the brand ambassador / street team app. It will evolve into a full social platform. Currently at 13 pages with its own layout, auth system (`requireRepAuth()`), and API routes (`/api/rep-portal/*`).

### CSS Architecture
Admin pattern: Tailwind + shadcn/ui + admin tokens. Gaming effects in `rep-effects.css` (~1,950 lines, scoped to `[data-rep]`). Shared components in `src/components/rep/` (RadialGauge, EmptyState, HudSectionHeader, ConfettiOverlay, LevelUpOverlay). Utilities: `lib/rep-tiers.ts`, `lib/rep-social.ts`, `hooks/useCountUp.ts`.

### Rep Portal Pages (8)
Dashboard (`/rep`), Sales, Quests, Rewards, Points, Leaderboard, Profile, Login/Join. Each has its own route under `/rep/*`. Auth separate from admin.

### Rules for New Rep Portal Pages
1. **shadcn/ui + Tailwind** — Card, Button, Badge, etc. Admin design tokens (`bg-background`, `text-foreground`). No new `--rep-*` CSS vars
2. **Gaming effects only in `rep-effects.css`** — applied via class names, not inline styles. No `style={{}}`
3. **Mobile-first** (375px). Auth: `requireRepAuth()`. Layout handles email verification + pending review gates

---

## Shared UI Primitives (shadcn/ui)

### shadcn/ui Components
**Location**: `src/components/ui/*.tsx` (27 components) — used by admin pages AND event themes

Alert, Avatar, Badge, Button, Calendar, Card, Collapsible, ColorPicker, DatePicker, Dialog, Input, Label, LiveIndicator, LiveStatCard, NativeSelect, Popover, Progress, Select, Separator, Slider, StatCard, Switch, Table, Tabs, Textarea, Tooltip, TrendBadge

**How to add new shadcn components**: Create in `src/components/ui/`, use Radix UI primitives (`radix-ui` package), use `cn()` from `@/lib/utils` for className merging. Follow existing component patterns (named export, `className` prop via `cn()`).

### Admin Design Tokens
Defined in `tailwind.css` via `@theme inline {}`. Key tokens: `background` (#08080c), `foreground` (#f0f0f5), `primary` (#8B5CF6 Electric Violet), `card` (#111117), `secondary` (#151520), `muted-foreground` (#8888a0), `border` (#1e1e2a), `destructive` (#F43F5E), `success` (#34D399), `warning` (#FBBF24), `info` (#38BDF8). Sidebar variants: `sidebar` (#0a0a10), `sidebar-foreground` (#8888a0), `sidebar-accent` (#141420), `sidebar-border` (#161624).

Use via Tailwind classes (`bg-background`, `text-foreground`, `border-border`, etc.) — never hardcode hex values. Custom utilities: `.glow-primary`, `.glow-success`, `.glow-warning`, `.glow-destructive`, `.text-gradient`, `.surface-noise`

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
