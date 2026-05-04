# Entry — Platform Context

## Mission
White-label events + ticketing platform ("Shopify for Events"). Today powers FERAL; goal is any promoter sells tickets/merch under their brand, platform takes a fee. Every tenant query filters by `org_id` (where the table has one). Every feature must work for non-FERAL orgs.

## Status

**Beta**: `BETA_MODE = true` (`lib/beta.ts`). Queued initiatives: multi-tenant audit (`AUDIT-PROMPT.md`), Midnight redesign (`MIDNIGHT-REDESIGN-PROMPT.md`).

**Rep Platform v2** (shipped 2026-04-22): backend for native iOS app at `~/Projects/entry-ios/`. EP currency, promoters as first-class entities, follow graph, push fanout, ledger-backed flows. Source of truth: `ENTRY-IOS-BACKEND-SPEC.md`. **Deep reference: `docs/CLAUDE-rep-platform.md`** — read before any rep/quest/story/EP/market/Spotify-OAuth work. Legacy web `/rep/*` FROZEN.

**Round 2** (shipped 2026-04-24): Stories, Entry Market (platform-only ex-Shopify), public rep profiles, moderation, event attendance, App Store readiness (terms/privacy/account-delete/activity, reviewer seed `scripts/seed-apple-review.ts`).

