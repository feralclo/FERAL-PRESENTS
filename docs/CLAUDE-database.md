# Entry — Database Reference

Linked from `CLAUDE.md`. Full table catalog, views, RPCs, triggers, settings keys.

Project: `rqtfghzhkkdytkegcifm` (agency-feral, eu-west-1).

## Tables (~56 public)

### Tenant-scoped (have `org_id`)

**Commerce**: `site_settings`, `events`, `ticket_types`, `products`, `orders` (order_number FERAL-XXXXX, payment_ref idempotency, `refunded_by`), `order_items`, `tickets` (ticket_code FERAL-XXXXXXXX), `customers`, `artists`, `event_artists`, `guest_list` (source/access_level/invite_token), `discounts`, `abandoned_carts`, `traffic_events`, `popup_events`, `payment_events`, `event_interest_signups`, `merch_collections`, `merch_collection_items`, `waitlist_signups`. Tenant mgmt: `org_users` (perm_*), `domains`.

**Media library**: `tenant_media` (kind=quest_cover|quest_content|quest_asset|event_cover|reward_cover|generic, source=upload|template|instagram, `tags[]` first entry = campaign-group slug, soft-delete via `deleted_at`). `quest_cover` = 3:4 in-app hero (no text — iOS overlays it). `quest_content` = 9:16 shareable creative reps post to TikTok/IG (text often baked in). Same library, separated by filter chip. Storage bucket `tenant-media` (public-read, key layout `{org_id}/{kind_prefix}/{uuid}.{ext}`). On upload, `/api/admin/media/complete` runs Sharp to resize-to-1200×1600 + WebP@q82 + strip EXIF (saves ~95% bytes for iOS). Powers `/admin/library/` page + the inline `<CoverImagePicker />` modal used by the quest editor (kind=quest_cover, templates on) and event editor Cover slot (kind=event_cover, templates off, 1:1 preview). `<ImageSlot mediaKind=...>` opt-in routes drag-drop through the same pipeline.

**Events image slots**: `cover_image_url` / `poster_image_url` / `banner_image_url` (clean / story-share text-baked / 16:9). Legacy `cover_image` + `hero_image` retained for v1.

### NOT org-scoped (rep- or platform-keyed)

**Identity/social**: `reps` (status active|deleted|suspended), `promoters`, `rep_promoter_memberships`, `rep_promoter_follows`, `rep_follows`, `rep_blocks`, `rep_reports`, `rep_event_attendance` (**RLS DISABLED** — populated by `ticket_attendance_sync` trigger).

**Activity**: `rep_quests`, `rep_quest_submissions`, `rep_quest_acceptances`, `rep_rewards`, `rep_reward_claims`, `rep_events`, `rep_milestones`, `rep_event_position_rewards`, `rep_points_log`, `rep_streaks`, `rep_rank_snapshots`, `rep_asset_downloads`.

**Notifications**: `rep_notifications`, `rep_push_subscriptions` (legacy), `device_tokens`, `notification_deliveries`, `rep_event_reminders` (cron dedup, internal only).

**Stories**: `rep_stories`, `rep_story_views`, `rep_story_likes` (unique `(story_id, rep_id)`).

**Spotify per-rep OAuth**: `spotify_user_tokens` (PK `rep_id`, AES-256-GCM-encrypted `access_token`/`refresh_token`).

**Track suggestions** (powers `/api/rep-portal/spotify/suggestions` trending section): `trending_playlist_snapshots` (PK `playlist_id`, Spotify `snapshot_id` + last_refreshed_at — cron compares to skip unchanged playlists), `trending_track_pool` (PK `(playlist_id, track_id)`, persisted track snapshots with `first_seen_at` preserved across refreshes for freshness signal), `rep_track_impressions` (PK `(rep_id, track_id)`, count + last_shown_at — drives per-rep impression decay in smart-mix).

**EP**: `platform_ep_config` (singleton), `ep_ledger` (APPEND-ONLY), `ep_tenant_purchases`, `ep_tenant_payouts`.

