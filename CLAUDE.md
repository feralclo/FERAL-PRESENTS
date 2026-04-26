# Entry — Platform Context

## Mission
Entry is a white-label events and ticketing platform ("Shopify for Events"). Today it powers FERAL's events; the goal is any promoter can sell tickets/merch under their own brand, platform takes a fee.

Every database query filters by `org_id`. Every feature must work for promoters who aren't FERAL.

**Status:** Controlled beta (`BETA_MODE = true` in `lib/beta.ts`). Promoters apply via invite codes → onboarding wizard → admin dashboard. Queued workstreams: multi-tenant isolation audit (`AUDIT-PROMPT.md`) and Midnight visual redesign (`MIDNIGHT-REDESIGN-PROMPT.md`).

**Rep Platform v2 (2026-04-22 build):** Complete backend rebuild for the native iOS rep app shipped as spec v2.0. Single source of truth: `ENTRY-IOS-BACKEND-SPEC.md` in project root. Introduces: platform-wide EP currency (real economy via event-sourced ledger), promoter first-class entity (1:1 with orgs), cross-org rep identity (memberships, not org-scoped), rep↔promoter and rep↔rep follow graphs, APNs+FCM+web-push unified fanout, signed-URL uploads, quest + claim flows writing to the ledger. Legacy web `/rep/*` portal is FROZEN — no new features. Rebuild of `/rep/*` planned post-iOS-launch. iOS repo: `~/Projects/entry-ios/`.

## Build Standards (CRITICAL)

Scaling to 1000+ tenants. Every feature production-grade — no shortcuts, no scaffolds.

1. **Complete implementations** — error states, loading states, mobile, multi-tenant, typed. No half-finished code.
2. **Multi-tenant always** — every query filters by `org_id`. Every new table needs `org_id`. Settings keys use `{org_id}_*` helpers in `lib/constants.ts`. Mentally test with a non-feral org.
3. **Mobile-first 375px** — 70%+ of buyers are on phones. Touch targets ≥44px.
4. **Follow existing patterns** — find the closest equivalent before inventing new conventions.
5. **Test what matters** — `npm test` before committing; `npm run test:integration` for payment/checkout changes; new hooks need tests.
6. **No dead code** — no commented-out code, unused imports, TODO placeholders in committed code.
7. **Proper error handling** — 400/401/403/404/500 per spec. try/catch + Sentry on unexpected.
8. **Right Supabase client** — `getSupabaseAdmin()` for data, `getSupabaseServer()` for auth only. Wrong client = silent data loss (RLS returns empty).

## Stack

Next.js 16 App Router + React 19 + TypeScript (strict). Supabase (Postgres + REST + Realtime). Stripe 20 (Connect, direct charges). Vercel hosting. Tailwind v4 + shadcn/ui (Radix). Vitest + Testing Library. Resend email. Mux video. Sentry monitoring. Also: GTM + Meta Pixel/CAPI, Klaviyo, web-push (VAPID), Apple/Google Wallet, qrcode, jsPDF, Space Mono + Inter fonts.

## Project Structure