**Event Builder Rebuild**: Phases 0–4 ✅ shipped 2026-04-29. Canvas editor at `/admin/events/{slug}/` — six narrative sections (Identity/Story/Look/Tickets/Money/Publish) + sticky live phone-frame preview, click-to-scroll-sync, real-time readiness gating one-button Publish, mobile sheet behind a floating Preview pill. **Phase 4 (Tickets-as-the-heart)**: Release Strategy panel (single source of truth for group + sequential config), Sales Timeline card with anchored event-date projection, time-to-unlock estimates. Editor surface deliberately minimal: **"Add ticket" + small "Add multiple" popover** — no in-editor templates. `tmp-*` client ids (`lib/ticket-tmp-id.ts`) make per-card Group dropdown work pre-save. Plan: `EVENT-BUILDER-PLAN.md`. Phases 5–6 deferred. **Admin design system: `docs/admin-ux-design.md` — read before any `/admin/*` UI work.** Public surfaces use Midnight (glass-on-dark) — never mix.

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
│   ├── admin/                # 33 dirs (see docs/CLAUDE-admin-pages.md)
│   ├── rep/                  # FROZEN v1 web (12 pages)
│   └── api/                  # 280 route handlers (see docs/CLAUDE-api-routes.md)
├── components/               # 194 files / 11 subdirs
│   ├── admin/                # 66 files; subs: command dashboard event-editor guest-list reps ui
│   ├── midnight/             # 27 theme components
│   ├── ui/                   # 28 shadcn/ui (Radix)
│   └── event, checkout, shop, scanner, events, rep, landing, layout
├── hooks/                    # 22 hooks
├── lib/                      # 76 root files + 8 subdirs (currency/ ep/ market/ push/ spotify/ stripe/ supabase/ uploads/)
├── styles/, types/
```

**Reference docs (read on demand):**
- `docs/CLAUDE-database.md` — table catalog, views, RPCs, triggers, settings keys glossary
- `docs/CLAUDE-api-routes.md` — full route catalog (280) + cron schedule
- `docs/CLAUDE-admin-pages.md` — admin pages index (33 dirs)
- `docs/CLAUDE-rep-platform.md` — Rep Platform v2 internals (quests, rewards, push, stories, Spotify OAuth, market, moderation)
- `docs/admin-ux-design.md` — admin design system (mandatory for `/admin/*` UI)
- `docs/ios-quest-pool-contract.md` — iOS pool quest contract

---

## Architecture

### Multi-Tenancy: Dynamic org_id Resolution
Tenant-scoped tables have `org_id`. **Never hardcode `"feral"`.** Rep/platform/EP/market/notification tables are NOT org-scoped (rep-keyed or platform-singleton).

Middleware resolves: admin host + logged in → `org_users` (user.id → org_id); tenant host → `domains` (hostname → org_id); fallback → `"feral"`. Hosts: `admin.entry.events` = admin; `{slug}.entry.events` = tenant; custom domains via `domains`; `localhost`/`*.vercel.app` = dev.

Access: server `getOrgId()`, auth API `auth.orgId`, public API `getOrgIdFromRequest(req)`, client `useOrgId()` (from `components/OrgProvider.tsx`). Middleware caches 60s.

### Auth & Security

Two systems: Admin (`requireAuth()` → `{user, orgId}`) + Rep (`requireRepAuth()` → `{rep}`). Platform owner: `requirePlatformOwner()`. Role flags in Supabase `app_metadata` (additive): `is_admin`, `is_rep`, `is_platform_owner`. Dual-role supported.

**New routes**: Admin → `requireAuth()` w/ `auth.orgId`; Rep → `requireRepAuth()` w/ `rep.org_id`; Platform → `requirePlatformOwner()`; Public → `getOrgIdFromRequest(req)` + add to `PUBLIC_API_PREFIXES`/`PUBLIC_API_EXACT_GETS` in `middleware.ts`. Never import `ORG_ID`. Stripe webhook always verifies signatures in prod.

**Public routes** (no auth): Stripe payment/checkout, events/settings/merch/branding GETs, track/meta/discounts/popup POSTs, cron (CRON_SECRET), auth/*, beta/*, rep auth + signup-google, wallet downloads, guest-list public flows, scanner/manifest, merch-store payment, brand/logo + logo-png, currency/rates, promoters/*, terms, privacy, **spotify/oauth-callback** (state token = rep proof).

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

### Refund Flow
`lib/refund.ts` — atomic, idempotent. Update order → cancel tickets → `decrement_sold()` → decrement discount usage → sync customer totals → `reverse_rep_attribution()` → send refund email once → record `orders.refunded_by`. Both `POST /api/orders/[id]/refund` (admin) and webhook (`charge.refunded`) use it.

### Theme System
Single theme **Midnight**. Tenant identity ships via branding (accents/logo/fonts), not theme swap. Routing: `external` → `MidnightExternalPage`; default → `MidnightEventPage`; `tickets_live_at` future → `MidnightAnnouncementPage` (countdown + signup); `queue_enabled` + `queue_window_minutes` → `MidnightQueuePage` (`useHypeQueue`; `?preview=tickets` bypasses). Builder UI `/admin/ticketstore/`.

### Error Monitoring (Sentry)
Three layers: Sentry (crash + replay 5%/100% on error), Payment Monitor (`payment_events`), AI Digest (Haiku every 6h). Config `sentry.{client,server,edge}.config.ts`. Tunnel `/api/monitoring`. Context via `setSentryOrgContext()`/`setSentryUserContext()`. Boundaries `global-error.tsx`, `admin/error.tsx`, `event/[slug]/error.tsx`. Health `/admin/backend/health/`.

### White-Label Branding
`{org_id}_branding` in `site_settings`: logo, name, colors, fonts, copyright, accent presets. Event layout server-renders CSS vars (no FOUC). Client `useBranding()`. API `/api/branding`. **Logo PNG**: `GET /api/brand/logo-png?variant=black|white|violet&size=N` — rasterises wordmark via `next/og` (Stripe Dashboard rejects SVG-with-web-fonts). **Wallet sync** (`lib/wallet-brand-sync.ts`) mirrors branding into Apple/Google Wallet passes async on save. Helpers: `lib/color-presets.ts`, `lib/font-pairings.ts`, `lib/logo-contrast.ts`.

### Sequential Ticket Release
Per-group, reveal one-at-a-time on sellout (computed from `sold`/`capacity`). Config `ticket_group_release_mode` in EventSettings JSONB. Logic `lib/ticket-visibility.ts`; server validates via `validateSequentialPurchase()`.

### Onboarding
`/admin/signup/` (or `/signup-google/`) → invite → `/admin/beta/` → owner approves → email → signup → `/admin/onboarding/`. `provisionOrg()` (`lib/signup.ts`) creates `org_users`, `domains`, `site_settings`, seeds `promoters`. Wizard: **Identity → Branding → Finish**. Post-wizard setup lives on dashboard via `OnboardingChecklist` (pulls Stripe Connect, domains, branding, events, team) — when extending, link to existing surfaces, don't reproduce in-wizard. Pre-org state: `wizardStateKey(authUserId)`. Tests: `src/__tests__/onboarding-wizard.test.tsx`.

### Request Flow (Event Pages)
`/event/[slug]/` → middleware (org_id) → RootLayout (`<OrgProvider>`) → EventLayout (SC; parallel-fetches event/settings/branding; sets CSS vars + `data-theme`) → `MidnightEventPage`.

### Caching
Event + admin: `force-dynamic`, `cache:"no-store"`. CDN: event `s-maxage=60, swr=300`; admin `no-cache` (`vercel.json`). Media `max-age=31536000, immutable`. Apple Pay verify `max-age=86400`. **Vercel Data Cache OFF** for `/api/branding` + `/api/stripe/connect/*` (cross-tenant leak fix Mar 2026) — use `cache:"no-store"` on internal fetches there.

### Content Security Policy
Defined in `next.config.ts` (`cspDirectives`). Currently allows: GTM, Meta Pixel, Stripe.js, Google Pay (scripts/frames); Google Fonts; Stripe Connect, Mux player; Supabase (incl. wss), Stripe API, Klaviyo, Sentry, `places.googleapis.com`. **When adding any new external SDK/API: update CSP in `next.config.ts` first.** Forgetting this → silent browser blocks no Sentry breadcrumb catches. Domain change checklist: `URL-CHANGE-CHECKLIST.md`.

---

## Rep Platform v2 (summary)

Native iOS at `~/Projects/entry-ios/`. **Full reference: `docs/CLAUDE-rep-platform.md`** — read it before touching reps, quests, stories, EP, market, push, moderation, or Spotify OAuth.

- **Promoter** = public brand, 1:1 with org. **Rep** = platform-level identity, can join many teams via `rep_promoter_memberships`. **Follow graph** drives feed.
- **Auth**: cookie (web v1) or Bearer JWT (native, `POST /api/auth/mobile-login`). Google Sign-In live; Apple deferred.
- **Two-token economy**: XP (platform-wide, never spent, leveling) + EP (1 EP = £0.01, real money, 10% platform cut at payout, all movement through append-only `ep_ledger`).
- **EP flow**: tenant buys EP → quest approved (`award_quest_ep`) → rep claims (`claim_reward_atomic` / `claim_market_product_atomic`) → fulfillment → monthly `ep-payouts` cron pays tenants their earned EP minus the cut.
- **Quests**: `/admin/reps/` Quests tab. Editor in `src/components/admin/reps/quest-editor/`. Two asset modes: `single` (uploaded asset, written to `video_url`) / `pool` (Library Campaign rotates assets per rep). Plans: `QUEST-EDITOR-REDESIGN.md`, `LIBRARY-CAMPAIGNS-PLAN.md`.
- **Push**: dispatcher `lib/push/fanout.ts` → APNs (live), FCM (stubbed, see Known Gap #2), web (VAPID). Logs in `notification_deliveries`. `RepNotificationType` (TS) + DB CHECK must match — add new types in BOTH.
- **Media uploads**: rep-uploaded → `POST /api/rep-portal/uploads/{signed-url,complete}`, Supabase bucket `rep-media`. Caps in `lib/uploads/rep-media-config.ts`. Quest video → Mux capped-1080p.
- **Stories**: 24h ephemeral posts with mandatory Spotify track. Likes table, view tracking. Mapper `lib/stories-mapper.ts` — use in any endpoint surfacing a story.
- **Spotify per-rep OAuth**: HMAC-signed state, AES-256-GCM token encryption, `spotify_user_tokens` table. `oauth-callback` is PUBLIC (state IS the rep proof). Detail in reference doc.
- **Account deletion**: `DELETE /api/rep-portal/me` soft-deletes (PII scrubbed; `rep.id` PRESERVED for FK integrity).

---

## Database (Supabase)

Project: `rqtfghzhkkdytkegcifm` (agency-feral, eu-west-1). **Full table/RPC/trigger catalog + settings keys: `docs/CLAUDE-database.md`**.

### Supabase Client Rules (CRITICAL)
Wrong client → silent data loss (RLS empty arrays).
- **`getSupabaseAdmin()`** — ALL data queries (service role, bypasses RLS)
- **`getSupabaseServer()`** — auth ONLY (`requireAuth`, `getSession`)
- **`getSupabaseClient()`** — browser only (realtime, client reads)
- Never `createClient()` with anon key server-side.

### Row-Level Security
All tables EXCEPT `rep_event_attendance` have RLS enabled (`rep_event_attendance` is trigger-populated, not user-readable). `auth_user_org_id()` maps `auth.uid()` → `org_id` via `org_users`/`reps`. **anon**: INSERT on `traffic_events`/`popup_events`, SELECT public content. **authenticated**: CRUD scoped to `org_id`. **service_role**: bypass all (every API route via `getSupabaseAdmin()`).

### Critical invariants
- `orders.payment_ref` (Stripe PI ID) idempotency unique — confirm-order is safe to retry
- `ep_ledger` append-only (triggers `ep_ledger_no_update` / `ep_ledger_no_delete`)
- `ep_rep_balance_drift` view rows = real-money mismatch — integration tests assert empty
- `ticket_attendance_sync` trigger populates `rep_event_attendance` on ticket INSERT
- `RepNotificationType` TS union must match DB CHECK constraint on `rep_notifications.type`
- `spotify_user_tokens` plaintext write = leak — always go through `lib/spotify/user-auth.ts`

### Settings Keys (use helpers, never hardcode)
JSONB in `site_settings`. Per-org via `{org_id}_*` helpers in `lib/constants.ts`. Platform singletons via `platformBillingKey()`/`exchangeRatesKey()`. Glossary in `docs/CLAUDE-database.md`. ⚠️ `TABLES` constant lags ~24 tables — raw strings accepted in interim.

### External Service Rules (CRITICAL)
MCP: **Supabase** (schema, queries, migrations) + **Vercel** (deployments, logs). NEVER give user SQL to run. **Stripe** has no MCP — Dashboard only. MCP expired → ask user to run `/mcp` (display visibly). Never assume table/column exists unless documented in `docs/CLAUDE-database.md`.

---

## API Routes

280 handlers under `src/app/api/`. **Full catalog + cron schedule: `docs/CLAUDE-api-routes.md`**.

### Critical Path (Payment → Order)
- `POST /api/stripe/payment-intent` — create PI (validates tickets + sequential, discounts + VAT, rate-limited)
- `POST /api/stripe/confirm-order` — verify → order + tickets + email
- `POST /api/checkout/capture` (upsert customer + abandoned cart), `/api/checkout/error` (report)
- `POST /api/stripe/webhook` — `payment_intent.{succeeded,failed}`, `charge.refunded`, subscription lifecycle

### Auth shapes
- Admin (`requireAuth()`): events, orders, tickets, artists, merch, customers, discounts, settings, branding, themes, domains, team, onboarding, campaigns, waitlist, reps, admin/*
- Rep (`requireRepAuth()`): `/api/rep-portal/*`
- Platform owner (`requirePlatformOwner()`): `/api/platform/*` (~20 routes)
- Public: see CSP-cleared list above + `getOrgIdFromRequest(req)`

### Vercel Cron (14 in `vercel.json`)
Hot list: `*/5` announcement-emails, `*/10` abandoned-carts, `*/30` stripe-health, `0 *` stories-expire + event-reminders, `0 */6` payment-digest + exchange-rates + spotify-trending-refresh, `0 19` streak-at-risk, `5 0` rep-streak-reset, `0 2 * * 1` rep-rank-snapshots (weekly), `0 3 1 * *` ep-payouts (monthly tenant EP → cash). Full schedule: `docs/CLAUDE-api-routes.md`.

---

## Hooks

22 in `src/hooks/`: `useBranding`, `useSettings`, `useCart`, `useShopCart`, `useEventTracking`, `useMetaTracking`, `useDataLayer`, `useDashboardRealtime`, `useLiveSessions`, `useTraffic`, `useHypeQueue`, `useCountdown`, `useOrgTimezone`, `useOrgCurrency`, `useCurrency`, `useHeaderScroll`, `useScrollReveal`, `useCountUp`, `usePopupSettings`, `useRepPWA`, `useScannerPWA`, `useEventSalesTimeline`.

**Referential stability (CRITICAL)**: hooks returning objects/functions in effect deps MUST `useMemo`. Stable-ref: `useMetaTracking`, `useDataLayer`, `useEventTracking`, `useSettings`, `useBranding`, `useDashboardRealtime`. Destructure callbacks as deps — never the whole object. `useMetaTracking` reads `feral_cookie_consent` localStorage for `marketing:true`; `useMetaTracking` + `useBranding` persist state at module scope (tests must account).

---

## Environment Variables

**Required**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`.

