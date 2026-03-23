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
│   └── api/                   # ~245 handlers across 182 route files (see API Routes)
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
│   ├── rep/                   # 18 components (see Rep Portal section)
│   ├── landing/               # LandingPage, HeroSection, ParticleCanvas, EventsSection,
│   │                          # AboutSection, ContactSection, GenericAboutSection, HeroGlitchText
│   ├── layout/                # Header, Footer, Scanlines, CookieConsent, VerifiedBanner, PaymentMethodsStrip
│   ├── OrgProvider.tsx        # React context: useOrgId()
│   ├── CurrencyProvider.tsx   # Currency context provider
│   └── ui/                    # shadcn/ui (28 components)
├── hooks/                     # 21 hooks (see Hooks section)
├── lib/                       # 71 modules (see Architecture sections)
├── types/                     # TypeScript types per domain (17 files)
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
1. **Signup** — `/rep/join`, Google/email sign-in. `POST /api/rep-portal/signup-google` for existing sessions. Sets `is_rep` in `app_metadata`.
2. **Onboarding** — `WelcomeOverlay` (3 steps): nickname, photo, install PWA. Shown when `onboarding_completed === false`.
3. **Pending** — `PendingDashboard`: polls `/api/rep-portal/dashboard` every 10s, auto-refreshes on approval.
4. **Approval** — Admin PUT `/api/reps/[id]` `status: "active"` → welcome email + push notification + auto-assign all events.
5. **Active** — Full dashboard: XP gauge, currency, leaderboard, discount code, events, quests, sales, rewards shop.

### Rep Auth
`requireRepAuth()` in `lib/auth.ts` → returns `{ rep }` with `rep.org_id`. Rep routes prefixed `/api/rep-portal/*`. Admin rep management routes prefixed `/api/reps/*` (use `requireAuth()`).

### XP & Currency (Dual Economy)
- **XP (points_balance)** — Earned per sale, quests, manual grants. Drives leveling. Never spent.
- **FRL (currency_balance)** — Earned per sale alongside XP. Spent in reward shop. Configurable name per org (`currency_name` in rep settings).
- `awardPoints()` in `lib/rep-points.ts` handles both. Logs to `rep_points_log`. Auto-levels via `xp-levels.ts`.
- `claim_reward_atomic()` RPC deducts from `currency_balance` (not points_balance).

### Leveling & Tiers
Levels defined in `lib/xp-levels.ts`. Tiers in `lib/rep-tiers.ts` (Bronze → Silver → Gold → Platinum → Diamond → Mythic). Each tier has a color, ring style for avatars, and display name.

### Quests
Types: `social_share`, `ugc_photo`, `ugc_video`, `referral`, `custom`. Reps submit via `/rep/quests/` → `QuestSubmitSheet`. Admin reviews in ReportsTab (`/admin/reps/`). Approval awards XP + currency.

### Rep Share Links
Reps share `{tenant_domain}/event/{slug}?ref={CODE}`. Auto-applies discount + suppresses popup for referred visitors. Attribution tracked via `rep-attribution.ts`. Event-linked share cards on all quest types.

### Push Notifications (Web Push / VAPID)
`web-push` + VAPID keys. SW at `/rep-sw.js`. `savePushSubscription()` → `rep_push_subscriptions` (upsert). `sendPushToRep()` → `webPush.sendNotification()` (stale subs auto-cleaned). Types (CHECK constraint): `reward_unlocked`, `quest_approved`, `sale_attributed`, `level_up`, `reward_fulfilled`, `manual_grant`, `approved`, `general`. `createNotification()` in `lib/rep-notifications.ts`: DB + push, never throws.

### PWA & Install Flow
`useRepPWA` hook: SW registration, push subscription, `beforeinstallprompt` capture, platform detection, standalone detection. Install prompts: onboarding step 3, post-onboarding (`rep-onboarding-complete` event), repeat prompt (3rd visit, 7-day cooldown). `PendingInstallBar` replaces nav for pending reps. `NotificationPrompt` in standalone mode if push not granted.

### Rep Components & Lib
**Components** (`src/components/rep/`): 18 components including WelcomeOverlay, InstallPrompt, RadialGauge, LevelUpOverlay, QuestCard/Detail/Submit sheets, CropModal, and UI helpers.
**Lib** (`src/lib/rep-*.ts`): 11 modules covering attribution, auto-assign, emails, notifications, points, quest styles, reward fulfillment, social, sounds, tiers, utils.