```
src/
├── instrumentation.ts         # Sentry init
├── middleware.ts              # Auth, route protection, org_id resolution
├── app/
│   ├── layout.tsx, page.tsx, global-error.tsx
│   ├── event/[slug]/          # Public event pages
│   ├── events/                # Public events list
│   ├── shop/[slug]/           # Public merch storefront
│   ├── scanner/               # Ticket scanner PWA
│   ├── admin/                 # Admin dashboard (~70 files). Includes v2: /admin/promoter/, /admin/ep/
│   ├── rep/                   # FROZEN (legacy v1 web portal, 14 pages). No new work.
│   └── api/                   # ~280+ route handlers (see API Routes)
├── components/
│   ├── admin/                 # event-editor/, dashboard/, reps/, command/, + shared widgets
│   ├── midnight/              # 26 theme components (MidnightEventPage orchestrator + children)
│   ├── aura/                  # DEPRECATED — 18 files, no new work
│   ├── event/, checkout/, shop/, scanner/, events/, rep/, landing/, layout/, ui/ (28 shadcn/ui)
│   └── OrgProvider.tsx, CurrencyProvider.tsx
├── hooks/                     # 21 hooks
├── lib/                       # 72+ modules; new in v2: lib/push/ (apns, fcm, web, fanout), lib/ep/
├── types/, styles/
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

Two auth systems: Admin (`requireAuth()` → `{ user, orgId }`) and Rep portal (`requireRepAuth()` → `{ rep }`). Platform owner: `requirePlatformOwner()` → `{ user, orgId }`. Role flags in Supabase `app_metadata` (additive): `is_admin`, `is_rep`, `is_platform_owner`. Dual-role supported.

**Rules for new routes:** Admin = `requireAuth()` with `auth.orgId`; Rep = `requireRepAuth()` with `rep.org_id`; Platform owner = `requirePlatformOwner()`; Public = `getOrgIdFromRequest(request)` + add to `PUBLIC_API_PREFIXES`/`PUBLIC_API_EXACT_GETS` in `middleware.ts`. Never import `ORG_ID` — use dynamic resolution. Never hardcode secrets. Stripe webhook always verifies signatures in prod.

**Public routes (no auth):** Stripe payment/checkout, events/settings/merch/branding GETs, track/meta/discounts/popup POSTs, cron (CRON_SECRET), auth/*, beta/*, rep auth, wallet downloads, guest-list (rsvp/submit/apply/application-payment/application-confirm), scanner/manifest, merch-store payment, brand/logo, promoters/* (v2 discovery).

### Payment System (Stripe)
Event pages → `NativeCheckout` → `ExpressCheckout` (Apple/Google Pay). PaymentIntent (idempotency key) → confirm → webhook → order + tickets + email. Stock reserved atomically via `increment_sold()` RPC (false = sold out → rollback). Discounts validated server-side; `increment_discount_used()` RPC atomic. Health monitored via `logPaymentEvent()` → `payment_events`.

**External ticketing**: `payment_method: "external"` → `MidnightExternalPage` (no checkout).

**Stripe Connect**: Direct charges on connected accounts w/ application fee. Per-event routing: `event.stripe_account_id` → `{org_id}_stripe_account` → platform. GBP/EUR/USD smallest unit. Rate limit 10/min/IP. Tenant self-service: `/admin/payments/`, `/api/stripe/connect/my-account`. Platform owner: `/api/stripe/connect`.

**Plans**: Starter (free, 3.5% + 30p min) / Pro (£29/mo, 2% + 10p min) in `lib/plans.ts`. Stored in `{org_id}_plan`. Billing via `/api/billing/checkout` → Stripe Checkout → webhook.

**EP economy** (Rep Platform v2): separate Stripe flow — tenants buy EP via `/api/admin/ep/purchase-intent`, webhook writes to ledger, monthly `ep-payouts` cron Stripe-Transfers earned EP (minus 10% cut) to connected accounts. See Rep Platform v2 section.

### Theme System
Single theme **Midnight** (default for all tenants), customisable via branding. Aura DEPRECATED. Routing: `event/[slug]/page.tsx` → `external` → `MidnightExternalPage` | default → `MidnightEventPage`. Announcement mode: `tickets_live_at` in future → `MidnightAnnouncementPage` (countdown + email signup). Hype queue: `queue_enabled` + `queue_window_minutes` → `MidnightQueuePage` (client-only, `useHypeQueue`; `?preview=tickets` bypasses both).

### Error Monitoring (Sentry)
Three layers: Sentry (crash + session replay 5% / 100% on error), Payment Monitor (`payment_events` table), AI Digest (Haiku every 6h). Config: `sentry.{client,server,edge}.config.ts`. Tunnel: `/api/monitoring`. Context via `setSentryOrgContext()` / `setSentryUserContext()`. Error boundaries: `global-error.tsx`, `admin/error.tsx`, `event/[slug]/error.tsx`. Health dashboard: `/admin/backend/health/`.

### White-Label Branding
`{org_id}_branding` in `site_settings`: logo, org name, colors, fonts, copyright. Event layout server-renders CSS vars (no FOUC). Client: `useBranding()`. API: `/api/branding`.

### Sequential Ticket Release
Per-group, reveal one-at-a-time on sellout. Computed from `sold`/`capacity`. Config: `ticket_group_release_mode` in EventSettings JSONB. Logic: `lib/ticket-visibility.ts`; server validates via `validateSequentialPurchase()`.

### Artist / Lineup
`artists` + `event_artists` (junction with `sort_order`). Admin CRUD at `/admin/artists/`, `ArtistLineupEditor` in event editor. `events.lineup` string[] kept as fallback.

### Beta Signup
`BETA_MODE = true` gates signup. Flow: `/admin/signup/` → invite code → `/admin/beta/` → owner approves → email → signup → `/admin/onboarding/` → dashboard. `provisionOrg()` in `lib/signup.ts` creates `org_users`, `domains`, `site_settings`.

### Onboarding Wizard
`/admin/onboarding/` — three sections: **Identity → Branding → Finish**, then `/admin/`. Long form (9 sections, binary VAT, Stripe-Connect-in-wizard, URL-paste brand import, first-event creator) was scrapped; those are anti-patterns no major commerce platform ships. Post-wizard setup lives on the dashboard via `OnboardingChecklist`.

- Identity: name + country + brand name. Country sets currency/timezone/VAT defaults silently via `provisionOrg`. Pre-fills from `user_metadata`.
- Branding: logo + 6 accent presets + custom hex + wallet sync.
- Finish: address + dashboard handoff.
- `BrandPreview.tsx`: live mobile event-page render in a phone frame (hero, ticket cards, footer). Don't replace with a stub card mockup — that was the rejected v1.
- `Shell.tsx`: three-dot progress, no persistent "Step N of N".
- `OnboardingChecklist` (`src/components/admin/`) wired into `/admin/page.tsx` — state from `/api/stripe/connect/my-account`, `/api/domains`, `/api/branding`, `/api/events`, `/api/team`. Items dismissable via localStorage; widget hides when empty.

When extending: link to existing admin surfaces, don't reproduce them in-wizard. Tests: `src/__tests__/onboarding-wizard.test.tsx`.

### Request Flow (Event Pages)
`/event/[slug]/` → middleware (org_id) → RootLayout (`<OrgProvider>`) → EventLayout (Server Component, parallel fetch event + settings + branding, CSS vars + `data-theme`) → `MidnightEventPage`.

### Caching
Event + admin: `force-dynamic`, `cache: "no-store"`. Media: `max-age=31536000, immutable`. Apple Pay verify: `max-age=86400`.

---

## Rep Platform v2 (Mobile-First Ambassador System)

Full backend rebuild shipped 2026-04-22 as spec v2.0. Native iOS client at `~/Projects/entry-ios/` consumes these endpoints. **All further rep-related work must match the spec shape** — `ENTRY-IOS-BACKEND-SPEC.md` in project root.

### First-Class Entities (new in v2)
- **Promoter** — public-facing brand identity, 1:1 with org. Table `promoters`. Admin editor at `/admin/promoter/`. Fields: handle, display_name, tagline, bio, accent_hex, cover_image_url, follower_count / team_size (denorm via triggers).
- **Rep** — platform-level identity. `reps.org_id` still populated for legacy reads; true team link is `rep_promoter_memberships` (status: pending|approved|rejected|left).
- **Follow graph** — `rep_promoter_follows` (soft, drives feed scope) + `rep_follows` (rep↔rep one-way; mutual = "friend").

### Rep Lifecycle
Free + open signup (`POST /api/auth/mobile-signup` or `POST /api/rep-portal/signup`) → browse via `/api/promoters/discover` → `POST /rep-portal/promoters/[handle]/join-request` (optional pitch) → tenant approves → active on that team. Reps can belong to many teams.

### Rep Auth
- Cookie (v1 web): `requireRepAuth()` → `{ rep }`.
- Bearer (native): `POST /api/auth/mobile-login` → `{ access_token, refresh_token, rep, settings }`. `/api/auth/mobile-refresh` rotates. Auth header: `Bearer <jwt>`.
- Apple Sign-In: deferred (Decision L). Stub at `/api/auth/mobile-login-apple`, env vars not wired.

### Two-Token Economy (XP + EP)
- **XP (`reps.points_balance`)** — platform-wide, never spent. Drives leveling (`lib/xp-levels.ts`) and tiers (`lib/rep-tiers.ts`, Rookie → Mythic). `awardPoints()` in `lib/rep-points.ts` writes `rep_points_log` + increments cache.
- **EP (`reps.currency_balance`)** — platform-wide, REAL MONEY. 1 EP = £0.01, 10% platform cut at payout (both in `platform_ep_config`). Every movement flows through `ep_ledger` (append-only, trigger-enforced UPDATE/DELETE block). Cache maintained by `ep_ledger_rep_cache_sync` trigger; `ep_rep_balance_drift` view surfaces any mismatch.
- **Balance views**: `ep_rep_balances`, `ep_tenant_float`, `ep_tenant_earned`.

### EP Economy Flow
1. Tenant buys EP → Stripe PI webhook → `tenant_purchase` ledger → +float
2. Quest approved w/ `ep_reward > 0` → `award_quest_ep` RPC → `tenant_quest_debit` + `rep_quest_credit` (atomic)
3. Rep claims reward → `claim_reward_atomic` RPC → `rep_shop_debit` (single row: -rep + +tenant earned)
4. Fulfillment via `lib/rep-reward-fulfillment.ts` (digital_ticket / guest_list / merch / custom); on failure → `cancel_claim_and_refund` RPC → `rep_shop_reversal`
5. Monthly `ep-payouts` cron → `plan_tenant_payouts` → `create_pending_payout` → Stripe Transfer (idempotent on payout id) → `complete_tenant_payout` → `tenant_payout` ledger + paid

### Quests + Rewards (v2 shape)
`rep_quests` gains: `promoter_id`, `subtitle`, `proof_type` (screenshot|url|text|instagram_link|tiktok_link|none), `cover_image_url`, `accent_hex`, `sales_target`, `xp_reward` (alongside `points_reward`), `ep_reward` (alongside `currency_reward`), `auto_approve`. Acceptances in `rep_quest_acceptances` (UX only). Submissions add `requires_revision`. Approval: `PUT /api/reps/quests/submissions/[id]` → `award_quest_ep` RPC.

`rep_rewards.reward_type`: `milestone` | `shop` | `manual` (v1 `points_shop` renamed). New: `ep_cost` (shop), `xp_threshold` (milestone), `stock` (NULL=unlimited), `fulfillment_kind`. `rep_reward_claims` adds `ep_spent`, `fulfillment_payload` JSONB, `fulfillment_reference`.

### Push Notifications (v2 fanout)
Dispatcher `lib/push/fanout.ts`. One `NotificationPayload` drives three transports: APNs (`lib/push/apns.ts`, stubbed pending `APNS_*` env vars), FCM (`lib/push/fcm.ts`, stubbed pending `FCM_SERVICE_ACCOUNT_JSON`), web (`lib/push/web.ts`, functional via VAPID).

`createNotification()` in `lib/rep-notifications.ts` writes `rep_notifications` + fans out to `device_tokens`; legacy `rep_push_subscriptions` fires only when the rep has no `device_tokens` rows (prevents double-send). Every attempt logged in `notification_deliveries`; `invalid_token` auto-disables the device.

**Notification types** (must stay in sync with `RepNotificationType` in `src/types/reps.ts` AND the DB CHECK): `reward_unlocked`, `quest_approved`, `quest_rejected`, `quest_revision_requested`, `sale_attributed`, `first_sale_for_event`, `level_up`, `leaderboard_top10`, `reward_fulfilled`, `manual_grant`, `approved`, `team_request_approved`, `team_request_rejected`, `poster_drop`, `peer_milestone`, `general`.

### Media Uploads (v2 signed-URL flow)
For rep-uploaded media (avatar, banner, quest proof screenshots): `POST /api/rep-portal/uploads/signed-url` → client PUTs direct to Supabase Storage → `POST /api/rep-portal/uploads/complete` verifies + returns `public_url`. Bucket: `rep-media` (public-read, server-signed writes). Per-kind caps: avatar 2MB, banner 3MB, quest_proof 8MB. Legacy `/api/upload` base64 flow still used for tenant branding.

### Seasons / Rank Delta / Streaks
- **Seasons** — cut from v1 (Decision J). Leaderboard uses rolling-30-day window. iOS formats masthead kicker client-side ("April 2026").
- **Rank snapshots** (`rep_rank_snapshots`) — weekly cron (`capture_rep_rank_snapshots` RPC) freezes each rep's rolling-30-day rank per promoter. Dashboard `leaderboard.delta_week` compares today vs 5–10 day-old snapshot.
- **Streaks** (`rep_streaks`) — dashboard GET calls `mark_rep_active` RPC (idempotent per day). Nightly cron `reset_stale_streaks` zeros `current_streak` for reps 2+ days inactive. `best_streak` held permanently.

### Account Deletion (App Store compliant)
`DELETE /api/rep-portal/me` — soft-deletes: `status='deleted'`, PII scrubbed (email → `deleted-{id}@entry.local`, name/photo/phone/bio/socials/DOB cleared), `auth_user_id` detached, device tokens + push subscriptions removed, memberships flipped to `left`. `rep.id` PRESERVED so ledger/orders FKs stay valid.

### Rep Components & Lib (legacy — freeze, do not add)
`src/components/rep/` (19 components), `src/lib/rep-*.ts` (11 modules), `useRepPWA` — all v1 web portal. Unchanged.

### Admin Reps (`/admin/reps/`)
6 tabs: Dashboard, Reps (CRUD), Quests, Reports (submissions), Rewards (shop), Settings. Team permissions: `perm_reps` (parent) + `perm_reps_manage|content|award|settings` (sub-perms auto-clear when parent disabled).

### New Admin Pages (v2)
- `/admin/promoter/` — edit public promoter profile
- `/admin/ep/` — 4 subtabs (Float, Earned, Ledger, Payouts) + Buy EP flow

### What's Paused / Deferred
- **Poster drops** — product call, §5.10 paused. Tables NOT created; `dashboard.feed` returns peer activity only.
- **Apple Sign-In** — until Google SSO is added.
- **Platform bonus EP** — Decision Q, schema-ready, no code path.

---

## Scanner PWA

`/scanner/` — 5 pages (dashboard, events, scan, login, settings). Service worker at `/scanner-sw.js`. Admin auth (`requireAuth()`). Scanner↔event assignments in `{org_id}_scanner_assignments`. Components: QRScanner, ScanResult, ScanHistory, ScanStats, EventCard, GuestListSearch, ManualEntry, ModeToggle, ScannerInstallPrompt. Routes: `scanner/events`, `scanner/events/[id]/stats`, `scanner/assignments`, `scanner/manifest`. Hook: `useScannerPWA`.

## Merch Store

`/shop/[slug]/` — standalone storefront outside event context. Tables: `merch_collections`, `merch_collection_items` (settings key: `merchStoreKey()`). Routes: `merch-store/settings` (GET/POST), `merch-store/collections` (+/[slug]), `merch-store/payment-intent` (public), `merch-store/confirm-order` (public). Lib: `src/lib/merch-orders.ts`. Types: `src/types/merch-store.ts`.

---

## Currency System (fiat)

Multi-fiat support for ticket purchases. Buyer currency auto-detected via geo-IP (`x-vercel-ip-country` header → `buyer_currency` cookie). Lib: `src/lib/currency/` (conversion, exchange-rates, country-currency-map, types). Route: `GET /api/currency/rates` (public). Cron: `cron/exchange-rates` every 6h. Settings key: `exchangeRatesKey()` (platform). Components: `CurrencyProvider.tsx`, `MidnightCurrencySelector`. **Not related to EP** — EP is platform-wide at a fixed rate.

---

## Database (Supabase)

### Tables

**Core (tenant-scoped by `org_id`):** `site_settings` (key-value JSONB config), `events`, `ticket_types`, `products`, `orders` (order_number FERAL-XXXXX, payment_ref), `order_items`, `tickets` (ticket_code FERAL-XXXXXXXX), `customers`, `artists`, `event_artists` (junction), `guest_list` (source enum, access_level, invite_token), `discounts`, `abandoned_carts`, `traffic_events`, `org_users` (perm_* flags), `domains`, `popup_events`, `payment_events` (append-only health log), `event_interest_signups`, `merch_collections`, `merch_collection_items`, `waitlist_signups`.

**Events extensions (v2):** `events.cover_image_url` / `poster_image_url` / `banner_image_url` — three distinct image slots per event (clean in-app / text-baked for Story share / 16:9 banner). Legacy `cover_image` + `hero_image` remain writable for v1 web pages.

**Rep Platform v2 tables:**
- `reps` — platform-level identity. `org_id` nullable post-v2 but still populated for legacy compat. `currency_balance` is a denormalised cache of `ep_rep_balances` view (maintained by ledger trigger; never mutate directly).
- `promoters` — public projection of a tenant org (1:1). `handle`, `display_name`, `accent_hex`, `cover_image_url`, `follower_count`, `team_size` (both denormalised via triggers), `visibility` (public|private).
- `rep_promoter_memberships` — rep↔promoter team link. `status` (pending|approved|rejected|left), per-membership `discount_code`, optional `pitch` (from join-request body). Trigger `rpm_team_size_sync` maintains `promoters.team_size`.
- `rep_promoter_follows` — soft follow (rep follows promoter). Trigger `rpf_follower_count_sync` maintains `promoters.follower_count`.
- `rep_follows` — rep↔rep, one-way. Mutual follow computed to "friend" in `/me/friends` endpoint.
- `rep_quests` — extended with `promoter_id`, `subtitle`, `proof_type` (CHECK-constrained), `cover_image_url`, `accent_hex`, `accent_hex_secondary`, `sales_target`, `xp_reward` (alongside legacy `points_reward`), `ep_reward` (alongside `currency_reward`), `auto_approve`.
- `rep_quest_submissions` — adds `requires_revision` flag. Status CHECK: `pending|approved|rejected|requires_revision`.
- `rep_quest_acceptances` — lightweight (rep_id, quest_id, accepted_at). UX flag only.
- `rep_rewards` — `reward_type` now `milestone|shop|manual` (`points_shop` renamed to `shop`). Adds `ep_cost`, `xp_threshold` (split from overloaded `points_cost`), `stock` (NULL = unlimited), `fulfillment_kind` (digital_ticket|guest_list|merch|custom).
- `rep_reward_claims` — adds `ep_spent`, `fulfillment_payload` (JSONB), `fulfillment_reference`. Status CHECK: `claimed|fulfilling|fulfilled|cancelled|failed`.
- `rep_rank_snapshots` — weekly snapshot (promoter_id, rep_id, rank, captured_at). Written by `capture_rep_rank_snapshots()` cron.
- `rep_streaks` — per rep. `current_streak`, `best_streak`, `last_active_date`.
- `rep_points_log` — legacy XP history, still written alongside ledger for v1 web compat.
- `rep_notifications` — in-app notification inbox. Type CHECK covers all v2 types (see Push section).
- `rep_push_subscriptions` — legacy web-push. New clients use `device_tokens`.
- Other existing: `rep_events`, `rep_milestones`, `rep_event_position_rewards`.

**EP Economy tables (Phase 3):**
- `platform_ep_config` — singleton (id=1). `fiat_rate_pence`, `platform_cut_bps`, `min_payout_pence`, `refund_window_days`. Only platform owner writes.
- `ep_ledger` — **APPEND-ONLY** event-sourced source of truth. 11 entry types covering every tenant/rep EP movement. Triggers `ep_ledger_no_update` + `ep_ledger_no_delete` block UPDATE/DELETE (use reversal-typed new rows instead). Trigger `ep_ledger_rep_cache_sync` maintains `reps.currency_balance` on INSERT.
- `ep_tenant_purchases` — Stripe PaymentIntent records for tenant EP buys.
- `ep_tenant_payouts` — Stripe Transfer records for monthly tenant cash-outs.

**Push tables (Phase 4):**
- `device_tokens` — unified push registry (`platform` ios|android|web, `token`, `push_enabled`, `last_seen_at`). Replaces `rep_push_subscriptions` for new devices.
- `notification_deliveries` — per-attempt log. Status: `sent|failed|invalid_token|skipped`.

### Views (always-correct, derived from ledger)
- `ep_rep_balances` — rep EP balance from ledger SUM(CASE entry_type)
- `ep_tenant_float` — tenant EP available for quest rewards
- `ep_tenant_earned` — tenant EP redeemed by reps, owed at next payout
- `ep_rep_balance_drift` — diagnostic: rows here = cache/ledger mismatch (should always be empty)

### RPCs

**Rep Platform v2:**
- `award_quest_ep(rep_id, tenant_org_id, ep_amount, quest_submission_id, fiat_rate_pence)` — atomic: tenant_quest_debit + rep_quest_credit. Raises `insufficient_float` (P0001) if float < amount.
- `reverse_quest_ep(...)` — partial clawback (only what rep still has, tenant absorbs difference per §7.4).
- `claim_reward_atomic(rep_id, org_id, reward_id, points_cost)` — locks rep + reward, verifies ledger balance, writes `rep_shop_debit`, creates claim row, decrements stock. Returns `{success, claim_id, new_balance, stock_remaining}` or `{error, balance?}`.
- `cancel_claim_and_refund(claim_id, reason)` — writes `rep_shop_reversal`, restores stock, marks claim cancelled.
- `plan_tenant_payouts()` → table of eligible tenants (earned × rate × (1 − cut) ≥ min_payout_pence).
- `create_pending_payout(...)` → UUID of new `ep_tenant_payouts` row (status='pending').
- `complete_tenant_payout(payout_id, stripe_transfer_id)` → idempotent ledger write + status='paid'.
- `fail_tenant_payout(payout_id, reason)` → status='failed'.
- `capture_rep_rank_snapshots()` → weekly cron. Returns `{promoters_processed, reps_snapshotted}`.
- `mark_rep_active(rep_id, today?)` → returns updated `{current_streak, best_streak, last_active_date}`. Idempotent per day.
- `reset_stale_streaks()` → nightly cron. Returns count reset.
- `test_cleanup_ep_ledger(tenant_org_id)` — TEST ONLY, refuses non-`__test*` orgs.

**Existing:** `claim_reward_atomic()` (refactored in Phase 3.7 to go through ledger), `reverse_rep_attribution()`, `get_rep_program_stats()`, `increment_sold()`, `increment_discount_used()`, `set_updated_at()` (shared trigger helper).

Table names defined in `TABLES` constant in `lib/constants.ts` — always use `TABLES.X` not raw strings.

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

**Per-org keys** (pattern: `{org_id}_*`): `generalKey()`, `brandingKey()`, `themesKey()`, `vatKey()`, `homepageKey()`, `repsKey()`, `abandonedCartAutomationKey()`, `announcementAutomationKey()`, `popupKey()`, `marketingKey()`, `emailKey()`, `walletPassesKey()`, `eventsListKey()`, `stripeAccountKey()`, `planKey()`, `onboardingKey()`, `merchStoreKey()`, `scannerAssignmentsKey()`, `guestListSettingsKey()`, `guestListSubmissionsKey()`, `guestListCampaignsKey()`, `waitlistKey(orgId, eventSlug)` (waitlist settings per event). Also `{org_id}_pdf_ticket` (no helper).

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

### Rep Platform v2 Routes (Phase 0-5, `requireRepAuth()` unless noted)

**Native auth** (public): `POST /api/auth/mobile-login` (email+password → JWT pair), `POST /api/auth/mobile-refresh` (rotate refresh token). `mobile-login-apple` stub exists (deferred).

**Rep self-service** (`/api/rep-portal/*`):
- `me` (GET/PUT/PATCH/**DELETE**) — DELETE = App Store soft-delete
- `me/memberships` — all teams grouped by status
- `me/balances` — lightweight xp/ep/lifetime for polling (Live Activity)
- `me/following/promoters` — paginated
- `me/friends` — computed mutual-follow
- `me/push-preferences` (PATCH) — toggles push_enabled on all devices
- `dashboard` — the big §6.3 aggregate. `?promoter_id=` and `?include=` params.
- `quests` (§6.5 shape, with acceptances + my_submissions)
- `quests/[id]/accept`
- `quests/[id]/submissions` (existing)
- `rewards` + `rewards/[id]/claim` — shop
- `reward-claims`
- `promoters/[handle]/follow` (POST/DELETE)
- `promoters/[handle]/join-request` (POST with `{pitch}` / DELETE to withdraw)
- `devices` (POST) + `devices/[token]` (DELETE) — push token registry
- `uploads/signed-url` + `uploads/complete` — signed-URL media flow
- `feed` (peer activity only; drops paused)
- `peer-activity` — no pagination wrapper, ticker feed
- Legacy still here: login, logout, signup, magic-login, invite/[token], verify-email, manifest, push-subscribe, push-vapid-key, upload (legacy base64), discount, leaderboard, sales, points, notifications, quests/submissions, profile/[id], join-event.

**Public promoter discovery** (`/api/promoters/*`, no auth but auth-aware via optional Bearer):
- `discover?q=&limit=&offset=` — rate-limited search
- `[handle]` — profile with featured_events + is_following/is_on_team (if authed)

**Admin rep management** (`/api/reps/*`, `requireAuth()`, ~35 routes): CRUD, settings, stats, events/assign/summary, quests (POST + PUT allowlists now cover new v2 fields), submissions (PUT handles `approved|rejected|requires_revision`, writes ledger via RPC), rewards (POST + PUT allowlists cover `ep_cost`, `stock`, `fulfillment_kind`), claims, points, milestones, campaign-events, leaderboard lock/rewards.

**Admin promoter/EP surfaces:**
- `/api/admin/promoter` (GET/PATCH) — tenant's own promoter profile
- `/api/admin/ep/purchase-intent` (POST) — Stripe PaymentIntent for buying EP
- `/api/admin/ep/balance` — float + committed + earned summary
- `/api/admin/ep/ledger?limit=&offset=&entry_type=` — paginated ledger view
- `/api/admin/ep/payouts` — payout history

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
| `*/15 * * * *` | `/api/cron/guest-list-reminders` | Guest list RSVP reminder emails |
| `*/30 * * * *` | `/api/cron/stripe-health` | Payment health check |
| `0 */6 * * *` | `/api/cron/payment-digest` | AI payment digest |
| `0 */6 * * *` | `/api/cron/exchange-rates` | Currency exchange rate update |
| `5 0 * * *` | `/api/cron/rep-streak-reset` | Zero stale streaks (Phase 5.2) |
| `0 2 * * 1` | `/api/cron/rep-rank-snapshots` | Weekly rolling-30-day rank capture (Phase 5.1) |
| `0 3 1 * *` | `/api/cron/ep-payouts` | Monthly tenant EP → cash payout (Phase 3.8) |

---

## Hooks

21 hooks in `src/hooks/`: `useBranding`, `useSettings`, `useCart`, `useShopCart`, `useEventTracking`, `useMetaTracking`, `useDataLayer`, `useDashboardRealtime`, `useLiveSessions`, `useTraffic`, `useHypeQueue`, `useCountdown`, `useOrgTimezone`, `useOrgCurrency`, `useCurrency`, `useHeaderScroll`, `useScrollReveal`, `useCountUp`, `usePopupSettings`, `useRepPWA`, `useScannerPWA`.

**Referential stability (CRITICAL)**: hooks returning objects/functions in effect deps MUST use `useMemo`. Stable-ref hooks: `useMetaTracking`, `useDataLayer`, `useEventTracking`, `useSettings`, `useBranding`, `useDashboardRealtime`. Destructure callbacks as deps — never the whole object. `useMetaTracking` checks `feral_cookie_consent` localStorage for `marketing: true`. `useMetaTracking` + `useBranding` persist state at module scope — tests must account for this.

---

## Environment Variables

**Required**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`
**Optional**: GTM, Klaviyo, Mux, VAPID (web-push), Apple/Google Wallet certs, Vercel API, Sentry, Anthropic API
**Monitoring**: `PLATFORM_ALERT_EMAIL`, `ANTHROPIC_API_KEY` (optional), `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
**Rep Platform v2 push** (required to light up APNs/FCM; transport stubs fall through to `skipped` status without them):
- APNs: `APNS_AUTH_KEY_P8` (full PEM), `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_USE_SANDBOX` (optional, `true` for dev)
- FCM: `FCM_SERVICE_ACCOUNT_JSON` (stringified service-account JSON)

---

## Testing

**Framework**: Vitest + @testing-library/react (jsdom). Config: `vitest.config.ts` (projects: `unit` + `integration`). Setup: `src/__tests__/setup.ts`.

**Scripts**: `npm test` (unit only, 1.6s), `npm run test:integration` (real DB, ~97s), `npm run test:all` (both).

**Unit tests**: 30 suites, 465 tests. **Integration tests**: 4 suites incl. 6 EP money-path tests (`ep-money-paths.integration.test.ts`) asserting zero `ep_rep_balance_drift` after every state change. Real Supabase + Stripe mocked, scoped to `org_id = '__test_integration__'`.

**Pre-push hook** (`.git/hooks/pre-push`): runs `npm test` AND `npx tsc --noEmit -p tsconfig.build.json`. The TS check catches build errors in API routes that vitest doesn't type-check (lesson from the Phase 2.6 RepNotificationType miss). Never skip. `tsconfig.build.json` excludes test files to match what Next's `next build` actually checks.

**CI gate**: `vercel-build` script runs unit tests before `next build`. Failed tests → failed deploy.

**MANDATORY before committing**: Always run `npm test`. When changes touch payment/checkout code (`stripe/`, `lib/orders.ts`, `lib/stripe/`, checkout components), also run `npm run test:integration` before pushing.

**Rules**: New hooks need test files. New API routes should have tests. Referential stability tests mandatory for hooks with object/function deps. Test state logic, API shape, edge cases, payment flows — not UI rendering or CSS.

---

## Platform Health Monitoring — AI Workflow

When asked to "check health" / "look at errors" / "fix what's broken":

1. **Fetch**: Sentry unresolved (EU region, `$SENTRY_AUTH_TOKEN` from `.env.local`); `payment_events WHERE resolved = false` via Supabase MCP; `/api/platform/platform-health?period=24h`.
2. **Triage**: FIX 500s / React errors / checkout + webhook failures. RESOLVE (not bugs): card_declined (normal 2-5%), network timeouts, bot 401s. IGNORE: single non-reproducible errors.
3. **Fix → Commit → Resolve**: Sentry `PUT /api/0/issues/ISSUE_ID/` with `{"status":"resolved"}` + comment. Payment events: Supabase UPDATE `resolved=true, resolution_notes='...'`.

Investigate before resolving — never bulk-resolve. **Payment orphans are CRITICAL** (money taken, no ticket). Card declines are normal. Without `org_id` = platform-wide (higher priority). For Stripe actions, give step-by-step instructions.

---

## Design & CSS

**Brand**: Admin/Entry primary `#8B5CF6` (Electric Violet); gradient `linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)`. Public event pages: tenant-configurable via branding (accent, bg, card tokens in `base.css :root`). Admin tokens via `@theme inline` in `tailwind.css` (semantic: background, foreground, primary, card, border, destructive, success, warning, info) — use classes, never hardcode hex.