**Optional integrations**: `NEXT_PUBLIC_GTM_ID`, Klaviyo, `MUX_TOKEN_ID`/`_SECRET`, `VAPID_PUBLIC_KEY`/`_PRIVATE_KEY`/`_SUBJECT`, Apple/Google Wallet certs, `VERCEL_API_TOKEN`, `SHOPIFY_*` (Entry Market), `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (Places API New — venue/city autocomplete; restrict by HTTP referrer; absent = graceful fallback).

**Spotify** (app-level + per-rep OAuth):
- `SPOTIFY_CLIENT_ID`/`_SECRET` — both app-level metadata calls and per-rep OAuth.
- `SPOTIFY_REDIRECT_URI` — must match the URI registered on the Spotify dashboard. Defaults to `${NEXT_PUBLIC_SITE_URL}/api/rep-portal/spotify/oauth-callback`.
- `SPOTIFY_TOKEN_ENC_KEY` — 32-byte hex or any string hashed to 32 bytes; encrypts user tokens at rest. Falls back to a key derived from `SUPABASE_SERVICE_ROLE_KEY`.

**Monitoring**: `PLATFORM_ALERT_EMAIL`, `ANTHROPIC_API_KEY` (digest), `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.

**Push** (without these, transports log `skipped` in `notification_deliveries`):
- APNs: `APNS_AUTH_KEY_P8` (full PEM), `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_USE_SANDBOX` (default `false` for TestFlight + App Store — gateway routing decided by provisioning profile, see Known Gaps)
- FCM: `FCM_SERVICE_ACCOUNT_JSON`

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