### Admin Reps Management (`/admin/reps/`)
5 tabs: Dashboard (stats), Reps (CRUD, approve/suspend), Quests (create/manage), Reports (quest submissions review), Rewards (reward shop management), Settings (program config).

### Team Permissions for Reps
`org_users` has hierarchical permissions: `perm_reps` (parent toggle) + 4 sub-permissions:
- `perm_reps_manage` — Approve/suspend/delete reps
- `perm_reps_content` — Manage quests and content
- `perm_reps_award` — Award/deduct points and currency
- `perm_reps_settings` — Configure rep program settings

Sub-permissions auto-clear when parent `perm_reps` is disabled.

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
| `guest_list` | Guest list entries: event_id, name, email, qty, status, access_level, source (direct/artist/application), invite_token, order_id, application_data (JSONB), payment_amount, checked_in/at |
| `discounts` | Codes: code, type, value, max_uses, used_count, applicable_event_ids[], rep_id (nullable) |
| `abandoned_carts` | Recovery: customer_id, event_id, email, items (jsonb), status, cart_token |
| `traffic_events` | Funnel: event_type, page_path, session_id, referrer, utm_* |
| `org_users` | Team: auth_user_id, email, role, perm_* (9 flags), status, invite_token |
| `domains` | Routing: hostname (unique), org_id, is_primary, type, status, verification_* |
| `popup_events` | Popup tracking: event_type, email, city, country |
| `payment_events` | Health log (append-only): type, severity, stripe_*, error_*, resolved |
| `event_interest_signups` | Coming-soon signups: event_id, email, notification_count (0-4), unsubscribe_token |
| `merch_collections` | Merch store collections: slug, name, description, org_id |
| `merch_collection_items` | Collection↔Product junction: collection_id, product_id, sort_order |

**Reps Program** (11 tables):
| Table | Purpose |
|-------|---------|
| `reps` | Rep profiles: email, first_name, last_name, display_name, photo_url, status (pending/active/suspended/deactivated), points_balance, currency_balance, total_sales, total_revenue, level, customer_id, auth_user_id, onboarding_completed |
| `rep_events` | Rep↔Event assignments: rep_id, event_id, discount_code |
| `rep_rewards` | Reward shop items: name, description, points_cost, reward_type, metadata (JSONB), status |
| `rep_milestones` | Achievement definitions: trigger_type, threshold, reward |
| `rep_points_log` | XP/currency transaction log: rep_id, points, currency, source_type, description |
| `rep_quests` | Quest definitions: type, title, description, xp_reward, currency_reward, event_id |
| `rep_quest_submissions` | Quest submissions: rep_id, quest_id, status, media_url, admin_notes |
| `rep_reward_claims` | Reward claims: rep_id, reward_id, status, metadata (JSONB) |
| `rep_event_position_rewards` | Leaderboard position rewards per event |
| `rep_notifications` | In-app notifications: type (CHECK constraint), title, body, link, read |
| `rep_push_subscriptions` | Web Push subscriptions: endpoint, p256dh, auth, last_used_at |

All rep tables have `org_id`. Types: `src/types/reps.ts`.

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
Stored in `site_settings` as key → JSONB. Helpers in `lib/constants.ts`:

| Key | Helper | Purpose |
|-----|--------|---------|
| `{org_id}_general` | `generalKey()` | Org settings (name, timezone, email) |
| `{org_id}_branding` | `brandingKey()` | Logo, colors, fonts |
| `{org_id}_themes` | `themesKey()` | Theme configs |
| `{org_id}_vat` | `vatKey()` | VAT config |
| `{org_id}_homepage` | `homepageKey()` | Homepage settings |
| `{org_id}_reps` | `repsKey()` | Reps program config |
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
| `{org_id}_merch_store` | `merchStoreKey()` | Merch store settings |
| `{org_id}_pdf_ticket` | — | PDF ticket template |
| `{org_id}_scanner_assignments` | `scannerAssignmentsKey()` | Scanner event assignments |
| `media_[key]` | — | Uploaded media storage |
| `platform_stripe_billing` | `platformBillingKey()` | Pro plan billing IDs |
| `platform_exchange_rates` | `exchangeRatesKey()` | Currency exchange rates |
| `platform_payment_digest` | — | AI payment digest |
| `platform_health_digest` | — | AI platform digest |
| `platform_beta_applications` | — | Beta applicants |
| `platform_beta_invite_codes` | — | Invite codes |
| `entry_platform_xp` | — | Platform XP config |