**CSS Systems**: Landing = hand-written (`base.css`, `header.css`). Event pages = Tailwind + `midnight.css` / `midnight-effects.css` / `hero-effects.css`. Admin = Tailwind + shadcn/ui + `command.css`. Rep v1 = Tailwind + `rep-effects.css`. Scanner = Tailwind + `scanner.css`.

**Isolation & layer rules (DO NOT BREAK)**: `@layer theme, admin-reset;` then `@import "tailwindcss/utilities"` UNLAYERED. Never add `layer(utilities)` or global `*` resets. Scopes: `[data-admin]`, `[data-theme="midnight"]`, `[data-rep]`.

**Component rules**: Midnight theme components import CSS only in the orchestrator (`MidnightEventPage`), children don't. Mobile-first 375px, `prefers-reduced-motion` supported. Admin pages are `"use client"` with shadcn/ui; settings fetch from `site_settings`, save via `/api/settings`; uploads POST base64 to `/api/upload` for tenant branding (rep-uploaded media uses the signed-URL flow instead). shadcn/ui components live in `src/components/ui/` (28 of them), use Radix + `cn()` from `@/lib/utils`.

---

## Guest List Manager

`/admin/guest-list/` — 4 tabs (Guests, Artist Links, Applications, Settings). Access levels: `guest_list` (default), `vip`, `backstage`, `aaa`, `artist` — hidden ticket types auto-created per event per level.