**Brand**: Admin/Entry primary `#8B5CF6` (Electric Violet); gradient `linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)`. Public event pages tenant-configurable (accent/bg/card tokens in `base.css :root`). Admin tokens via `@theme inline` in `tailwind.css` — use classes, never hardcode hex.

**CSS systems**: Landing = hand-written (`base.css`, `header.css`). Event pages = Tailwind + `midnight.css`/`midnight-effects.css`/`hero-effects.css`. Admin = Tailwind + shadcn/ui + `command.css`. Rep v1 = Tailwind + `rep-effects.css`. Scanner = Tailwind + `scanner.css`.

**Isolation/layer (DO NOT BREAK)**: `@layer theme, admin-reset;` then `@import "tailwindcss/utilities"` UNLAYERED. Never `layer(utilities)` or global `*` resets. Scopes: `[data-admin]`, `[data-theme="midnight"]`, `[data-rep]`.

**Components**: Midnight imports CSS only in orchestrator (`MidnightEventPage`); children don't. Mobile-first 375px, `prefers-reduced-motion` supported. Admin pages `"use client"` w/ shadcn/ui; settings fetch from `site_settings`, save via `/api/settings`; tenant branding uploads POST base64 to `/api/upload`. shadcn/ui in `components/ui/` (28), Radix + `cn()` from `@/lib/utils`.