---

## API Routes (~245 handlers, 182 route files)

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
Events (`events`, `events/[id]`, `events/[id]/artists`), Artists (`artists`, `artists/[id]`), Merch (`merch`, `merch/[id]`, `merch/[id]/linked-tickets`), Customers (`customers`, `customers/[id]`), Guest List (`guest-list`, `guest-list/[eventId]`, `guest-list/invite`, `guest-list/approve`, `guest-list/rsvp/[token]`, `guest-list/submit/[token]`, `guest-list/submission-link`, `guest-list/campaigns`, `guest-list/apply/[campaignId]`, `guest-list/application-payment`, `guest-list/application-confirm`, `guest-list/event-summary`), Discounts (`discounts`, `discounts/[id]`, `discounts/validate`, `discounts/seed`), Settings (`settings`, `branding`, `themes`)

### Rep Portal Routes (~32 routes, `/api/rep-portal/*`)
Auth: `auth-check`, `login`, `logout`, `signup-google`, `verify-email`, `magic-login/*`. Dashboard: `dashboard`, `me` (GET/PUT), `settings`, `discount`. Sales: `sales`. Quests: `quests`, `quests/[id]/submit`. Rewards: `rewards`, `rewards/[id]/claim`. Events: `join-event`. Notifications: `notifications`, `notifications/read`. Push: `push-subscribe`, `push-vapid-key`. Points: `points`. Profile: `profile/[id]`. Other: `upload`, `manifest`, `pwa-icon`, `leaderboard`, `download-media`.

### Admin Rep Routes (~26 routes, `/api/reps/*`)
CRUD: `reps` (GET/POST), `reps/[id]` (GET/PUT/DELETE). Settings: `reps/settings`. Stats: `reps/stats`, `reps/event-leaderboard`. Events: `reps/events`, `reps/events/assign`. Quests: `reps/quests` (CRUD), `reps/quest-submissions`, `reps/quest-submissions/[id]`. Rewards: `reps/rewards` (CRUD), `reps/rewards/[id]`. Points: `reps/award-points`, `reps/points-log`. Milestones: `reps/milestones`. Invite: `reps/invite`.

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
- **Team**: `team` (GET/POST), `team/[id]`, `team/[id]/resend-invite`, `team/accept-invite` (public)
- **Uploads**: `upload` (POST base64), `upload-video` (POST signed URL)
- **Tracking**: `track` (bot-filtered), `meta/capi`, `admin/dashboard`, `admin/orders-stats`
- **Scanner PWA**: `scanner/events` (GET), `scanner/events/[id]/stats` (GET), `scanner/assignments` (GET/PUT), `scanner/manifest` (GET)
- **Merch Store**: `merch-store/settings` (GET/POST), `merch-store/collections` (GET/POST), `merch-store/collections/[slug]` (GET/PUT/DELETE), `merch-store/payment-intent` (POST), `merch-store/confirm-order` (POST)
- **Currency**: `currency/rates` (GET public), `cron/exchange-rates`
- **Brand**: `brand/logo` (GET public)
- **Admin**: `admin/live-sessions` (GET), `admin/checkout-health` (GET), `admin/uk-events` (GET)
- **Platform** (owner, additional): `platform/impersonate/*`, `platform/rep-override-code`
- **Other**: `media/[key]`, `health`, `unsubscribe`

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

### Step 1: Fetch unresolved issues
Sentry (EU region): `source .env.local && curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" "https://sentry.io/api/0/projects/$SENTRY_ORG/$SENTRY_PROJECT/issues/?query=is:unresolved&sort=freq&limit=25"`. Payment health: Supabase MCP → `payment_events WHERE resolved = false`. Dev server: `GET /api/platform/platform-health?period=24h`.

### Step 2: Triage
**FIX**: 500s, React errors, checkout/webhook failures. **RESOLVE** (not bugs): card_declined (normal 2-5%), network timeouts, bot 401s. **IGNORE**: single non-reproducible errors.

### Step 3: Fix → Commit → Resolve
Sentry: `curl -X PUT -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" -H "Content-Type: application/json" -d '{"status":"resolved"}' "https://sentry.io/api/0/issues/ISSUE_ID/"`. Add comment: same URL + `/comments/` with `{"text":"Fixed in commit abc — reason"}`. Payment events: Supabase MCP → `UPDATE payment_events SET resolved=true, resolution_notes='...'`.

