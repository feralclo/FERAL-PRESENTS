# Entry — Platform Context

## Mission
White-label events + ticketing platform ("Shopify for Events"). Today powers FERAL; goal is any promoter sells tickets/merch under their brand, platform takes a fee. Every tenant query filters by `org_id` (where the table has one). Every feature must work for non-FERAL orgs.

## Status

**Beta**: `BETA_MODE = true` (`lib/beta.ts`). Queued initiatives: multi-tenant audit (`AUDIT-PROMPT.md`), Midnight redesign (`MIDNIGHT-REDESIGN-PROMPT.md`).

**Rep Platform v2** (spec v2.0, shipped 2026-04-22): backend for native iOS app at `~/Projects/entry-ios/`. Source of truth `ENTRY-IOS-BACKEND-SPEC.md`. EP currency, promoters as first-class entities, follow graph, push fanout, ledger-backed flows. Legacy web `/rep/*` FROZEN.

**Round 2** (locked 2026-04-24): Stories, Entry Market (platform-only, ex-Shopify), public rep profiles, moderation, event attendance, App Store readiness (terms/privacy/account-delete/activity, reviewer seed `scripts/seed-apple-review.ts`).

**Event Builder Rebuild**: Phases 0–4 ✅ shipped 2026-04-29. Canvas editor at `/admin/events/{slug}/` — two-pane shell, six narrative sections (Identity/Story/Look/Tickets/Money/Publish) + sticky live phone-frame preview, click-to-scroll-sync, real-time readiness gating one-button Publish, mobile sheet behind a floating Preview pill. **Phase 4 (Tickets-as-the-heart)**: Release Strategy panel (single source of truth for group + sequential config — replaces deleted `GroupManager.tsx`), Sales Timeline card with anchored event-date projection ("at this pace you'll reach ~N tickets by Sat 5 May"), time-to-unlock estimates honest about confidence. Editor surface deliberately minimal: **"Add ticket" + small "Add multiple" popover for batch-by-count** — no in-editor templates (templates only at the Start Moment `/admin/events/new`). `tmp-*` client ids (`lib/ticket-tmp-id.ts`) make the per-card Group dropdown work pre-save. Plan: `EVENT-BUILDER-PLAN.md`. Phases 5–6 deferred. **Admin design system: `docs/admin-ux-design.md` — read before any `/admin/*` UI work.** Public surfaces use Midnight (glass-on-dark) — never mix.

## Build Standards (CRITICAL)

Scaling to 1000+ tenants. Production-grade — no shortcuts.

1. **Complete implementations** — error states, loading states, mobile, multi-tenant, typed.
2. **Multi-tenant always** — tenant queries filter by `org_id`. Settings keys via `{org_id}_*` helpers. Mentally test with non-FERAL org.
3. **Mobile-first 375px** — 70%+ buyers on phones. Touch targets ≥44px.
4. **Follow existing patterns** — find the closest equivalent before inventing.
5. **Test what matters** — `npm test` before commit; integration tests for payment/checkout/EP; new hooks need tests.
6. **No dead code** — no commented-out code, unused imports, TODO placeholders.
7. **Proper error handling** — 400/401/403/404/500. try/catch + Sentry on unexpected.
8. **Right Supabase client** — `getSupabaseAdmin()` for data, `getSupabaseServer()` for auth only. Wrong client = silent data loss.

## Stack

Next.js 16 App Router + React 19 + TS (strict). Supabase (Postgres + REST + Realtime + Storage). Stripe 20 (Connect Custom + OAuth Standard). Vercel. Tailwind v4 + shadcn/ui (Radix). Vitest. Resend. Mux. Sentry. Spotify Web API. GTM + Meta CAPI. Klaviyo. Web-push (VAPID). APNs (P8 JWT). FCM (HTTP v1). Apple/Google Wallet. qrcode, jsPDF. Space Mono + Inter.

## Project Structure

```
src/
├── instrumentation.ts, middleware.ts (Sentry init / auth + org_id)
├── app/
│   ├── layout.tsx, page.tsx, global-error.tsx, robots.ts, sitemap.ts
│   ├── event/[slug]/, events/, shop/[slug]/
│   ├── scanner/, guest-list/, invite/, auth/
│   ├── privacy/, terms/      # App Store legal (live 2026-04-26)
│   ├── admin/                # 33 dirs (see Admin Pages Index)
│   ├── rep/                  # FROZEN v1 web (12 pages)
│   └── api/                  # 280 route handlers
├── components/               # 194 files / 11 subdirs
│   ├── admin/                # 66 files; subs: command dashboard event-editor guest-list reps ui
│   ├── midnight/             # 27 theme components
│   ├── ui/                   # 28 shadcn/ui (Radix)
│   ├── event, checkout, shop, scanner, events, rep, landing, layout
│   └── OrgProvider.tsx (+ useOrgId), CurrencyProvider.tsx, SmartLogo.tsx
├── hooks/                    # 21 hooks
├── lib/                      # 76 root files + 8 subdirs (currency/ ep/ market/ push/ spotify/ stripe/ supabase/ uploads/)
├── styles/, types/
```

---

## Architecture

### Multi-Tenancy: Dynamic org_id Resolution
Tenant-scoped tables have `org_id`. **Never hardcode `"feral"`.** Rep/platform/EP/market/notification tables are NOT org-scoped (rep-keyed or platform-singleton).

Middleware resolves: admin host + logged in → `org_users` (user.id → org_id); tenant host → `domains` (hostname → org_id); fallback → `"feral"`. Hosts: `admin.entry.events` = admin; `{slug}.entry.events` = tenant; custom domains via `domains`; `localhost`/`*.vercel.app` = dev.

Access: server `getOrgId()`, auth API `auth.orgId`, public API `getOrgIdFromRequest(req)`, client `useOrgId()` (from `components/OrgProvider.tsx`). Middleware caches 60s.