---

## Guest List Manager

`/admin/guest-list/` — 4 tabs (Guests, Artist Links, Applications, Settings). Access levels: `guest_list` (default), `vip`, `backstage`, `aaa`, `artist` — hidden ticket types auto-created per event per level.

**Three sources** (`guest_list.source`): `direct` (admin invites → `/guest-list/rsvp/[token]`), `artist` (quota submission → `/guest-list/submit/[token]`), `application` (`/guest-list/apply/[campaignId]` → admin reviews → free or paid acceptance).

**Paid applications**: `/api/guest-list/application-payment` (card only) → `/api/guest-list/application-confirm` → `issueGuestListTicket()`. Webhook backup on `metadata.type === "guest_list_application"`. Don't show fee on Step 1 — let buyer feel accepted first.

**Files**: `lib/guest-list.ts`, `types/guest-list.ts`, `components/admin/guest-list/`, `app/guest-list/`. Settings keys: `guestListSettingsKey()`, `guestListSubmissionsKey()`, `guestListCampaignsKey()`.

---

## Scanner / Merch / Currency

**Scanner PWA**: `/scanner/` — 5 pages (dashboard, events, scan, login, settings). SW `/scanner-sw.js`. Admin auth. Assignments via `scannerAssignmentsKey()`; live tokens `scannerLiveTokensKey()`. Hook `useScannerPWA`. Syncs `guest_list.checked_in` on scan.