### Health monitoring rules
1. Investigate before resolving — never bulk-resolve. Leave clear notes
2. **Payment orphans are CRITICAL** — money taken, no ticket. Never ignore
3. Card declines (2-5%) are normal — not bugs. 1 occurrence = noise, 50 = real bug
4. Without `org_id` = platform-wide (higher priority). Fix and commit before resolving
5. For manual Stripe actions — give step-by-step instructions

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

### Overview
Full guest list management with invitations, access levels, artist submissions, and public applications with optional paid tickets. Admin page at `/admin/guest-list/` with tabs: Guests, Artist Links, Applications, Settings.

### Access Levels
`guest_list` (default), `vip`, `backstage`, `aaa`, `artist`. Stored on `guest_list.access_level`. Hidden ticket types created per event per level (e.g. "Guest List — VIP"). Scanner shows access level as prominent badge.

### Three Guest Sources
- **Direct** (`source: 'direct'`): Admin adds guest manually, optionally sends invite email
- **Artist** (`source: 'artist'`): DJ/artist submits via submission link with optional quotas
- **Application** (`source: 'application'`): Public applies via campaign landing page, admin approves (free or paid)

### Invitation Flow
Admin adds guest with email → invite email ("You're on the list") → guest RSVPs on `/guest-list/rsvp/[token]` → if auto-approve ON: ticket issued via `issueGuestListTicket()` → `createOrder()`. Copy: nonchalant, professional.

### Artist Submission Links
Admin generates link with per-access-level quotas → artist visits `/guest-list/submit/[token]` → submits names + emails → entries created as pending → admin approves → invite email sent → RSVP → ticket. Artists can see submission status (pending/invited/confirmed/ticket issued).

### Application Campaigns
Admin creates campaign (title, price, access level, capacity, fields: Instagram/DOB) → generates landing page at `/guest-list/apply/[campaignId]` → public applies → admin reviews in Applications tab → accepts free (invite email) or paid (acceptance email → payment page → ticket). Campaigns stored in `site_settings` key `{org_id}_guest_list_campaigns`.

### Payment (Paid Applications)
Two-step: "You've been accepted" → "Confirm your spot" → card form (Stripe CardNumberElement/CardExpiryElement/CardCvcElement, same elements as NativeCheckout). PaymentIntent via `/api/guest-list/application-payment` (card only, no Link/Klarna). Confirmation via `/api/guest-list/application-confirm` → `issueGuestListTicket()`. Webhook backup in main Stripe webhook for `metadata.type === "guest_list_application"`.

### Key Files
| Purpose | Files |
|---------|-------|
| Core lib | `src/lib/guest-list.ts` (ACCESS_LEVELS, ensureGuestListTicketType, issueGuestListTicket, emails) |
| Types | `src/types/guest-list.ts`, `src/types/orders.ts` (GuestListEntry) |
| Admin | `src/app/admin/guest-list/page.tsx` (orchestrator), `src/components/admin/guest-list/` (4 tab components) |
| Public pages | `src/app/guest-list/` (layout, rsvp, submit, apply, accept + PaymentSection) |
| APIs | `src/app/api/guest-list/` (route, [eventId], invite, approve, rsvp, submit, submission-link, campaigns, apply, application-payment, application-confirm, event-summary) |

### Settings Keys
- `{org_id}_guest_list_settings` — auto_approve, auto_approve_submissions
- `{org_id}_guest_list_submissions` — artist submission links array
- `{org_id}_guest_list_campaigns` — application campaigns array

### Scanner Integration
Guest list tickets scan identically to paid tickets (same `POST /api/tickets/[code]/scan`). Scan route syncs `guest_list.checked_in` when a guest list ticket QR is scanned. ScanResult shows access level badge. GuestListSearch shows access level per guest.

---

## Known Gaps
1. **Google Ads + TikTok tracking** — placeholders only
2. **Aura theme** — 18 components still in `src/components/aura/`, pending removal


---

## Document Maintenance

1. **Read this file at session start** — single source of truth
2. **Update after architecture changes** — new tables, routes, modules
3. **Delete deprecated references** — no dead code documented
4. **Keep under 40K characters** — compress verbose sections, don't remove useful info. Current budget: ~38K target
5. **This file is the map.** Undocumented = unknown. Wrong docs = wrong assumptions