**Market**: `platform_market_{products,product_variants,claims,vendors}`.

### Legacy / low-row (don't extend)
`contracts`, `settings` (generic, distinct from `site_settings`), `artists_legacy_payments`.

## Views

- `ep_rep_balances` — rep balance from ledger SUM
- `ep_tenant_float` — available for quest rewards
- `ep_tenant_earned` — redeemed by reps, owed at next payout
- `ep_rep_balance_drift` — diagnostic; rows = cache/ledger mismatch (integration tests assert empty)

## RPCs

**Sales/refund**: `increment_sold(ticket_type_id, qty)` (false=rollback), `decrement_sold(...)` (refund), `increment_discount_used(discount_id)` / `decrement_discount_used(...)` (both decrement RPCs added 2026-04-26).

**EP**: `award_quest_ep(rep_id, tenant_org_id, ep_amount, quest_submission_id, fiat_rate_pence)` (atomic; raises `insufficient_float` P0001), `reverse_quest_ep(...)` (partial clawback — only what rep still has, tenant absorbs difference), `claim_reward_atomic(rep_id, org_id, reward_id, points_cost)` (locks, verifies, ledger debit, claim, decrement stock), `cancel_claim_and_refund(claim_id, reason)`, `claim_market_product_atomic(...)` / `cancel_market_claim_and_refund(...)` (Entry Market), `plan_tenant_payouts()`, `create_pending_payout(...)`, `complete_tenant_payout(payout_id, stripe_transfer_id)` (idempotent), `fail_tenant_payout(payout_id, reason)`.

**Rep activity**: `capture_rep_rank_snapshots()`, `mark_rep_active(rep_id, today?)`, `reset_stale_streaks()`, `reverse_rep_attribution(order_id)`, `get_rep_program_stats(org_id)`.

**Helpers**: `test_cleanup_ep_ledger(tenant_org_id)` (refuses non-`__test*`), `auth_user_org_id()` (RLS), `set_updated_at()`.

## Triggers (key invariants)

- `ep_ledger_no_update` / `ep_ledger_no_delete` — append-only enforcement
- `ep_ledger_rep_cache_sync` — maintains `reps.currency_balance` on INSERT
- `rpf_follower_count_sync`, `rpm_team_size_sync`, `rf_rep_counts_sync` — denorm counts
- `rsv_count_sync` — story view count
- `ticket_attendance_sync` — populates `rep_event_attendance` on ticket INSERT
- `rep_notifications_read_sync` — `read_at` timestamp

## Constraints

`orders.order_number` unique `FERAL-XXXXX`; `tickets.ticket_code` unique `FERAL-XXXXXXXX`; `orders.payment_ref` idempotent (Stripe PI ID); `ticket_types.product_id` FK `products` (ON DELETE SET NULL); `rep_notifications.type` CHECK matches TS union; `rep_push_subscriptions` unique `(rep_id, endpoint)`; `ep_ledger` append-only via triggers.

## Settings Keys glossary

JSONB in `site_settings`. **Always use helpers in `lib/constants.ts`, never hardcode.**

**Per-org** (`{org_id}_*` helpers): branding, themes, VAT, homepage, reps, automations (cart/announcement), popup, marketing, email, wallet, events-list, stripe-account, EP-billing (off-session card), plan, onboarding, merch-store, scanner (assignments + live tokens), guest-list (3 keys), waitlist (per-event), campaigns.

**Raw** (no helper): `{org_id}_pdf_ticket`, `{org_id}_event_{slug}`, `media_*`.

**Platform singletons**: `platformBillingKey()`, `exchangeRatesKey()` + raw `platform_payment_digest|health_digest|beta_applications|beta_invite_codes|entry_platform_xp`.

**Pre-org**: `wizardStateKey(authUserId)`.

⚠️ **`TABLES` constant lags ~24 tables** (rep social/EP/market/notification). Update opportunistically; raw strings accepted in interim.
