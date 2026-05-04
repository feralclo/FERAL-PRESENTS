# Entry — Rep Platform v2 Reference

Linked from `CLAUDE.md`. Native iOS at `~/Projects/entry-ios/` consumes these endpoints. Match the spec — `ENTRY-IOS-BACKEND-SPEC.md`.

## First-Class Entities
- **Promoter** — public brand identity, 1:1 with org. Table `promoters`. Editor `/admin/promoter/`. Fields: handle, display_name, tagline, bio, accent_hex, cover_image_url, follower_count + team_size (denormed via triggers).
- **Rep** — platform-level identity. `reps.org_id` populated for legacy reads; true team link is `rep_promoter_memberships` (status: pending|approved|rejected|left).
- **Follow graph** — `rep_promoter_follows` (soft, drives feed scope) + `rep_follows` (rep↔rep one-way; mutual = "friend").

## Rep Lifecycle
Free open signup (`POST /api/auth/mobile-signup`, `/rep-portal/signup`, or Google via `signup-google`) → browse `/api/promoters/discover` → `POST /rep-portal/promoters/[handle]/join-request` (optional pitch) → tenant approves (auto-approve available) → active on team. Reps can join many teams.

## Rep Auth
- Cookie (web v1): `requireRepAuth()` → `{rep}`.
- Bearer (native): `POST /api/auth/mobile-login` → `{access_token, refresh_token, rep, settings}`. `/mobile-refresh` rotates. Header `Bearer <jwt>`.
- Google Sign-In live (Supabase OAuth, mobile + web). Apple Sign-In deferred (Known Gap #5 in CLAUDE.md).

## Two-Token Economy (XP + EP)
- **XP** (`reps.points_balance`): platform-wide, never spent. Drives leveling (`lib/xp-levels.ts`) + tiers (`lib/rep-tiers.ts`, Rookie→Mythic). `awardPoints()` writes `rep_points_log` + cache.
- **EP** (`reps.currency_balance`): platform-wide, REAL MONEY. 1 EP = £0.01, 10% platform cut at payout (both in `platform_ep_config`). All movement flows through `ep_ledger` (append-only, trigger-enforced). Cache via `ep_ledger_rep_cache_sync`. Drift surfaced by `ep_rep_balance_drift` view.

## EP Economy Flow
1. Tenant buys EP → Stripe PI webhook → `tenant_purchase` ledger → +float. Off-session card: `epBillingKey()`.
2. Quest approved w/ `ep_reward > 0` → `award_quest_ep` → `tenant_quest_debit` + `rep_quest_credit` (atomic).
3. Rep claims (shop or market) → `claim_reward_atomic` / `claim_market_product_atomic` → `rep_shop_debit`.
4. Fulfillment via `lib/rep-reward-fulfillment.ts` (digital_ticket/guest_list/merch/custom); failure → `cancel_claim_and_refund` / `cancel_market_claim_and_refund` → `rep_shop_reversal`.
5. Monthly `ep-payouts` cron → `plan_tenant_payouts` → `create_pending_payout` → Stripe Transfer (idempotent) → `complete_tenant_payout` → `tenant_payout` ledger.

## Quests + Rewards
`rep_quests` v2: `promoter_id`, `subtitle`, `proof_type` (screenshot|url|text|instagram_link|tiktok_link|none), `cover_image_url` (image or Mux capped-1080p video), `accent_hex` + `_secondary`, `sales_target`, `xp_reward` + `ep_reward` (alongside legacy `points_reward`/`currency_reward`), `auto_approve`, `share_url` (auto-stamped on approval), `asset_mode` (`single`|`pool`) + `asset_campaign_tag`, `walkthrough_video_url` (Mux playback id, optional — tenant-uploaded screen recording showing reps how to do the quest; iOS surfaces as a "Watch how" button on `QuestDetailSheet`). `rep_quest_acceptances` UX-only. Submissions add `requires_revision`. Approval: `PUT /api/reps/quests/submissions/[id]` → `award_quest_ep`.

**Editor surface** (redesigned 2026-05-01, plan `QUEST-EDITOR-REDESIGN.md`): `/admin/reps/` Quests tab mounts a single `<QuestEditor>` (in `src/components/admin/reps/quest-editor/`). Three-tile picker (Post on social / Hit a sales target / Something else — DB still stores 5 underlying `quest_type` values; sub-toggle inside the form picks story / feed / make-your-own for the social variant) → one calm screen with title + reward block + opt-in `+ Add` chips for cover / shareable / walkthrough / platform / event / proof / rules. Live phone-frame preview (right rail desktop, floating "Preview" pill on mobile). Save = draft, Publish = active gated by `assessQuest()` (`src/lib/quest-readiness.ts`) with a tooltip-listed blocker checklist. "You're live" success sheet on publish with copy-to-clipboard share URL. Single-asset shareable uploads write to `video_url` (legacy column; iOS distinguishes image vs video via `isMuxPlaybackId`); walkthrough writes to `walkthrough_video_url`.

**Pool quests** (Library Campaigns, shipped 2026-04-30): when `asset_mode='pool'`, the quest pulls shareables from a campaign instead of a single uploaded asset. Campaign = the set of `tenant_media` rows where `kind='quest_asset'` AND `tags[0]='<slug>'`. Reps see up to 10 assets server-sorted by rotation rule (unused first newest-up, then used oldest-down), so new uploads bubble for every rep automatically. Per-rep download log keys `(rep_id, media_id)` in `rep_asset_downloads` (idempotent UPSERT). Endpoints: `GET /api/rep-portal/quests/[id]/assets`, `POST .../download` (returns Mux capped-1080p MP4 for video). Admin surface: `/admin/library/` campaign rail + canvas + bulk upload sheet. iOS contract: `docs/ios-quest-pool-contract.md`. Plan: `LIBRARY-CAMPAIGNS-PLAN.md`.

`rep_rewards.reward_type`: `milestone|shop|manual`. Adds `ep_cost`, `xp_threshold`, `stock` (NULL=∞), `fulfillment_kind` (digital_ticket|guest_list|merch|custom). `rep_reward_claims` adds `ep_spent`, `fulfillment_payload`, `fulfillment_reference`; status `claimed|fulfilling|fulfilled|cancelled|failed`.

## Push Notifications
Dispatcher `lib/push/fanout.ts`. One `NotificationPayload` → 3 transports: APNs (`apns.ts`, live HTTP/2 + ES256 JWT), FCM (`fcm.ts`, stubbed — Known Gap #2), web (`web.ts`, VAPID). `createNotification()` in `lib/rep-notifications.ts` writes `rep_notifications` + fans out to `device_tokens`. Legacy `rep_push_subscriptions` only fires if rep has no `device_tokens` (prevents double-send). Every attempt logged in `notification_deliveries`; `invalid_token` auto-disables. `read_at` synced via trigger. **Types**: `RepNotificationType` (`src/types/reps.ts`) + DB CHECK must match — add new types in BOTH.

## Media Uploads
Rep-uploaded: `POST /api/rep-portal/uploads/signed-url` → client PUTs direct to Supabase Storage → `POST /uploads/complete` verifies + returns `public_url`. Bucket `rep-media` (public-read, server-signed writes). Caps in `lib/uploads/rep-media-config.ts`: avatar 2MB, banner 3MB, quest_proof 8MB, story_image 8MB, story_video 50MB (mp4/quicktime). Legacy `/api/upload` base64 still used for tenant branding + admin uploads. Quest video via `/api/upload-video` → Mux `mp4_support: capped-1080p`. Helpers in `lib/mux.ts`: `getMuxStreamUrl()`, `getMuxDownloadUrl()`, `getMuxThumbnailUrl()`.

## Seasons / Rank Delta / Streaks
**Seasons** cut — leaderboard is rolling-30-day, iOS formats masthead client-side. **Rank snapshots** (`rep_rank_snapshots`): weekly cron freezes per-promoter rolling-30-day rank; `leaderboard.delta_week` = today vs 5–10-day-old snapshot. **Streaks** (`rep_streaks`): dashboard GET calls `mark_rep_active` (idempotent per day); nightly `reset_stale_streaks` zeros `current_streak` for reps 2+ days inactive; `best_streak` permanent.

## Account Deletion (App Store) + Activity Feed
`DELETE /api/rep-portal/me` — soft-delete: `status='deleted'`, PII scrubbed, `auth_user_id` detached, device tokens removed, memberships → `left`, blocks/reports/follows preserved. **`rep.id` PRESERVED** for ledger/orders FKs.

`GET /api/rep-portal/me/activity` — personal feed (quest approvals, level-ups, claims, rejections, rank movements; paginated). Distinct from `feed` (peer ticker).

## Admin Reps (`/admin/reps/`)
6 tabs: Dashboard, Reps, Quests, Reports (submissions), Rewards, Settings. Permissions: `perm_reps` (parent) + `perm_reps_{manage,content,award,settings}` (sub-perms auto-clear when parent off).

## Stories
Mandatory-Spotify-track ephemeral posts by reps, 24h expiry. `rep_stories` snapshots full Spotify track at submit (track_id, preview_url, clip_start/length, title, artist, album_image, external_url, artists jsonb) + `track_start_offset_ms`, `view_count`, `expires_at`, `deleted_at`, `moderation_*`, `visibility`. Snapshot stabilises playback if upstream changes. `rep_story_views` logs impressions; trigger `rsv_count_sync` syncs count.

**Likes** (`rep_story_likes`, unique `(story_id, rep_id)`): every `StoryDTO` carries `like_count`, `is_liked_by_me`, `recent_likers` (cap 3, newest first) — batch-loaded via `lib/story-likes.ts` `fetchStoryLikesBatch()` in feed/list endpoints. Visibility gate on like POST/DELETE matches `GET /:id` (followers-only requires mutual follow).

Spotify (`lib/spotify/`): `client.ts` (Client Credentials, app-level metadata), `user-auth.ts` (per-rep OAuth: HMAC state, AES-256-GCM token encryption, code/refresh exchange, /me fetch — never write plaintext to `spotify_user_tokens`), `preview-resolver.ts` (3-source fallback Spotify → iTunes → Deezer ISRC). Routes `/api/rep-portal/stories/*` (create, feed grouped 24h, single-rep timeline, view-log, delete, **`[id]/like` POST/DELETE**, **`[id]/likes` GET paginated `RepListEntry`**) + `/api/rep-portal/spotify/*` (`connect-init`, `oauth-callback` PUBLIC, `me`, `connection`). Cron `cron/stories-expire` hourly. Mapper `lib/stories-mapper.ts` (DB → iOS DTO) — use in any endpoint surfacing a story.

**Spotify connect (per-rep OAuth)**: iOS Settings row → `POST /api/rep-portal/spotify/connect-init` returns `{ auth_url }` with HMAC-signed state binding the rep id (15-min window). iOS opens `auth_url` in `ASWebAuthenticationSession`. Spotify redirects browser to `GET /api/rep-portal/spotify/oauth-callback` (PUBLIC — state token IS the rep proof). Callback exchanges code, AES-256-GCM encrypts access + refresh tokens, upserts `spotify_user_tokens`, then 302s to `entry://spotify-callback?status=success|error&display_name=...`. `GET /me` returns `{ connected, display_name?, premium? }` (`connected:false` is normal, NOT 404). `DELETE /connection` removes the row (revoke is best-effort no-op — Spotify doesn't expose a public revoke endpoint as of 2026-05).

## Moderation (App Store 1.2)

- **`rep_blocks`** (blocker_rep_id, blocked_rep_id, reason). Read paths must OR-check both directions to hide content. Endpoint `/api/rep-portal/blocks/`.
- **`rep_reports`** (reporter_rep_id, target_rep_id or target_story_id, reason_code, surface, free_text, status, reviewed_by_user_id, reviewed_at, review_notes). Endpoint `/api/rep-portal/reports/`. Admin review surface planned.
- Story takedown: `rep_stories.moderation_removed_by` + `moderation_reason`.

## Entry Market (Round 2)

Platform-only catalog redeemable with EP, sourced from external Shopify (Harry's). Tenants don't list — platform inventory.

Tables: `platform_market_products`, `platform_market_product_variants` (option1/2/3, ep_price, stock), `platform_market_claims` (rep_id, variant_id, ep_spent, shipping_*, status, external_*), `platform_market_vendors` (handle, external_shop_domain). RPCs: `claim_market_product_atomic(rep_id, variant_id, ep_cost, shipping_addr)` (locks, verifies, ledger + stock, creates claim), `cancel_market_claim_and_refund(claim_id, reason)`. Lib `lib/market/shopify.ts` (Admin API). Routes `/api/rep-portal/market/*`. No admin UI yet — managed via Shopify + DB.

## Paused / Deferred

See CLAUDE.md → Known Gaps for poster drops, Apple Sign-In, Entry Market admin UI, story moderation queue. Schema-ready but no code path: **Platform bonus EP**.
