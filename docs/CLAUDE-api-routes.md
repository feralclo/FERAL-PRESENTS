# Entry — API Route Reference

Linked from `CLAUDE.md`. 280 handlers under `src/app/api/`.

## Critical Path (Payment → Order)

- `POST /api/stripe/payment-intent` — create PI (validates tickets + sequential, discounts + VAT, rate-limited)
- `POST /api/stripe/confirm-order` — verify → order + tickets + email
- `POST /api/checkout/capture` (upsert customer + abandoned cart), `/api/checkout/error` (report)
- `POST /api/stripe/webhook` — `payment_intent.{succeeded,failed}`, `charge.refunded`, subscription lifecycle

## Orders & Tickets

`orders` (GET/POST), `orders/[id]` (GET), `orders/[id]/{refund|resend-email|rep-info|pdf}`, `orders/[id]/wallet/{apple|google}`, `orders/export` (CSV), `tickets/[code]` (GET), `tickets/[code]/{scan|merch}` (POST). Refund → `lib/refund.ts`.

**Sales analytics**: `GET /api/events/[id]/sales-timeline` (admin auth, org-scoped) — returns `{ buckets: { date, perTicket: { [id]: { qty, revenue } } }[], ticketTypes, currency }` for completed orders only. Powers admin Sales Timeline card + Release Strategy panel time-to-unlock estimates. Pure-function aggregations live in `lib/sales-velocity.ts`.

## Standard CRUD (admin auth)

Events, Artists, Merch, Customers, Discounts (`validate|auto|seed`), Settings, Branding, Themes, Domains, Team (incl. public `accept-invite`), Guest List (13), Onboarding (state, submit), Campaigns (5), Waitlist.

## Rep Platform v2 (`requireRepAuth()` unless noted)

**Native auth** (public): `POST /api/auth/mobile-login`, `mobile-refresh`. `mobile-login-apple` stub.

**Rep self-service** (`/api/rep-portal/*`):
- `me` (GET/PUT/PATCH/**DELETE**), `me/{memberships|balances|following/promoters|friends|push-preferences|activity}`
- `dashboard`, `quests` + `quests/[id]/{accept,submissions,assets,assets/[mediaId]/download}`, `rewards` + `rewards/[id]/claim`, `reward-claims`, `notifications`
- `promoters/[handle]/{follow|join-request}`, `devices` (POST) + `devices/[token]` (DELETE), `uploads/{signed-url|complete}`
- `feed`, `peer-activity`, `stories/*`, `spotify/*`, `market/*`, `blocks`, `reports`, `reps/[id]/*`, `reps/search?q=&limit=&offset=`
- Legacy: signup, signup-google, login, logout, magic-login, invite/[token], verify-email, manifest, push-subscribe, push-vapid-key, upload (base64), discount, leaderboard, sales, points, profile/[id], join-event, download-media, pwa-icon

**Public promoter discovery** (`/api/promoters/*`, auth-aware): `discover?q=&limit=&offset=` (rate-limited), `[handle]` (profile + featured_events + is_following/is_on_team).

**Admin rep mgmt** (`/api/reps/*`, `requireAuth()`, ~26 routes): CRUD, settings, stats, events/assign/summary, quests, submissions (PUT writes ledger), rewards, claims, points, milestones, campaign-events, leaderboard. **Admin promoter/EP**: `/api/admin/promoter` (GET/PATCH); `/api/admin/ep/{purchase-intent|balance|ledger|payouts}`.

## Other

- Payment-adjacent: `abandoned-carts` (3), `billing` (checkout/portal/status), `stripe/connect/{my-account/*|oauth/{start,callback}|[accountId]}`
- Public: `auth/*`, `beta/*`, `announcement/signup`, `popup/capture`, `track`, `meta/capi`, `brand/{logo,logo-png}`, `currency/rates`, `health`, `unsubscribe`, `media/[key]`
- Platform owner: `platform/*` (~20: dashboard, tenants, beta-applications, invite-codes, xp-config, health, digest, sentry, payment-health, impersonate, rep-override-code)
- Admin dashboards: `admin/{live-sessions,checkout-health,orders-stats,uk-events}`
- Integrations: `mux/*`, `email/*`, `wallet/status`, `upload`, `upload-video`, scanner (4), merch-store (5)

## Vercel Cron (13 in `vercel.json`, all under `/api/cron/`)

- `*/5 * * * *` `announcement-emails` (steps 2–4 dispatch)
- `*/10 * * * *` `abandoned-carts` (recovery)
- `*/15 * * * *` `guest-list-reminders` (RSVP); `domain-verify-poll`
- `*/30 * * * *` `stripe-health`
- `0 * * * *` `stories-expire`; `event-reminders` (24h + 2h before rep-enabled events; deduped via `rep_event_reminders`)
- `0 */6 * * *` `payment-digest`, `exchange-rates`
- `0 19 * * *` `streak-at-risk` (UTC; reps with active streak + 0 XP today)
- `5 0 * * *` `rep-streak-reset`; `0 2 * * 1` `rep-rank-snapshots` (weekly); `0 3 1 * *` `ep-payouts` (monthly tenant EP → cash)