### Auth & Security

Two systems: Admin (`requireAuth()` → `{user, orgId}`) + Rep (`requireRepAuth()` → `{rep}`). Platform owner: `requirePlatformOwner()`. Role flags in Supabase `app_metadata` (additive): `is_admin`, `is_rep`, `is_platform_owner`. Dual-role supported.

**New routes**: Admin → `requireAuth()` w/ `auth.orgId`; Rep → `requireRepAuth()` w/ `rep.org_id`; Platform → `requirePlatformOwner()`; Public → `getOrgIdFromRequest(req)` + add to `PUBLIC_API_PREFIXES`/`PUBLIC_API_EXACT_GETS` in `middleware.ts`. Never import `ORG_ID`. Stripe webhook always verifies signatures in prod.

**Public routes** (no auth): Stripe payment/checkout, events/settings/merch/branding GETs, track/meta/discounts/popup POSTs, cron (CRON_SECRET), auth/*, beta/*, rep auth + signup-google, wallet downloads, guest-list public flows, scanner/manifest, merch-store payment, brand/logo + logo-png, currency/rates, promoters/*, terms, privacy.

### Payment System (Stripe)
Event pages → `NativeCheckout` → `ExpressCheckout` (Apple/Google Pay). PaymentIntent (idempotency key) → confirm → webhook → order + tickets + email. Stock reserved via `increment_sold()` (false=sold out, rollback). Discounts validated server-side; `increment_discount_used()` atomic. Health logged via `logPaymentEvent()` → `payment_events`. Refunds restore via `decrement_sold()` + `decrement_discount_used()`.

External tickets: `payment_method:"external"` → `MidnightExternalPage`. Imported: CSV via `/admin/import-tickets/`, no public surface.

**Stripe Connect (dual-path):**
- **Custom** (default tenant flow): `/admin/payments/` — five-state machine (incomplete → action-needed → under-review → needs-bank → live). Hosted KYC (not embedded ConnectJS). Routes `/api/stripe/connect/my-account/*`.
- **OAuth Standard**: `/api/stripe/connect/oauth/{start,callback}` — for tenants with existing Stripe accounts.
- **Platform admin**: `/admin/connect/` (owner only) — all accounts, fee defaults, capabilities.
- Per-event: `event.stripe_account_id` → `{org_id}_stripe_account` → platform. GBP/EUR/USD smallest unit. Rate limit 10/min/IP.
- **Apple Pay sync** (`lib/apple-pay.ts`): every active tenant domain auto-registered on its Connect account. Idempotent — called on domain create/verify, page load, webhook.

**Plans**: Starter (free, 3.5%+30p min) / Pro (£29/mo, 2%+10p min). PLANS data `lib/plans-data.ts`; getters `lib/plans.ts`. Stored `{org_id}_plan`. Billing `/api/billing/checkout` → Stripe Checkout → webhook.

**EP economy** (separate flow): see Rep Platform v2.

### Refund Flow
`lib/refund.ts` — atomic, idempotent. Update order → cancel tickets → `decrement_sold()` → decrement discount usage → sync customer totals → `reverse_rep_attribution()` → send refund email once → record `orders.refunded_by`. Both `POST /api/orders/[id]/refund` (admin) and webhook (`charge.refunded`) use it.

### Theme System
Single theme **Midnight**. Tenant identity ships via branding (accents/logo/fonts), not theme swap. Routing: `external` → `MidnightExternalPage`; default → `MidnightEventPage`; `tickets_live_at` future → `MidnightAnnouncementPage` (countdown + signup); `queue_enabled` + `queue_window_minutes` → `MidnightQueuePage` (`useHypeQueue`; `?preview=tickets` bypasses). Builder UI `/admin/ticketstore/`.

### Error Monitoring (Sentry)
Three layers: Sentry (crash + replay 5%/100% on error), Payment Monitor (`payment_events`), AI Digest (Haiku every 6h). Config `sentry.{client,server,edge}.config.ts`. Tunnel `/api/monitoring`. Context via `setSentryOrgContext()`/`setSentryUserContext()`. Boundaries `global-error.tsx`, `admin/error.tsx`, `event/[slug]/error.tsx`. Health `/admin/backend/health/`.

### White-Label Branding
`{org_id}_branding` in `site_settings`: logo, name, colors, fonts, copyright, accent presets. Event layout server-renders CSS vars (no FOUC). Client `useBranding()`. API `/api/branding`. **Logo PNG**: `GET /api/brand/logo-png?variant=black|white|violet&size=N&width=W&height=H` — rasterises wordmark via `next/og` (Stripe Dashboard rejects SVG-with-web-fonts). **Wallet sync** (`lib/wallet-brand-sync.ts`) mirrors branding into Apple/Google Wallet passes async on save. Helpers: `lib/color-presets.ts`, `lib/font-pairings.ts`, `lib/logo-contrast.ts`.

### Sequential Ticket Release
Per-group, reveal one-at-a-time on sellout (computed from `sold`/`capacity`). Config `ticket_group_release_mode` in EventSettings JSONB. Logic `lib/ticket-visibility.ts`; server validates via `validateSequentialPurchase()`.

### Artist / Lineup
`artists` + `event_artists` (junction `sort_order`). Admin CRUD `/admin/artists/`, `ArtistLineupEditor` in event editor. `events.lineup` string[] fallback.

### Beta Signup
`/admin/signup/` (or `/signup-google/`) → invite → `/admin/beta/` → owner approves → email → signup → `/admin/onboarding/`. `provisionOrg()` (`lib/signup.ts`) creates `org_users`, `domains`, `site_settings`, seeds `promoters`.

### Onboarding Wizard
`/admin/onboarding/` — **Identity → Branding → Finish**. Post-wizard setup lives on dashboard via `OnboardingChecklist` — when extending, link to existing surfaces, don't reproduce in-wizard.

- Identity: name + country + brand → `provisionOrg` sets currency/timezone/VAT (pre-fills from `user_metadata`).
- Branding: logo + 6 accent presets + custom hex + wallet sync. `BrandPreview.tsx` = live mobile event-page render in phone frame.
- `OnboardingChecklist` in `/admin/page.tsx` pulls `/api/stripe/connect/my-account`, `/api/domains`, `/api/branding`, `/api/events`, `/api/team`. Dismissable via localStorage.
- Pre-org state: `wizardStateKey(authUserId)`. Submit: `POST /api/onboarding` → `{org_id}_onboarding`. Tests: `src/__tests__/onboarding-wizard.test.tsx`.

### Request Flow (Event Pages)
`/event/[slug]/` → middleware (org_id) → RootLayout (`<OrgProvider>`) → EventLayout (SC; parallel-fetches event/settings/branding; sets CSS vars + `data-theme`) → `MidnightEventPage`.

### Caching
Event + admin: `force-dynamic`, `cache:"no-store"`. CDN: event `s-maxage=60, swr=300`; admin `no-cache` (`vercel.json`). Media `max-age=31536000, immutable`. Apple Pay verify `max-age=86400`. **Vercel Data Cache OFF** for `/api/branding` + `/api/stripe/connect/*` (cross-tenant leak fix Mar 2026) — use `cache:"no-store"` on internal fetches there.

### Content Security Policy
Defined in `next.config.ts` (`cspDirectives`). Currently allows: GTM, Meta Pixel, Stripe.js, Google Pay (scripts/frames); Google Fonts (style/font); Stripe Connect, Mux player (frame/media/worker); Supabase (incl. wss), Stripe API, Google Pay, Meta CAPI, Klaviyo, GTM, Mux streaming + analytics, Sentry, **`places.googleapis.com`** (connect). **When adding any new external SDK/API: update CSP in `next.config.ts` first.** Forgetting this → silent browser blocks no Sentry breadcrumb catches. Domain change checklist: `URL-CHANGE-CHECKLIST.md`.

---

## Rep Platform v2

Native iOS at `~/Projects/entry-ios/` consumes these endpoints. Match the spec — `ENTRY-IOS-BACKEND-SPEC.md`.

### First-Class Entities
- **Promoter** — public brand identity, 1:1 with org. Table `promoters`. Editor `/admin/promoter/`. Fields: handle, display_name, tagline, bio, accent_hex, cover_image_url, follower_count + team_size (denormed via triggers).
- **Rep** — platform-level identity. `reps.org_id` populated for legacy reads; true team link is `rep_promoter_memberships` (status: pending|approved|rejected|left).
- **Follow graph** — `rep_promoter_follows` (soft, drives feed scope) + `rep_follows` (rep↔rep one-way; mutual = "friend").

### Rep Lifecycle
Free open signup (`POST /api/auth/mobile-signup`, `/rep-portal/signup`, or Google via `signup-google`) → browse `/api/promoters/discover` → `POST /rep-portal/promoters/[handle]/join-request` (optional pitch) → tenant approves (auto-approve available) → active on team. Reps can join many teams.

### Rep Auth
- Cookie (web v1): `requireRepAuth()` → `{rep}`.
- Bearer (native): `POST /api/auth/mobile-login` → `{access_token, refresh_token, rep, settings}`. `/mobile-refresh` rotates. Header `Bearer <jwt>`.
- Google Sign-In live (Supabase OAuth, mobile + web). Apple Sign-In deferred (Known Gap #5).

### Two-Token Economy (XP + EP)
- **XP** (`reps.points_balance`): platform-wide, never spent. Drives leveling (`lib/xp-levels.ts`) + tiers (`lib/rep-tiers.ts`, Rookie→Mythic). `awardPoints()` writes `rep_points_log` + cache.
- **EP** (`reps.currency_balance`): platform-wide, REAL MONEY. 1 EP = £0.01, 10% platform cut at payout (both in `platform_ep_config`). All movement flows through `ep_ledger` (append-only, trigger-enforced). Cache via `ep_ledger_rep_cache_sync`. Drift surfaced by `ep_rep_balance_drift` view.

### EP Economy Flow
1. Tenant buys EP → Stripe PI webhook → `tenant_purchase` ledger → +float. Off-session card: `epBillingKey()`.
2. Quest approved w/ `ep_reward > 0` → `award_quest_ep` → `tenant_quest_debit` + `rep_quest_credit` (atomic).
3. Rep claims (shop or market) → `claim_reward_atomic` / `claim_market_product_atomic` → `rep_shop_debit`.
4. Fulfillment via `lib/rep-reward-fulfillment.ts` (digital_ticket/guest_list/merch/custom); failure → `cancel_claim_and_refund` / `cancel_market_claim_and_refund` → `rep_shop_reversal`.
5. Monthly `ep-payouts` cron → `plan_tenant_payouts` → `create_pending_payout` → Stripe Transfer (idempotent) → `complete_tenant_payout` → `tenant_payout` ledger.

### Quests + Rewards
`rep_quests` v2: `promoter_id`, `subtitle`, `proof_type` (screenshot|url|text|instagram_link|tiktok_link|none), `cover_image_url` (image or Mux capped-1080p video), `accent_hex` + `_secondary`, `sales_target`, `xp_reward` + `ep_reward` (alongside legacy `points_reward`/`currency_reward`), `auto_approve`, `share_url` (auto-stamped on approval). `rep_quest_acceptances` UX-only. Submissions add `requires_revision`. Approval: `PUT /api/reps/quests/submissions/[id]` → `award_quest_ep`.

`rep_rewards.reward_type`: `milestone|shop|manual`. Adds `ep_cost`, `xp_threshold`, `stock` (NULL=∞), `fulfillment_kind` (digital_ticket|guest_list|merch|custom). `rep_reward_claims` adds `ep_spent`, `fulfillment_payload`, `fulfillment_reference`; status `claimed|fulfilling|fulfilled|cancelled|failed`.

### Push Notifications
Dispatcher `lib/push/fanout.ts`. One `NotificationPayload` → 3 transports: APNs (`apns.ts`, live HTTP/2 + ES256 JWT), FCM (`fcm.ts`, stubbed — see Known Gap #2), web (`web.ts`, VAPID). `createNotification()` in `lib/rep-notifications.ts` writes `rep_notifications` + fans out to `device_tokens`. Legacy `rep_push_subscriptions` only fires if rep has no `device_tokens` (prevents double-send). Every attempt logged in `notification_deliveries`; `invalid_token` auto-disables. `read_at` synced via trigger. **Types**: `RepNotificationType` (`src/types/reps.ts`) + DB CHECK must match — add new types in BOTH.

### Media Uploads
Rep-uploaded: `POST /api/rep-portal/uploads/signed-url` → client PUTs direct to Supabase Storage → `POST /uploads/complete` verifies + returns `public_url`. Bucket `rep-media` (public-read, server-signed writes). Caps in `lib/uploads/rep-media-config.ts`: avatar 2MB, banner 3MB, quest_proof 8MB, story_image 8MB, story_video 50MB (mp4/quicktime). Legacy `/api/upload` base64 still used for tenant branding + admin uploads. Quest video via `/api/upload-video` → Mux `mp4_support: capped-1080p`. Helpers in `lib/mux.ts`: `getMuxStreamUrl()`, `getMuxDownloadUrl()`, `getMuxThumbnailUrl()`.

### Seasons / Rank Delta / Streaks
**Seasons** cut — leaderboard is rolling-30-day, iOS formats masthead client-side. **Rank snapshots** (`rep_rank_snapshots`): weekly cron freezes per-promoter rolling-30-day rank; `leaderboard.delta_week` = today vs 5–10-day-old snapshot. **Streaks** (`rep_streaks`): dashboard GET calls `mark_rep_active` (idempotent per day); nightly `reset_stale_streaks` zeros `current_streak` for reps 2+ days inactive; `best_streak` permanent.

### Account Deletion (App Store) + Activity Feed
`DELETE /api/rep-portal/me` — soft-delete: `status='deleted'`, PII scrubbed, `auth_user_id` detached, device tokens removed, memberships → `left`, blocks/reports/follows preserved. **`rep.id` PRESERVED** for ledger/orders FKs.

`GET /api/rep-portal/me/activity` — personal feed (quest approvals, level-ups, claims, rejections, rank movements; paginated). Distinct from `feed` (peer ticker).

### Admin Reps (`/admin/reps/`)
6 tabs: Dashboard, Reps, Quests, Reports (submissions), Rewards, Settings. Permissions: `perm_reps` (parent) + `perm_reps_{manage,content,award,settings}` (sub-perms auto-clear when parent off).

### Paused / Deferred
See Known Gaps for poster drops, Apple Sign-In, Entry Market admin UI, story moderation queue. Schema-ready but no code path: **Platform bonus EP**.

---

## Stories (Round 2)

Mandatory-Spotify-track ephemeral posts by reps, 24h expiry. `rep_stories` snapshots full Spotify track at submit (track_id, preview_url, clip_start/length, title, artist, album_image, external_url, artists jsonb) + `track_start_offset_ms`, `view_count`, `expires_at`, `deleted_at`, `moderation_*`, `visibility`. Snapshot stabilises playback if upstream changes. `rep_story_views` logs impressions; trigger `rsv_count_sync` syncs count.

Spotify (`lib/spotify/`): `client.ts` (Client Credentials), `preview-resolver.ts` (3-source fallback Spotify → iTunes → Deezer ISRC). Routes `/api/rep-portal/stories/*` (create, feed grouped 24h, single-rep timeline, view-log, delete). Cron `cron/stories-expire` hourly. Mapper `lib/stories-mapper.ts` (DB → iOS DTO) — use in any endpoint surfacing a story.

---

## Moderation (App Store 1.2)

- **`rep_blocks`** (blocker_rep_id, blocked_rep_id, reason). Read paths must OR-check both directions to hide content. Endpoint `/api/rep-portal/blocks/`.
- **`rep_reports`** (reporter_rep_id, target_rep_id or target_story_id, reason_code, surface, free_text, status, reviewed_by_user_id, reviewed_at, review_notes). Endpoint `/api/rep-portal/reports/`. Admin review surface planned.
- Story takedown: `rep_stories.moderation_removed_by` + `moderation_reason`.

---

## Entry Market (Round 2)

Platform-only catalog redeemable with EP, sourced from external Shopify (Harry's). Tenants don't list — platform inventory.

Tables: `platform_market_products`, `platform_market_product_variants` (option1/2/3, ep_price, stock), `platform_market_claims` (rep_id, variant_id, ep_spent, shipping_*, status, external_*), `platform_market_vendors` (handle, external_shop_domain). RPCs: `claim_market_product_atomic(rep_id, variant_id, ep_cost, shipping_addr)` (locks, verifies, ledger + stock, creates claim), `cancel_market_claim_and_refund(claim_id, reason)`. Lib `lib/market/shopify.ts` (Admin API). Routes `/api/rep-portal/market/*`. No admin UI yet — managed via Shopify + DB.

---

## Scanner PWA

`/scanner/` — 5 pages (dashboard, events, scan, login, settings). SW `/scanner-sw.js`. Admin auth. Assignments `{org_id}_scanner_assignments` (`scannerAssignmentsKey()`); live tokens `scannerLiveTokensKey()`. Components: QRScanner, ScanResult, ScanHistory, ScanStats, EventCard, GuestListSearch, ManualEntry, ModeToggle, ScannerInstallPrompt. Routes: `scanner/events`, `events/[id]/stats`, `assignments`, `manifest`. Hook `useScannerPWA`. Syncs `guest_list.checked_in` on scan.

## Merch Store

`/shop/[slug]/` — standalone storefront. Tables `merch_collections`, `merch_collection_items` (`merchStoreKey()`). Routes `merch-store/{settings|collections|payment-intent|confirm-order}` (last two public). Lib `lib/merch-orders.ts`, `lib/merch-images.ts`.

## Currency System (fiat)

Multi-fiat for ticket purchases. Buyer currency from geo-IP (`x-vercel-ip-country` → `buyer_currency` cookie). Lib `lib/currency/`. Route `GET /api/currency/rates` (public). Cron `exchange-rates` 6h. Settings `exchangeRatesKey()` (platform). Components `CurrencyProvider`, `MidnightCurrencySelector`. **Not EP** — EP is fixed-rate.

---

## Database (Supabase)

Project: `rqtfghzhkkdytkegcifm` (agency-feral, eu-west-1).

### Tables (~56 public)

**Tenant-scoped (have `org_id`):**
- Commerce: `site_settings`, `events`, `ticket_types`, `products`, `orders` (order_number FERAL-XXXXX, payment_ref idempotency, `refunded_by`), `order_items`, `tickets` (ticket_code FERAL-XXXXXXXX), `customers`, `artists`, `event_artists`, `guest_list` (source/access_level/invite_token), `discounts`, `abandoned_carts`, `traffic_events`, `popup_events`, `payment_events`, `event_interest_signups`, `merch_collections`, `merch_collection_items`, `waitlist_signups`. Tenant mgmt: `org_users` (perm_*), `domains`.
- `events` image slots: `cover_image_url` / `poster_image_url` / `banner_image_url` (clean / story-share text-baked / 16:9). Legacy `cover_image` + `hero_image` retained for v1.

**NOT org-scoped (rep- or platform-keyed):**
- Identity/social: `reps` (status active|deleted|suspended), `promoters`, `rep_promoter_memberships`, `rep_promoter_follows`, `rep_follows`, `rep_blocks`, `rep_reports`, `rep_event_attendance` (**RLS DISABLED** — populated by `ticket_attendance_sync` trigger).
- Activity: `rep_quests`, `rep_quest_submissions`, `rep_quest_acceptances`, `rep_rewards`, `rep_reward_claims`, `rep_events`, `rep_milestones`, `rep_event_position_rewards`, `rep_points_log`, `rep_streaks`, `rep_rank_snapshots`.
- Notifications: `rep_notifications`, `rep_push_subscriptions` (legacy), `device_tokens`, `notification_deliveries`, `rep_event_reminders` (cron dedup, internal only).
- Stories: `rep_stories`, `rep_story_views`. EP: `platform_ep_config` (singleton), `ep_ledger` (APPEND-ONLY), `ep_tenant_purchases`, `ep_tenant_payouts`. Market: `platform_market_{products,product_variants,claims,vendors}`.

**Legacy/low-row (don't extend)**: `contracts`, `settings` (generic, distinct from `site_settings`), `artists_legacy_payments`.

### Views
- `ep_rep_balances` — rep balance from ledger SUM
- `ep_tenant_float` — available for quest rewards
- `ep_tenant_earned` — redeemed by reps, owed at next payout
- `ep_rep_balance_drift` — diagnostic; rows = cache/ledger mismatch (integration tests assert empty)

### RPCs

**Sales/refund**: `increment_sold(ticket_type_id, qty)` (false=rollback), `decrement_sold(...)` (refund), `increment_discount_used(discount_id)` / `decrement_discount_used(...)` (both decrement RPCs added 2026-04-26).

**EP**: `award_quest_ep(rep_id, tenant_org_id, ep_amount, quest_submission_id, fiat_rate_pence)` (atomic; raises `insufficient_float` P0001), `reverse_quest_ep(...)` (partial clawback — only what rep still has, tenant absorbs difference), `claim_reward_atomic(rep_id, org_id, reward_id, points_cost)` (locks, verifies, ledger debit, claim, decrement stock), `cancel_claim_and_refund(claim_id, reason)`, `claim_market_product_atomic(...)` / `cancel_market_claim_and_refund(...)` (Entry Market), `plan_tenant_payouts()`, `create_pending_payout(...)`, `complete_tenant_payout(payout_id, stripe_transfer_id)` (idempotent), `fail_tenant_payout(payout_id, reason)`.

**Rep activity**: `capture_rep_rank_snapshots()`, `mark_rep_active(rep_id, today?)`, `reset_stale_streaks()`, `reverse_rep_attribution(order_id)`, `get_rep_program_stats(org_id)`.

**Helpers**: `test_cleanup_ep_ledger(tenant_org_id)` (refuses non-`__test*`), `auth_user_org_id()` (RLS), `set_updated_at()`.

### Triggers (key invariants)
- `ep_ledger_no_update` / `ep_ledger_no_delete` — append-only enforcement
- `ep_ledger_rep_cache_sync` — maintains `reps.currency_balance` on INSERT
- `rpf_follower_count_sync`, `rpm_team_size_sync`, `rf_rep_counts_sync` — denorm counts
- `rsv_count_sync` — story view count
- `ticket_attendance_sync` — populates `rep_event_attendance` on ticket INSERT
- `rep_notifications_read_sync` — `read_at` timestamp

### Constraints
`orders.order_number` unique `FERAL-XXXXX`; `tickets.ticket_code` unique `FERAL-XXXXXXXX`; `orders.payment_ref` idempotent (Stripe PI ID); `ticket_types.product_id` FK `products` (ON DELETE SET NULL); `rep_notifications.type` CHECK matches TS union; `rep_push_subscriptions` unique `(rep_id, endpoint)`; `ep_ledger` append-only via triggers.

### Supabase Client Rules (CRITICAL)
Wrong client → silent data loss (RLS empty arrays).
- **`getSupabaseAdmin()`** — ALL data queries (service role, bypasses RLS)
- **`getSupabaseServer()`** — auth ONLY (`requireAuth`, `getSession`)
- **`getSupabaseClient()`** — browser only (realtime, client reads)
- Never `createClient()` with anon key server-side.

### Row-Level Security
All tables EXCEPT `rep_event_attendance` have RLS enabled (`rep_event_attendance` is trigger-populated, not user-readable). `auth_user_org_id()` maps `auth.uid()` → `org_id` via `org_users`/`reps`. **anon**: INSERT on `traffic_events`/`popup_events`, SELECT public content. **authenticated**: CRUD scoped to `org_id`. **service_role**: bypass all (every API route via `getSupabaseAdmin()`).

### External Service Rules (CRITICAL)
MCP: **Supabase** (schema, queries, migrations) + **Vercel** (deployments, logs). NEVER give user SQL to run. **Stripe** has no MCP — Dashboard only. MCP expired → ask user to run `/mcp` (display visibly). Never assume table/column exists unless documented here.

### Settings Keys
JSONB in `site_settings`. **Always use helpers in `lib/constants.ts`, never hardcode.** Per-org `{org_id}_*` helpers cover branding, themes, VAT, homepage, reps, automations (cart/announcement), popup, marketing, email, wallet, events-list, stripe-account, EP-billing (off-session card), plan, onboarding, merch-store, scanner (assignments + live tokens), guest-list (3 keys), waitlist (per-event), campaigns. Raw (no helper): `{org_id}_pdf_ticket`, `{org_id}_event_{slug}`, `media_*`. Platform singletons: `platformBillingKey()`, `exchangeRatesKey()` + raw `platform_payment_digest|health_digest|beta_applications|beta_invite_codes|entry_platform_xp`. Pre-org: `wizardStateKey(authUserId)`.

⚠️ **`TABLES` constant lags ~24 tables** (rep social/EP/market/notification). Update opportunistically; raw strings accepted in interim.

---

## API Routes (280 handlers)

### Critical Path (Payment → Order)
- `POST /api/stripe/payment-intent` — create PI (validates tickets + sequential, discounts + VAT, rate-limited)
- `POST /api/stripe/confirm-order` — verify → order + tickets + email
- `POST /api/checkout/capture` (upsert customer + abandoned cart), `/api/checkout/error` (report)
- `POST /api/stripe/webhook` — `payment_intent.{succeeded,failed}`, `charge.refunded`, subscription lifecycle

### Orders & Tickets
`orders` (GET/POST), `orders/[id]` (GET), `orders/[id]/{refund|resend-email|rep-info|pdf}`, `orders/[id]/wallet/{apple|google}`, `orders/export` (CSV), `tickets/[code]` (GET), `tickets/[code]/{scan|merch}` (POST). Refund → `lib/refund.ts`.

**Sales analytics**: `GET /api/events/[id]/sales-timeline` (admin auth, org-scoped) — returns `{ buckets: { date, perTicket: { [id]: { qty, revenue } } }[], ticketTypes, currency }` for completed orders only. Powers admin Sales Timeline card + Release Strategy panel time-to-unlock estimates. Pure-function aggregations live in `lib/sales-velocity.ts`.

### Standard CRUD (admin auth)
Events, Artists, Merch, Customers, Discounts (`validate|auto|seed`), Settings, Branding, Themes, Domains, Team (incl. public `accept-invite`), Guest List (13), Onboarding (state, submit), Campaigns (5), Waitlist.

### Rep Platform v2 (`requireRepAuth()` unless noted)

**Native auth** (public): `POST /api/auth/mobile-login`, `mobile-refresh`. `mobile-login-apple` stub.

**Rep self-service** (`/api/rep-portal/*`):
- `me` (GET/PUT/PATCH/**DELETE**), `me/{memberships|balances|following/promoters|friends|push-preferences|activity}`
- `dashboard`, `quests` + `quests/[id]/{accept,submissions}`, `rewards` + `rewards/[id]/claim`, `reward-claims`, `notifications`
- `promoters/[handle]/{follow|join-request}`, `devices` (POST) + `devices/[token]` (DELETE), `uploads/{signed-url|complete}`
- `feed`, `peer-activity`, `stories/*`, `spotify/*`, `market/*`, `blocks`, `reports`, `reps/[id]/*`
- Legacy: signup, signup-google, login, logout, magic-login, invite/[token], verify-email, manifest, push-subscribe, push-vapid-key, upload (base64), discount, leaderboard, sales, points, profile/[id], join-event, download-media, pwa-icon

**Public promoter discovery** (`/api/promoters/*`, auth-aware): `discover?q=&limit=&offset=` (rate-limited), `[handle]` (profile + featured_events + is_following/is_on_team).

**Admin rep mgmt** (`/api/reps/*`, `requireAuth()`, ~26 routes): CRUD, settings, stats, events/assign/summary, quests, submissions (PUT writes ledger), rewards, claims, points, milestones, campaign-events, leaderboard. **Admin promoter/EP**: `/api/admin/promoter` (GET/PATCH); `/api/admin/ep/{purchase-intent|balance|ledger|payouts}`.

### Other
- Payment-adjacent: `abandoned-carts` (3), `billing` (checkout/portal/status), `stripe/connect/{my-account/*|oauth/{start,callback}|[accountId]}`
- Public: `auth/*`, `beta/*`, `announcement/signup`, `popup/capture`, `track`, `meta/capi`, `brand/{logo,logo-png}`, `currency/rates`, `health`, `unsubscribe`, `media/[key]`
- Platform owner: `platform/*` (~20: dashboard, tenants, beta-applications, invite-codes, xp-config, health, digest, sentry, payment-health, impersonate, rep-override-code)
- Admin dashboards: `admin/{live-sessions,checkout-health,orders-stats,uk-events}`
- Integrations: `mux/*`, `email/*`, `wallet/status`, `upload`, `upload-video`, scanner (4), merch-store (5)

### Vercel Cron (13 in `vercel.json`, all under `/api/cron/`)
- `*/5 * * * *` `announcement-emails` (steps 2–4 dispatch)
- `*/10 * * * *` `abandoned-carts` (recovery)
- `*/15 * * * *` `guest-list-reminders` (RSVP); `domain-verify-poll`
- `*/30 * * * *` `stripe-health`
- `0 * * * *` `stories-expire`; `event-reminders` (24h + 2h before rep-enabled events; deduped via `rep_event_reminders`)
- `0 */6 * * *` `payment-digest`, `exchange-rates`
- `0 19 * * *` `streak-at-risk` (UTC; reps with active streak + 0 XP today)
- `5 0 * * *` `rep-streak-reset`; `0 2 * * 1` `rep-rank-snapshots` (weekly); `0 3 1 * *` `ep-payouts` (monthly tenant EP → cash)

---

## Hooks

22 in `src/hooks/`: `useBranding`, `useSettings`, `useCart`, `useShopCart`, `useEventTracking`, `useMetaTracking`, `useDataLayer`, `useDashboardRealtime`, `useLiveSessions`, `useTraffic`, `useHypeQueue`, `useCountdown`, `useOrgTimezone`, `useOrgCurrency`, `useCurrency`, `useHeaderScroll`, `useScrollReveal`, `useCountUp`, `usePopupSettings`, `useRepPWA`, `useScannerPWA`, `useEventSalesTimeline` (Phase 4 — fetches `/api/events/[id]/sales-timeline`).

**Referential stability (CRITICAL)**: hooks returning objects/functions in effect deps MUST `useMemo`. Stable-ref: `useMetaTracking`, `useDataLayer`, `useEventTracking`, `useSettings`, `useBranding`, `useDashboardRealtime`. Destructure callbacks as deps — never the whole object. `useMetaTracking` reads `feral_cookie_consent` localStorage for `marketing:true`; `useMetaTracking` + `useBranding` persist state at module scope (tests must account).

---

## Environment Variables

**Required**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`.