**Merch Store**: `/shop/[slug]/` — standalone storefront. Tables `merch_collections`, `merch_collection_items` (`merchStoreKey()`). Routes `merch-store/{settings|collections|payment-intent|confirm-order}` (last two public). Lib `lib/merch-orders.ts`, `lib/merch-images.ts`.

**Currency System** (fiat, NOT EP): Multi-fiat for ticket purchases. Buyer currency from geo-IP (`x-vercel-ip-country` → `buyer_currency` cookie). Lib `lib/currency/`. Route `GET /api/currency/rates` (public). Cron `exchange-rates` 6h. Components `CurrencyProvider`, `MidnightCurrencySelector`. **Not EP** — EP is fixed-rate.

---

## Known Gaps

1. **Google Ads + TikTok tracking** — placeholders only.
2. **FCM transport stubbed** — `lib/push/fcm.ts` has envelope builder + `isConfigured()` but service-account → access-token → v1 send is TODO (`status:"skipped"`). Not blocking iOS; needed for Android. APNs is live (ES256 JWT + HTTP/2). Web push live (VAPID). APNs gateway-routing rule: see Env Vars → Push.
3. **Web `/rep/*`** — frozen. Rebuild to v2 spec post-iOS-launch.
4. **Poster drops** — paused. No table; `dashboard.feed` = peer + story activity.
5. **Apple Sign-In** — deferred. Google IS live; App Store 4.8 only triggers when third-party SSO offered.
6. **Entry Market admin surface** — managed via Shopify + DB; no UI.
7. **Story moderation queue** — table + endpoint exist, no admin review UI.
8. **`rep_event_attendance` RLS disabled** — populated by trigger only; document explicitly when exposing reads.
9. **`TABLES` constant lag** — missing ~24 tables. Update opportunistically; raw strings accepted.

---

## Document Maintenance

**This file is the map** — read at session start. Keep under 40K chars. A `Stop` hook (`.claude/settings.json` → `.claude/hooks/claude-md-warden.sh`) nudges you if it grows past 40K, or if architectural files change without a CLAUDE.md / `docs/CLAUDE-*.md` update.

When updating:
1. **Architecture change** (new table, route, module, admin page) → update the relevant section here AND the matching reference doc in `docs/CLAUDE-*.md` (database / api-routes / admin-pages / rep-platform). New feature → also Known Gaps if partial; Status if shipped.
2. **Section grew >2KB** → consider extracting to a new `docs/CLAUDE-*.md` reference doc and link from here.
3. **Deprecation** → delete references when the change lands. Compress, don't drop info.

Wrong docs = wrong assumptions; undocumented = unknown.