**Three sources** (`guest_list.source`): `direct` (admin invites → `/guest-list/rsvp/[token]`), `artist` (quota submission link → `/guest-list/submit/[token]`), `application` (landing page `/guest-list/apply/[campaignId]` → admin reviews → free or paid acceptance).

**Paid applications**: Stripe CardNumber/Expiry/CVC fields. `/api/guest-list/application-payment` (card only), `/api/guest-list/application-confirm` → `issueGuestListTicket()`. Webhook backup on `metadata.type === "guest_list_application"`.

**Key files**: `src/lib/guest-list.ts`, `src/types/guest-list.ts`, `src/app/admin/guest-list/page.tsx` + `src/components/admin/guest-list/` (4 tabs), `src/app/guest-list/` (public: rsvp, submit, apply, accept). Settings keys: `guestListSettingsKey()`, `guestListSubmissionsKey()`, `guestListCampaignsKey()`. Scanner syncs `guest_list.checked_in` on scan.

---

## Known Gaps
1. **Google Ads + TikTok tracking** — placeholders only
2. **Aura theme** — 18 components still in `src/components/aura/`, deprecated, pending removal
3. **APNs + FCM credentials** — transport code shipped but waiting on Apple Developer P8 key + Firebase service account JSON. Until those env vars exist, iOS and Android pushes log as `skipped` status in `notification_deliveries`.
4. **Web `/rep/*` portal** — frozen. Will be rebuilt to v2 spec after iOS launches in the wild.
5. **Poster drops** — paused per owner decision. No `poster_drops` table or route exists; `dashboard.feed` returns peer-activity only.
6. **Apple Sign-In** — deferred until Google SSO is added (App Store guideline 4.8 only triggers when third-party SSO is offered).

---

## Document Maintenance

1. Read this file at session start — the map.
2. Update after architecture changes (tables, routes, modules).
3. Delete deprecated references — no dead code documented.
4. Keep under 40K chars — compress, don't drop useful info.
5. Wrong docs = wrong assumptions. Undocumented = unknown.