**Optional integrations**: `NEXT_PUBLIC_GTM_ID`, Klaviyo, `MUX_TOKEN_ID`/`MUX_TOKEN_SECRET`, `VAPID_PUBLIC_KEY`/`_PRIVATE_KEY`/`_SUBJECT`, Apple/Google Wallet certs, `VERCEL_API_TOKEN`, `SPOTIFY_CLIENT_ID`/`_SECRET`, `SHOPIFY_*` (Entry Market), `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (Places API New — venue + city autocomplete in event editor; restrict by HTTP referrer; absent = graceful fallback to plain text input).

**Monitoring**: `PLATFORM_ALERT_EMAIL`, `ANTHROPIC_API_KEY` (digest), `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.

**Push** (without these, transports log `skipped` in `notification_deliveries`):
- APNs: `APNS_AUTH_KEY_P8` (full PEM), `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_USE_SANDBOX` (optional; `false` is correct for TestFlight + App Store — see Known Gaps #3 for the gateway-routing rule)
- FCM: `FCM_SERVICE_ACCOUNT_JSON` (stringified service-account JSON)

---

## Testing

Vitest + @testing-library/react (jsdom). Config `vitest.config.ts` (projects `unit` + `integration`). Setup `src/__tests__/setup.ts`. Scripts: `npm test` (unit, ~1.6s), `npm run test:integration` (real DB, ~97s), `npm run test:all`. Integration suites include EP money-path tests asserting zero `ep_rep_balance_drift` after every state change. Real Supabase + Stripe mocked, scoped to `org_id = '__test_integration__'`.

**Pre-push** (`.git/hooks/pre-push`) runs `npm test` AND `npx tsc --noEmit -p tsconfig.build.json` (excludes test files to match `next build`). Never skip — TS check catches build errors vitest doesn't type-check. **CI**: `vercel-build` runs unit tests before `next build`. Failed tests = failed deploy.

**MANDATORY before committing**: `npm test`. Payment/checkout/EP changes (`stripe/`, `lib/orders.ts`, `lib/stripe/`, `lib/refund.ts`, `lib/ep/`, checkout components) → also run `npm run test:integration`. New hooks/API routes need tests; referential-stability tests mandatory for hooks with object/function deps. Test state, API shape, edge cases, payment flows — not UI/CSS.

---

## Platform Health Monitoring — AI Workflow

When asked to "check health" / "look at errors" / "fix what's broken":

1. **Fetch**: Sentry unresolved (EU region, `$SENTRY_AUTH_TOKEN` from `.env.local`); `payment_events WHERE resolved = false` via Supabase MCP; `/api/platform/platform-health?period=24h`.
2. **Triage**: FIX 500s, React errors, checkout/webhook failures, EP ledger drift. RESOLVE (not bugs): card_declined (normal 2-5%), network timeouts, bot 401s. IGNORE: single non-reproducible.
3. **Fix → Commit → Resolve**: Sentry `PUT /api/0/issues/ISSUE_ID/` `{"status":"resolved"}` + comment. Payment events: Supabase UPDATE `resolved=true, resolution_notes='...'`.

Investigate before resolving — never bulk-resolve. **Payment orphans CRITICAL** (money taken, no ticket). **EP ledger drift CRITICAL** (any rows in `ep_rep_balance_drift` = real-money mismatch). Card declines normal. No `org_id` = platform-wide. Stripe actions → step-by-step Dashboard instructions.

---

## Design & CSS

**Brand**: Admin/Entry primary `#8B5CF6` (Electric Violet); gradient `linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)`. Public event pages tenant-configurable (accent/bg/card tokens in `base.css :root`). Admin tokens via `@theme inline` in `tailwind.css` (bg, fg, primary, card, border, destructive, success, warning, info) — use classes, never hardcode hex.

**CSS systems**: Landing = hand-written (`base.css`, `header.css`). Event pages = Tailwind + `midnight.css`/`midnight-effects.css`/`hero-effects.css`. Admin = Tailwind + shadcn/ui + `command.css`. Rep v1 = Tailwind + `rep-effects.css`. Scanner = Tailwind + `scanner.css`.

**Isolation/layer (DO NOT BREAK)**: `@layer theme, admin-reset;` then `@import "tailwindcss/utilities"` UNLAYERED. Never `layer(utilities)` or global `*` resets. Scopes: `[data-admin]`, `[data-theme="midnight"]`, `[data-rep]`.

**Components**: Midnight imports CSS only in orchestrator (`MidnightEventPage`); children don't. Mobile-first 375px, `prefers-reduced-motion` supported. Admin pages `"use client"` w/ shadcn/ui; settings fetch from `site_settings`, save via `/api/settings`; tenant branding uploads POST base64 to `/api/upload`. shadcn/ui in `components/ui/` (28), Radix + `cn()` from `@/lib/utils`.

---

## Guest List Manager

`/admin/guest-list/` — 4 tabs (Guests, Artist Links, Applications, Settings). Access levels: `guest_list` (default), `vip`, `backstage`, `aaa`, `artist` — hidden ticket types auto-created per event per level.

**Three sources** (`guest_list.source`): `direct` (admin invites → `/guest-list/rsvp/[token]`), `artist` (quota submission → `/guest-list/submit/[token]`), `application` (`/guest-list/apply/[campaignId]` → admin reviews → free or paid acceptance).

**Paid applications**: Stripe CardNumber/Expiry/CVC. `/api/guest-list/application-payment` (card only), `/api/guest-list/application-confirm` → `issueGuestListTicket()`. Webhook backup on `metadata.type === "guest_list_application"`. Don't show fee on Step 1 (acceptance) — let buyer feel accepted first; price only on payment page.

**Files**: `lib/guest-list.ts`, `types/guest-list.ts`, `components/admin/guest-list/` (4 tabs), `app/guest-list/` (public: rsvp, submit, apply, accept). Settings keys: `guestListSettingsKey()`, `guestListSubmissionsKey()`, `guestListCampaignsKey()`.

---

## Admin Pages Index

`/admin/*` — 33 directories (`requireAuth()` unless flagged owner-only).

- **Daily ops**: `/` (dashboard + `OnboardingChecklist`), `/events/` + `/[slug]/` (Content/Design/Details/Tickets/Waitlist/SEO tabs), `/orders/`, `/customers/`, `/scanner/`, `/guest-list/` (4 tabs), `/abandoned-carts/`, `/import-tickets/` (CSV via `lib/import-csv.ts` + `lib/import-tickets.ts`; `payment_method:"imported"`, no email), `/discounts/`, `/popup/`, `/artists/`, `/merch/`, `/merch-store/`.
- **Brand & content**: `/onboarding/` (3-step), `/settings/` (9 subs: branding, domains, general, plan, search-social, integrations, users, finance, scanner), `/ticketstore/` (theme builder).
- **Marketing**: `/marketing/` (Klaviyo), `/communications/` (templates), `/campaigns/` + `/email/` (live: guest-list outreach), `/traffic/`.
- **Rep program**: `/reps/` (6 tabs), `/promoter/` (public profile), `/ep/` (Float / Earned / Ledger / Payouts + Buy EP).
- **Money**: `/payments/` (Stripe Custom 5-state), `/finance/` → `/settings/finance/`, `/plans/`.
- **Owner only**: `/connect/` (all Stripe accounts, fee defaults), `/command/` (UK command center: globe + map + live sessions), `/platform-settings/`, `/backend/` (8 subs: beta, plans, health, tenants, payment-health, platform-settings, connect, xp), `/beta/`.
- **Auth**: `/login/`, `/signup/`, `/account/`, `/invite/[token]/`.

---

## Known Gaps

1. **Google Ads + TikTok tracking** — placeholders only.
2. **FCM transport stubbed** — `lib/push/fcm.ts` has envelope builder + `isConfigured()` but service-account → access-token → v1 send is TODO (`status:"skipped"`). Not blocking iOS; needed for Android. APNs is live (`lib/push/apns.ts`, ES256 JWT + HTTP/2). Web push live (VAPID). APNs gateway-routing rule: see Env Vars → Push.
3. **Web `/rep/*`** — frozen. Rebuild to v2 spec post-iOS-launch.
4. **Poster drops** — paused. No table; `dashboard.feed` = peer + story activity.
5. **Apple Sign-In** — deferred. Google IS live; App Store 4.8 only triggers when third-party SSO offered.
6. **Entry Market admin surface** — managed via Shopify + DB; no UI.
7. **Story moderation queue** — table + endpoint exist, no admin review UI.
8. **`rep_event_attendance` RLS disabled** — populated by trigger only; document explicitly when exposing reads.
9. **`TABLES` constant lag** — missing ~24 tables. Update opportunistically; raw strings accepted.

---

## Document Maintenance

1. Read at session start — the map.
2. Update after architecture changes (tables, routes, modules, admin pages). New feature → update the section AND Admin Pages Index AND Known Gaps if partial.
3. Delete deprecated references when the deprecation lands. Keep under 40K chars — compress, don't drop info. Wrong docs = wrong assumptions; undocumented = unknown.
