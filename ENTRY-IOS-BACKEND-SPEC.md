# Entry Backend — iOS / Android / web-v2 Spec

**Version:** v2.0 — 2026-04-22 (shipped)
**Status:** All 5 phases complete. iOS unblocked for end-to-end consumption. Poster drops paused — see §5.10. Apple Sign-In deferred — see Decision L. Awaiting: APNs + FCM credentials for push transports to light up.

This document is the single source of truth for the backend work required to support the native Entry clients (iOS first, Android + web-v2 later). It supersedes ad-hoc conversation and the iOS-side `design/api-contract.md` (which should be updated to match once this spec is locked).

---

## 1. What we're building and why

The existing web rep portal (`/rep/*` in this repo) is the **v1 rep product**. It works, it's in production, it will be **frozen** — no new features, security fixes only. The **v2 rep product** is being designed natively on iOS and represents a ground-up rethink: first-class promoter entities, cross-tenant rep identity, platform-wide EP currency with a real economy, follow graph, social feed, poster drops, proper APNs push, and share-to-Story flows. Android and web-v2 ship against the same backend later.

**Three guiding principles:**

1. **The backend is the contract.** Every client (iOS, Android, web-v2) hits the same endpoints with the same shapes. No client-specific response branches. No `?platform=ios` hacks.
2. **Build complete, not minimum.** Each phase ships: migration → endpoint → admin UI → tests → types regenerated. No stubs, no "wire this up later," no `TODO`s in committed code.
3. **Every EP movement is a money movement.** EP is real economic value — tenants buy EP with cash, reps earn and spend EP, Entry pays tenants in cash when reps redeem. This is not points. Every transaction goes through an append-only ledger with a Stripe paper trail.

---

## 2. Decisions locked in

From the alignment conversation:

| # | Decision | Resolution |
|---|----------|-----------|
| 1 | Signup | Free and open. Anyone can install the app, sign up, become a rep. Team membership is a separate gated step. |
| 2 | Currency | Platform-wide **EP**. Replaces the per-tenant `currency_name` setting on rep payloads. Real economy — Entry sells EP, tenants list shop items, reps redeem, Entry pays tenants minus cut. |
| 3 | Rep → promoter gating | Rep requests to join a promoter's team. Tenant approves. (Future: tenant can flip to open-team for drive-by enrolment.) |
| 4 | Quest moderation | Unchanged — per-quest config: auto-approve or admin review. |
| 5 | Cross-org follows / memberships | **Yes.** A rep is a platform identity that can belong to multiple promoters' teams and follow many more. |
| 6 | Promoter ↔ org | **1:1.** One org = one public promoter identity. If a tenant wants another brand, they create another org. Schema assumes 1:1 but doesn't hard-constrain it. |
| 7 | Friends | One-way follow (rep → rep). Mutual follow computed as "friend" for messaging/unlocks later. |
| 8 | Poster drops | Table + endpoint built v1; authoring UI = later. Near-term feed content = auto-generated event drops. |
| 9 | Feed visibility | Event drops = public (anyone sees). Quests = team-only (approved membership required to see/earn). Algorithmic discovery = later. |
| 10 | Legacy web rep portal | Freeze. No new features. Rebuild v2 later against this locked contract. |

---

## 3. Decisions on economy & edge cases

These were open questions in the first draft — now locked in. Reasoning in §7.4–7.6 where it matters.

| # | Decision | Value |
|---|----------|-------|
| A | **EP fiat rate** | **1 EP = £0.01 (1 penny).** 100 EP = £1, 1,000 EP = £10, 10,000 EP = £100. Single platform-wide rate set in `platform_ep_config`. Rate changes are forward-only — historic ledger entries snapshot the rate in effect at the time. Chosen so that typical quest rewards (100–300 EP) feel like points rather than wages, while still corresponding to real economic value behind the scenes. |
| B | **Platform cut on EP redemption** | **10%** of fiat value at payout. Not on purchase (tenants get face-value EP for the price they pay). Configurable per-tenant later via `promoters.ep_platform_cut_bps` (basis points) with the default on the platform config row. |
| C | **Quest EP debit timing** | **On approval.** Tenant float drops when admin approves (or auto-approve fires). Rejected quests cost the tenant nothing. Publishing a quest with `ep_reward > 0` requires the tenant's float to cover `ep_reward × max_completions` as a soft reservation (warning, not a hard block — tenants topping up mid-campaign is normal). |
| D | **Shop fulfillment modes** | Four modes, all in the `fulfillment_kind` enum: `digital_ticket` (synchronous — issues PKPass), `guest_list` (synchronous — adds rep's named guest to door list), `merch` (async — tenant ships, sets `fulfilled_at` + tracking in admin), `custom` (tenant defines, marks done manually). |
| E | **EP refunds / reversals** | Tenants can reverse an approved quest from admin — writes reversal ledger entries restoring tenant float + clawing rep balance. If the rep already spent the EP, clawback is partial — whatever's unspent reverses, the rest is absorbed by the tenant. Reps cannot self-cancel claims. Claims go `claimed → fulfilling → fulfilled` or `claimed → fulfilling → failed` (auto-reversed). |
| F | **EP expiry** | EP never expires for reps. Persona doc is explicit and the product promise is that earned EP is permanent. Tenants can refund **unspent** EP from their float **within 90 days** of the purchase — after that, float is non-refundable (platform liability until spent). |
| G | **Tenant payout cadence** | **Monthly**, auto, via Stripe Transfer to the tenant's existing Connect account. Default minimum threshold £50 — balances below roll forward to next month. Tenant can trigger early payout on-demand from `/admin/ep/payouts` (no extra fee; fraud-gated to once per 7 days). |
| H | **Rep discount code scope** | Per rep-promoter membership. A rep on FERAL's team and a Berlin promoter's team has two distinct codes. Code stored on `rep_promoter_memberships.discount_code`, generated on `status='approved'` transition. |
| I | **Platform-level quests** | Schema supports them (`rep_quests.promoter_id IS NULL`). Admin UI built behind platform-owner permission for Entry to run cross-tenant onboarding/engagement quests. Not seeded with content v1. |
| J | **Seasons (cut from v1)** | ~~Per-promoter seasons~~. **No seasons table in v1.** Leaderboard rank is computed over a rolling 30-day window (trailing from now). Masthead kicker on iOS becomes a locally-formatted date (e.g. "April 2026" or "This month") — no backend field needed. Seasons return as a v2 **platform-level marketing feature** where Entry runs cross-tenant narrative seasons (e.g. "Summer Of Entry"), not per-tenant cadences. This removes the multi-team ambiguity, kills `/admin/seasons/` CRUD, and removes Phase 5.1 work. |
| K | **VAT / accounting treatment** | EP treated as a **multi-purpose voucher** under UK VAT rules. Practical upshot: **no VAT charged on the EP purchase itself** (it's a prepayment of a credit, not a supply). VAT is accounted for at the point of redemption — when Entry pays the tenant, a VAT-inclusive settlement statement is generated for tenant accounting. Platform cut is treated as Entry's commission on facilitating the redemption (standard platform/marketplace VAT). This is how Stripe, Klaviyo and similar credit-based systems are structured. **Action for live launch:** confirmed as reasonable default; flag to an accountant before first real-money transactions, but does not block build. |
| L | **Apple Sign-In (deferred)** | **Not in v1.** Email+password only for now. No App Store risk since we're not offering other third-party SSO (Google / Facebook). When Google SSO is later added, Apple Sign-In becomes mandatory under guideline 4.8 and ships alongside it in the same release. Schema-ready (rep row has no required password — linking via `auth_user_id` + email works identically for any Supabase-supported auth provider). |

### 3.1 New decision surfaced in economic stress-test

| # | Decision | Value |
|---|----------|-------|
| M | **Tenant EP purchase refund window** | Tenants can refund unspent float within **90 days** of the originating purchase, FIFO against oldest purchases first. Past 90 days, float is non-refundable and sits as platform liability. Prevents tenants parking cash indefinitely then clawing back. |
| N | **Breakage policy** | If a rep account is deleted with unspent EP, the balance is reversed against the ledger (not re-credited to tenants). If EP sits on a live but dormant rep account indefinitely, it remains liability forever — no automatic sweep. Entry does not recognise breakage as revenue unilaterally; a future accounting policy can set that. |
| O | **Float price per EP is fixed across tenants** | Tenants don't negotiate rates — every tenant buys at 1 EP = £0.01. Enterprise pricing (volume discounts) is a Phase 10+ conversation, not v1. Keeps the ledger and payout math identical across tenants. |
| P | **XP-only quests are first-class** | Tenants can publish quests with `ep_reward = 0` — runs entirely on XP (reputation/levelling). No EP debit, no ledger entries, no tenant float required. Tenant doesn't need to buy EP to use the rep program; EP is an optional monetary incentive layer on top of XP. Most new tenants will start here, opt into EP later. |
| Q | **Platform bonus EP** (deferred) | Placeholder for future: Entry could auto-credit a small amount of EP (e.g. 5–10 EP) on every approved submission regardless of tenant contribution, to keep reps active on the platform. Schema-ready (`ep_ledger.entry_type` can add `platform_bonus`), but no code path runs it v1. Revisit after 3 months of real usage data. |

---

## 4. Naming & cross-platform conventions

### 4.1 URL paths

All mobile-client endpoints live under `/api/`. Not versioned in the path (we'll version by breaking change if it ever happens). Public pattern:

- `/api/auth/*` — auth (login, refresh, Apple SSO, logout)
- `/api/rep-portal/*` — authenticated rep API (used by iOS, Android, web-v2)
- `/api/reps/*` — **admin** rep management (used by web admin dashboard only)
- `/api/promoters/*` — public promoter reads (no auth required for discovery)
- `/api/ep/*` — EP economy endpoints (tenant-side)
- `/api/admin/*` — admin-only surfaces (already exists; extends here for new admin UIs)

**Rename:** the current untracked `/api/auth/mobile-login` → **`/api/auth/mobile-login`** stays (iOS is already pointed at it). Add `/api/auth/mobile-refresh` + `/api/auth/mobile-login-apple` as siblings. We're no longer renaming to `/api/auth/token` — keeping iOS's current path is cheaper than re-pointing.

### 4.2 JSON field naming

- `snake_case` for all JSON keys. Matches current backend convention. iOS decoder already handles it.
- All list responses wrapped in `{ "data": [...] }`. Single-object responses: `{ "data": {...} }`. Never return a bare array.
- All timestamps: ISO 8601 UTC strings. Never epoch integers, never local time.
- All money: integer minor units (pennies). Never floats. Currency code as separate field.
- All IDs: UUID v4 strings. Never auto-incrementing integers in JSON.

### 4.3 Auth header

`Authorization: Bearer <access_token>` on every authenticated request. `X-Refresh-Token` never sent by client — refresh token only travels on the refresh endpoint in the body.

### 4.4 Error shape

```json
{ "error": { "code": "rep_not_on_team", "message": "Not a member of this promoter's team" } }
```

Codes are snake_case enums. Message is human-readable English fallback. Clients switch on code, not message.

---

## 5. Schema changes (migration plan)

Migrations applied in order. Each migration is atomic — if it fails, the whole migration rolls back. Naming: `YYYYMMDDHHMMSS_{slug}.sql`.

### 5.1 `promoters` table (NEW)

Public projection of an org. 1:1 with an existing org_id. Every tenant gets one row seeded from their branding on migration.

```sql
CREATE TABLE promoters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL UNIQUE REFERENCES ... ,  -- 1:1 with org today
  handle TEXT NOT NULL UNIQUE,                   -- @handle, lowercase, URL-safe
  display_name TEXT NOT NULL,
  tagline TEXT,                                  -- one-line bio (shown on cards)
  bio TEXT,                                      -- longer bio (profile page)
  location TEXT,                                 -- "London · UK"
  accent_hex INT NOT NULL DEFAULT 0xB845FF,     -- brand colour for chrome (stored as int, rendered #RRGGBB)
  avatar_url TEXT,                               -- nullable; fallback = initials
  avatar_initials TEXT,                          -- precomputed from display_name
  avatar_bg_hex INT,                             -- colour behind initials
  cover_image_url TEXT,                          -- promoter profile hero
  website TEXT,
  instagram TEXT,
  tiktok TEXT,
  follower_count INT NOT NULL DEFAULT 0,         -- denormalised, maintained by triggers on rep_promoter_follows
  team_size INT NOT NULL DEFAULT 0,              -- denormalised, approved memberships only
  visibility TEXT NOT NULL DEFAULT 'public'      -- 'public' | 'private' (future: soft-unlist)
    CHECK (visibility IN ('public', 'private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX promoters_org_id_idx ON promoters(org_id);
CREATE INDEX promoters_handle_lower_idx ON promoters(lower(handle));
```

**Data migration:** For every row in `org_users` distinct `org_id`, create a `promoters` row. `handle` = `org_id` (slugified). `display_name` pulled from `{org_id}_branding.name`. Accent from branding.primary_color (or default). Cover from branding.cover_image.

### 5.2 `reps` table — drop per-org scope

Today `reps.org_id NOT NULL`. Reps are platform identities now.

```sql
ALTER TABLE reps ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE reps ADD COLUMN platform_level BOOLEAN NOT NULL DEFAULT false;
  -- If true, not attached to any single org at identity level. Default for new reps.
```

**Data migration:** Don't drop `org_id` on existing rows yet — we'll use it to seed the first `rep_promoter_memberships` row per rep. After that migration runs, a follow-up release can null it out.

New rep signups (post-migration) always have `org_id = NULL, platform_level = true`. Their relationship to promoters is expressed through memberships.

### 5.3 `rep_promoter_memberships` (NEW)

The rep↔promoter team relationship. Many-to-many with lifecycle.

```sql
CREATE TABLE rep_promoter_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  promoter_id UUID NOT NULL REFERENCES promoters(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'left')),
  discount_code TEXT,                            -- per-membership code; set on approval
  discount_percent INT,                          -- overrides promoter default if set
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),    -- which admin approved
  left_at TIMESTAMPTZ,
  rejected_reason TEXT,
  UNIQUE (rep_id, promoter_id)
);
CREATE INDEX rpm_rep_idx ON rep_promoter_memberships(rep_id);
CREATE INDEX rpm_promoter_idx ON rep_promoter_memberships(promoter_id);
CREATE INDEX rpm_status_idx ON rep_promoter_memberships(promoter_id, status);
```

**Data migration:** For every existing `reps` row with `org_id` set, create one `rep_promoter_memberships` row with `status='approved'`, `promoter_id` resolved via `org_id → promoters`, `discount_code` copied from the rep's existing discount if one exists.

**RLS / auth consequence:** `requireRepAuth()` no longer needs an `orgId` for the rep. It returns `{ rep }`. Each endpoint resolves `promoter_id` from the request (path param, body, or "my memberships") to enforce team gating.

### 5.4 `rep_promoter_follows` (NEW)

Follow = soft signal, no team permissions. Drives feed scope and "Your Shops."

```sql
CREATE TABLE rep_promoter_follows (
  rep_id UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  promoter_id UUID NOT NULL REFERENCES promoters(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rep_id, promoter_id)
);
CREATE INDEX rpf_promoter_idx ON rep_promoter_follows(promoter_id);
```

Trigger to maintain `promoters.follower_count` on insert/delete.

### 5.5 `rep_follows` (NEW) — rep↔rep one-way follows

```sql
CREATE TABLE rep_follows (
  follower_id UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id != followee_id)
);
CREATE INDEX rf_followee_idx ON rep_follows(followee_id);
```

Mutual follow (A follows B AND B follows A) = computed "friend." No separate `rep_friends` table.

### 5.6 `device_tokens` (NEW) — unified push

Supersedes `rep_push_subscriptions` for new devices. Keep the old table running for existing web-PWA reps.

```sql
CREATE TABLE device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  token TEXT NOT NULL,                           -- APNs device token / FCM registration ID / web-push endpoint
  app_version TEXT,
  os_version TEXT,
  device_model TEXT,
  push_enabled BOOLEAN NOT NULL DEFAULT true,    -- rep toggled off in settings
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rep_id, token)
);
CREATE INDEX dt_rep_idx ON device_tokens(rep_id);
```

Web-push subs can migrate lazily: next time a PWA rep opens the app, the `/push-subscribe` endpoint writes to `device_tokens` with `platform='web'`.

### 5.7 `events` — image slot split

```sql
ALTER TABLE events ADD COLUMN cover_image_url TEXT;     -- clean, no baked text, in-app use
ALTER TABLE events ADD COLUMN poster_image_url TEXT;    -- full poster with text, share-to-Story
ALTER TABLE events ADD COLUMN banner_image_url TEXT;    -- landscape 16:9, card headers
```

Keep existing `cover_image` and `hero_image` columns writable — they remain the v1 web theme's image source. Data migration: copy `cover_image → cover_image_url` initially (best we can do automatically). Admins re-upload the clean variant as they edit events.

### 5.8 `rep_quests` — extensions for iOS contract

```sql
ALTER TABLE rep_quests ADD COLUMN promoter_id UUID REFERENCES promoters(id);
  -- nullable: null = platform-level quest
ALTER TABLE rep_quests ADD COLUMN subtitle TEXT;
ALTER TABLE rep_quests ADD COLUMN instructions TEXT;         -- long-form markdown
ALTER TABLE rep_quests ADD COLUMN platform TEXT
  CHECK (platform IN ('tiktok', 'instagram', 'any') OR platform IS NULL);
ALTER TABLE rep_quests ADD COLUMN proof_type TEXT NOT NULL DEFAULT 'none'
  CHECK (proof_type IN ('screenshot', 'url', 'text', 'instagram_link', 'tiktok_link', 'none'));
ALTER TABLE rep_quests ADD COLUMN cover_image_url TEXT;
ALTER TABLE rep_quests ADD COLUMN accent_hex INT;
ALTER TABLE rep_quests ADD COLUMN accent_hex_secondary INT;
ALTER TABLE rep_quests ADD COLUMN sales_target INT;          -- for salesMilestone quests
ALTER TABLE rep_quests ADD COLUMN xp_reward INT;             -- new name; migrate from points_reward
ALTER TABLE rep_quests ADD COLUMN ep_reward INT NOT NULL DEFAULT 0;
  -- EP reward tenant attaches (platform-wide currency, debits tenant's EP float on approval)
ALTER TABLE rep_quests ADD COLUMN auto_approve BOOLEAN NOT NULL DEFAULT false;
```

Data migration: `xp_reward = points_reward`. Keep `points_reward` writable for legacy web admin until we retire it.

**XP-only quests (ep_reward = 0):** A quest with `ep_reward = 0` is a first-class flow and skips the EP ledger entirely — no tenant float required, no `tenant_quest_debit` on approval, no `rep_quest_credit` entry. The rep still earns `xp_reward`, which is managed entirely by the XP subsystem (no money movement). This is the default configuration for new tenants — they can run the full rep program without ever buying EP. Quest editor in the admin makes EP opt-in (collapsed by default, with a "Add EP reward" expander).

### 5.9 `rep_quest_submissions` — extra fields

```sql
ALTER TABLE rep_quest_submissions
  ADD COLUMN requires_revision BOOLEAN NOT NULL DEFAULT false;
  -- allows "rejected with detailed reason, please resubmit" without ending the loop
```

### 5.10 `poster_drops` (NEW)

```sql
CREATE TABLE poster_drops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id UUID NOT NULL REFERENCES promoters(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('event_reveal', 'poster_reveal', 'quest_drop', 'announcement')),
  related_event_id UUID,                         -- set for event_reveal / poster_reveal
  related_quest_id UUID,                         -- set for quest_drop
  headline TEXT NOT NULL,
  subline TEXT,
  cover_image_url TEXT,
  body TEXT,                                     -- long-form for announcements
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pd_promoter_idx ON poster_drops(promoter_id, published_at DESC);
```

**Kinds:**

- `event_reveal` — new event announced (date, venue, initial info). Auto-generated on event publish.
- `poster_reveal` — full artwork released for a previously-announced event. Distinct from event_reveal because the poster often drops weeks after the event itself goes public. Manual authoring.
- `quest_drop` — new quest published. Auto-generated on quest publish with `ep_reward > 0` (EP quests create buzz; XP-only quests do not auto-drop).
- `announcement` — free-form text/image post from the promoter (line-up change, door update, after-party reveal). Manual authoring.

**Status: paused.** The whole poster-drops concept (promoter-authored broadcasts: event reveals, poster reveals, quest drops, announcements) is deferred per owner direction — the product surface needs more thought before building. The spec is kept as-is so we can pick it up cleanly later, but no table, no auto-generation, no API, no UI lands in v1.

Phase 4 `/api/rep-portal/feed` remains in scope but returns **peer activity only** (approved submissions across the rep's teams) — no drops union.

### 5.11 EP economy tables (NEW)

The heart of the real-money layer. Every EP movement goes through the ledger. Event sourcing shape — append-only, never update.

#### `ep_ledger` — append-only record of every EP movement

```sql
CREATE TABLE ep_ledger (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'tenant_purchase',       -- tenant bought EP from platform (+tenant float)
    'tenant_quest_debit',    -- tenant's float -> locked for quest reward (-tenant float)
    'rep_quest_credit',      -- quest approved -> rep gets EP (+rep balance, -escrow)
    'rep_shop_debit',        -- rep redeemed in shop (-rep balance, +tenant earned)
    'tenant_payout',         -- platform paid tenant in cash (-tenant earned)
    'reversal'               -- manual correction, references prior entry
  )),
  ep_amount INT NOT NULL,                        -- positive always; direction given by entry_type
  -- Parties involved (nullable depending on entry_type)
  tenant_org_id TEXT,                            -- which tenant's float / earned pot
  rep_id UUID REFERENCES reps(id),
  -- Source-of-truth references
  ep_purchase_id UUID,                           -- fk to ep_tenant_purchases
  quest_submission_id UUID,                      -- fk to rep_quest_submissions
  reward_claim_id UUID,                          -- fk to rep_reward_claims
  payout_id UUID,                                -- fk to ep_tenant_payouts
  reverses_entry_id BIGINT REFERENCES ep_ledger(id),
  -- Fiat context (snapshotted at time of entry)
  fiat_rate_pence INT,                           -- EP-to-pence at time of entry (e.g. 10 = 1 EP = 10p)
  notes TEXT
);
CREATE INDEX ep_ledger_tenant_idx ON ep_ledger(tenant_org_id, created_at DESC);
CREATE INDEX ep_ledger_rep_idx ON ep_ledger(rep_id, created_at DESC);
```

**Balances are always views over this table, never independent state:**

```sql
CREATE VIEW ep_tenant_float AS
  SELECT tenant_org_id,
         SUM(CASE entry_type
               WHEN 'tenant_purchase'    THEN  ep_amount
               WHEN 'tenant_quest_debit' THEN -ep_amount
               WHEN 'reversal'           THEN ... -- resolve from reverses_entry_id
             END) AS balance
    FROM ep_ledger
   WHERE entry_type IN ('tenant_purchase', 'tenant_quest_debit', 'reversal')
   GROUP BY tenant_org_id;

CREATE VIEW ep_tenant_earned AS ... -- rep_shop_debit minus tenant_payout

CREATE VIEW ep_rep_balance AS ... -- rep_quest_credit minus rep_shop_debit
```

`reps.currency_balance` becomes a denormalised cache of `ep_rep_balance` updated by trigger on ledger insert. Single source of truth = ledger.

#### `ep_tenant_purchases`

```sql
CREATE TABLE ep_tenant_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_org_id TEXT NOT NULL,
  ep_amount INT NOT NULL,
  fiat_pence INT NOT NULL,                       -- cash paid
  fiat_currency TEXT NOT NULL DEFAULT 'GBP',
  stripe_payment_intent_id TEXT UNIQUE,          -- idempotency
  status TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed','refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
```

On Stripe webhook `payment_intent.succeeded` with metadata `{ type: 'ep_purchase', tenant_org_id: ..., ep_amount: ... }`, write a `tenant_purchase` ledger entry.

#### `ep_tenant_payouts`

```sql
CREATE TABLE ep_tenant_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_org_id TEXT NOT NULL,
  ep_amount INT NOT NULL,                        -- EP being paid out (before cut)
  platform_cut_pence INT NOT NULL,
  tenant_net_pence INT NOT NULL,
  fiat_currency TEXT NOT NULL DEFAULT 'GBP',
  stripe_transfer_id TEXT UNIQUE,                -- Stripe Transfer ID to connected account
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
```

Monthly cron runs, groups unpaid `rep_shop_debit` ledger entries per tenant, computes totals, issues one Stripe Transfer per tenant (skipping if below min), writes payout row and `tenant_payout` ledger entry.

#### Existing `rep_rewards` and `rep_reward_claims` — alignment

No new tables needed for shop items. Reuse `rep_rewards` with:
- `reward_type = 'shop'` (rename from `'product'` — iOS uses `shop`)
- `ep_cost INT NOT NULL` (rename from `currency_cost`)
- `stock INT` (nullable = unlimited)
- `fulfillment_kind TEXT CHECK (fulfillment_kind IN ('digital_ticket','guest_list','merch','custom'))`

`rep_reward_claims` extends:
- `status` adds `'fulfilling'` and `'failed'` to existing enum
- `fulfillment_payload JSONB` — e.g. PKPass URL, guest name, door note, tracking number

Claiming writes a `rep_shop_debit` ledger entry inside the same transaction as the claim row insert.

### 5.12 Seasons — cut from v1

No table. No API. No admin UI. Leaderboard uses a rolling 30-day window (§5.13, §6.9). Masthead date kicker rendered client-side from the device clock. Parked for v2 as a platform-level Entry-run marketing concept, not per-tenant cadences.

### 5.13 `rep_rank_snapshots` (NEW) — rolling-window leaderboard

```sql
CREATE TABLE rep_rank_snapshots (
  promoter_id UUID NOT NULL REFERENCES promoters(id) ON DELETE CASCADE,
  rep_id UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  rank INT NOT NULL,                  -- rank over the trailing 30 days at capture time
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (promoter_id, rep_id, captured_at)
);
CREATE INDEX rrs_lookup_idx ON rep_rank_snapshots(promoter_id, rep_id, captured_at DESC);
```

Weekly cron computes each rep's rolling-30-day rank per promoter and writes. `delta_week` on the leaderboard response compares today's rolling-30-day rank to the snapshot from ~7 days ago. Snapshots also feed the persona's "↑3 this week" copy without needing a separate season concept.

### 5.14 `rep_streaks` (NEW) — daily activity streak

Persona doc references `currentStreak`/`bestStreak`. Needs a daily activity marker.

```sql
CREATE TABLE rep_streaks (
  rep_id UUID PRIMARY KEY REFERENCES reps(id) ON DELETE CASCADE,
  current_streak INT NOT NULL DEFAULT 0,
  best_streak INT NOT NULL DEFAULT 0,
  last_active_date DATE NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Dashboard fetch writes today's marker. Cron at UTC midnight resets streaks whose `last_active_date < yesterday`.

### 5.15 Notification type expansions

`rep_notifications.type` CHECK constraint needs new values:

- `sale_attributed` (existing)
- `quest_approved` (existing)
- `quest_rejected` (**new** — iOS needs reason surfaced)
- `level_up` (existing)
- `reward_unlocked` (existing)
- `reward_fulfilled` (existing)
- `team_request_approved` (**new**)
- `team_request_rejected` (**new**)
- `poster_drop` (**new** — new drop from followed promoter)
- `peer_milestone` (**new** — friend levelled up / hit top 10)
- `first_sale_for_event` (**new** — elevated treatment in iOS, persona moment 1)
- `leaderboard_top10` (**new** — crossed into top 10)

Migration extends CHECK to include all.

---

## 6. API surface

Every endpoint below. `Auth` column: `public` | `rep` (via `requireRepAuth`) | `admin` (via `requireAuth`) | `platform` (via `requirePlatformOwner`).

### 6.1 Auth

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/mobile-login` | public | Email+password. Returns `{ access_token, refresh_token, expires_at, rep }`. Rate limited 5/15min/IP. |
| POST | `/api/auth/mobile-refresh` | public | Body `{ refresh_token }`. Returns new `{ access_token, refresh_token, expires_at }`. Rotates refresh token. |
| ~~POST~~ | ~~`/api/auth/mobile-login-apple`~~ | ~~public~~ | **Deferred** — see Decision L. Revisit when Google SSO is added. |
| POST | `/api/auth/mobile-signup` | public | Body `{ email, password, first_name, last_name, phone?, marketing_opt_in }`. Returns login payload. No invite required. |
| POST | `/api/auth/mobile-logout` | rep | Revokes refresh token, tombstones the row. Returns `{ success: true }`. |

**Response shape (login / signup / refresh — all identical):**

```json
{
  "data": {
    "access_token": "eyJ...",
    "refresh_token": "...",
    "expires_at": 1735689600,
    "rep": { /* full rep row — see 6.2 */ }
  }
}
```

### 6.2 Rep identity

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/rep-portal/me` | rep | Current rep full profile. |
| PATCH | `/api/rep-portal/me` | rep | Partial update: `display_name`, `photo_url`, `instagram`, `tiktok`, `bio`, `push_enabled`, `marketing_opt_in`. |
| GET | `/api/rep-portal/me/memberships` | rep | List all `rep_promoter_memberships` for this rep, grouped by status. |
| GET | `/api/rep-portal/me/balances` | rep | EP balance + XP balance + lifetime stats. Light payload for polling. |
| POST | `/api/rep-portal/me/verify-email` | rep | Send verification. |
| DELETE | `/api/rep-portal/me` | rep | Account deletion (App Store requirement). Soft-deletes; ledger + orders preserved. |

**`GET /me` response:**

```json
{
  "data": {
    "id": "uuid",
    "email": "maya@example.com",
    "first_name": "Maya",
    "last_name": "Okonkwo",
    "display_name": "maya.ok",
    "phone": "+44...",
    "photo_url": "https://...",
    "bio": "...",
    "instagram": "mayaok",
    "tiktok": "mayaok",
    "level": 7,
    "tier": "rising",
    "xp_balance": 3420,
    "xp_from_last_level": 3000,
    "xp_for_next_level": 4000,
    "ep_balance": 240,
    "total_sales": 42,
    "total_revenue_pence": 84000,
    "streak_current": 3,
    "streak_best": 14,
    "onboarding_completed": true,
    "marketing_opt_in": true,
    "push_enabled": true,
    "created_at": "2026-01-12T14:33:00Z"
  }
}
```

### 6.3 Dashboard (the big one)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/rep-portal/dashboard` | rep | Aggregated home screen. Composition endpoint — can also fetch primitives separately. |

Query params:
- `?promoter_id=...` — scope feed/events/leaderboard to a single promoter (iOS uses this when rep switches tenant context). Omit = aggregate across all approved memberships.
- `?include=...` — comma-separated list: `rep,xp,story_rail,events,feed,quests,leaderboard,recent_sales,featured_rewards,followed_promoters,discount`. Default = all. Lets web-v2 fetch subsets. (Masthead date kicker — "April 2026" / "This month" — is formatted client-side from the device clock; no backend field.)

**Response shape (full):**

```json
{
  "data": {
    "rep": { /* same as /me */ },
    "xp": {
      "balance": 3420,
      "today": 200,
      "from_last_level": 3000,
      "for_next_level": 4000,
      "level": 7,
      "tier": "rising",
      "tier_next": "pro",
      "xp_to_next_level": 580
    },
    "ep": {
      "balance": 240,
      "label": "240 EP"
    },
    "leaderboard": {
      "position": 9,
      "total": 47,
      "delta_week": -3,
      "in_top_10": true
    },
    "story_rail": [
      {
        "id": "self",
        "kind": "self_rep",
        "ring_fraction": 0.65,
        "badge": "rising",
        "display_name": "You",
        "initials": "M",
        "avatar_bg_hex": 8659711
      },
      {
        "id": "peer_xyz",
        "kind": "peer_level",
        "peer_level": 12,
        "display_name": "sandy.k",
        "initials": "SK",
        "avatar_bg_hex": 4279312
      }
    ],
    "followed_promoters": [
      {
        "id": "uuid",
        "handle": "feralpresents",
        "display_name": "FERAL Presents",
        "tagline": "Warehouse parties across UK",
        "accent_hex": 12077567,
        "avatar_url": null,
        "avatar_initials": "F",
        "avatar_bg_hex": 12077567,
        "cover_image_url": "https://...",
        "follower_count": 2410,
        "team_size": 47,
        "is_following": true,
        "is_on_team": true
      }
    ],
    "events": [
      {
        "id": "uuid",
        "promoter_id": "uuid",
        "promoter_handle": "feralpresents",
        "promoter_display_name": "FERAL Presents",
        "title": "FERAL vs. IWF",
        "slug": "feral-vs-iwf",
        "date_start": "2026-05-10T22:00:00Z",
        "date_end": "2026-05-11T06:00:00Z",
        "venue_name": "Warehouse Project",
        "city": "Manchester",
        "country": "GB",
        "status": "upcoming",
        "time_label": "2d 14h",
        "date_label": "10.05 · manchester",
        "cover_image_url": "https://...",
        "poster_image_url": "https://...",
        "banner_image_url": "https://...",
        "accent_hex": 12077567,
        "sales_count": 14,
        "revenue_pence": 28000,
        "xp_reward_max": 1200,
        "ep_reward_max": 240,
        "quests": {
          "total": 5,
          "completed": 2,
          "in_progress": 1,
          "available": 2
        }
      }
    ],
    "feed": [
      {
        "id": "activity_xyz",
        "kind": "peer_activity",
        "rep": { "id": "...", "display_name": "sandy.k", "photo_url": null, "initials": "SK", "avatar_bg_hex": 4279312 },
        "verb": "approved",
        "meta": "2h ago",
        "xp_reward": 200,
        "ep_reward": 50,
        "meta_chip": "IWF promo",
        "quest_id": "q_xyz",
        "promoter_id": "uuid"
      },
      {
        "id": "drop_abc",
        "kind": "poster_drop",
        "drop_kind": "event_reveal",
        "promoter": { "id": "...", "handle": "feralpresents", "display_name": "FERAL Presents", "accent_hex": 12077567 },
        "headline": "New date — Liverpool 24.05",
        "subline": "Lineup drops Friday",
        "cover_image_url": "https://...",
        "time_label": "2h ago",
        "related_event_id": "uuid"
      }
    ],
    "recent_sales": [
      {
        "id": "uuid",
        "order_number": "FERAL-12345",
        "total_pence": 2400,
        "currency": "GBP",
        "ticket_count": 2,
        "buyer_first_name": "Sam",
        "status": "paid",
        "created_at": "2026-04-22T19:02:00Z",
        "event": { "id": "...", "name": "FERAL vs. IWF", "slug": "feral-vs-iwf" }
      }
    ],
    "featured_rewards": [ /* Reward shape — see 6.6 */ ],
    "discount": {
      "primary_code": "MAYA10",
      "primary_percent": 10,
      "per_promoter": [
        { "promoter_id": "uuid", "code": "MAYA_FERAL", "discount_percent": 10 }
      ]
    }
  }
}
```

All sections are optional in response — clients must tolerate any missing. Backend returns `null` or omits empty sections per `?include=` param.

### 6.4 Promoters

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/promoters/discover?q=&limit=&offset=` | public | Public search / discovery. Rate limited. |
| GET | `/api/promoters/[handle]` | public | Promoter profile by handle. Returns promoter + featured events + public stats. Honours `is_following` / `is_on_team` only if authenticated. |
| GET | `/api/promoters/[handle]/events?status=&limit=&offset=` | public | Event archive. |
| GET | `/api/promoters/[handle]/team` | rep+member | Roster (requires being a member of that team). |
| POST | `/api/rep-portal/promoters/[handle]/follow` | rep | Follow. Idempotent. |
| DELETE | `/api/rep-portal/promoters/[handle]/follow` | rep | Unfollow. |
| POST | `/api/rep-portal/promoters/[handle]/join-request` | rep | Body `{ pitch? }`. Creates membership with `status='pending'`. |
| DELETE | `/api/rep-portal/promoters/[handle]/join-request` | rep | Withdraw pending request. |

**Promoter public profile response:**

```json
{
  "data": {
    "id": "uuid",
    "handle": "feralpresents",
    "display_name": "FERAL Presents",
    "tagline": "...",
    "bio": "...",
    "location": "London · UK",
    "accent_hex": 12077567,
    "avatar_url": null,
    "avatar_initials": "F",
    "avatar_bg_hex": 12077567,
    "cover_image_url": "https://...",
    "website": "https://feral.events",
    "instagram": "feralpresents",
    "tiktok": "feralpresents",
    "follower_count": 2410,
    "team_size": 47,
    "is_following": true,           // null if unauthed
    "is_on_team": true,              // null if unauthed
    "membership_status": "approved", // null | 'pending' | 'approved' | 'rejected' | 'left'
    "featured_events": [ /* EventBrief */ ],
    "event_count": 12,
    "shop_item_count": 4
  }
}
```

### 6.5 Quests

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/rep-portal/quests?promoter_id=&event_id=&status=` | rep | List. Default: all quests across rep's approved memberships + platform quests. |
| GET | `/api/rep-portal/quests/[id]` | rep | Single quest detail incl. full `my_submissions` list. |
| POST | `/api/rep-portal/quests/[id]/accept` | rep | UX-only "accepted" flag. Writes to `rep_quest_acceptances` (new lightweight table). Idempotent. |
| POST | `/api/rep-portal/quests/[id]/submissions` | rep | Submit proof. |
| GET | `/api/rep-portal/quests/submissions?quest_id=&status=` | rep | My submissions. |

**Quest response shape (per iOS `Quest` model):**

```json
{
  "id": "uuid",
  "title": "...",
  "subtitle": "...",
  "instructions": "...",
  "kind": "social_post",       // maps to QuestKind
  "platform": "instagram",      // tiktok|instagram|any
  "proof_type": "screenshot",
  "xp_reward": 200,
  "ep_reward": 50,
  "sales_target": null,         // int for sales_milestone
  "progress": { "current": 0, "target": 1 },
  "max_completions": 1,
  "completed_count": 0,
  "event": { "id": "...", "name": "...", "slug": "...", "cover_image_url": "..." } | null,
  "promoter": { "id": "...", "handle": "...", "display_name": "...", "accent_hex": ... } | null,
  "cover_image_url": "...",
  "accent_hex": 12077567,
  "accent_hex_secondary": null,
  "starts_at": "...",
  "expires_at": "...",
  "accepted": false,
  "my_submissions": {
    "total": 0,
    "approved": 0,
    "pending": 0,
    "rejected": 0,
    "latest": {
      "id": "...",
      "status": "pending",
      "submitted_at": "...",
      "rejection_reason": null,
      "requires_revision": false
    } | null
  }
}
```

**Submit request (multipart or JSON):**

JSON body with pre-uploaded media URL:
```json
{
  "proof_type": "screenshot",
  "proof_url": "https://storage.../rep-proof/abc.jpg",
  "proof_text": null
}
```

Or for link/text types:
```json
{ "proof_type": "instagram_link", "proof_url": "https://instagram.com/p/..." }
```

Screenshot upload goes through the signed-URL flow first (see §8).

### 6.6 Rewards / EP shop

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/rep-portal/rewards?kind=shop&promoter_id=&event_id=` | rep | Listing (milestones + shop). |
| GET | `/api/rep-portal/rewards/[id]` | rep | Detail. |
| POST | `/api/rep-portal/rewards/[id]/claim` | rep | Redeem. Synchronous where possible. |
| GET | `/api/rep-portal/reward-claims` | rep | My claims history. |
| GET | `/api/rep-portal/reward-claims/[id]` | rep | Claim detail + fulfillment payload. |

**Reward shape (per iOS `Reward` model):**

```json
{
  "id": "uuid",
  "promoter_id": "uuid",
  "event_id": "uuid" | null,
  "name": "+1 VIP for Friday",
  "tagline": "...",
  "description": "...",
  "kind": "shop",              // 'milestone' | 'shop'
  "fulfillment_kind": "guest_list",
  "ep_cost": 120,
  "xp_cost": null,              // only for milestone rewards tied to XP threshold
  "milestone_threshold": null,
  "stock": 3,                   // null = unlimited
  "unlocked": true,             // for milestone: is rep's level above threshold
  "image_url": "https://...",
  "event_name": "FERAL vs. IWF",
  "my_claim_state": "available" | "claimed" | "fulfilled" | "out_of_stock"
}
```

**Claim response:**

```json
{
  "data": {
    "id": "claim_uuid",
    "status": "fulfilled",
    "fulfilled_at": "...",
    "fulfillment_payload": {
      "kind": "guest_list",
      "guest_name": "Sascha",
      "door_note": "VIP",
      "event_doors_open_at": "..."
    },
    "ep_balance_after": 120
  }
}
```

### 6.7 Social graph

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/rep-portal/reps/[rep_id]/follow` | rep | Follow another rep. |
| DELETE | `/api/rep-portal/reps/[rep_id]/follow` | rep | Unfollow. |
| GET | `/api/rep-portal/reps/[rep_id]` | rep | Public rep profile (lightweight). |
| GET | `/api/rep-portal/me/following/reps` | rep | Reps I follow. |
| GET | `/api/rep-portal/me/followers/reps` | rep | Reps following me. |
| GET | `/api/rep-portal/me/friends` | rep | Mutual follows (computed). |
| GET | `/api/rep-portal/me/following/promoters` | rep | Promoters I follow. |
| GET | `/api/rep-portal/peer-activity?limit=&promoter_id=` | rep | Ticker feed. |

`FriendRep` / `PeerActivity` shapes per iOS models.

### 6.8 Feed (drops)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/rep-portal/feed?limit=&offset=&promoter_id=` | rep | Unified feed of poster drops from followed promoters + public event drops. Paginated. |
| GET | `/api/promoters/[handle]/drops` | public | All drops from a promoter (public). |

### 6.9 Leaderboards

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/rep-portal/leaderboard?promoter_id=&event_id=&sort=&window=&limit=` | rep | Top N + rep's position. Default `window=30d` (rolling 30 days — activity prior to that is excluded from the rank calculation). `window=all` returns lifetime rank. Response includes `delta_week` computed from `rep_rank_snapshots`. |

**Rank computation:** Aggregated over `rep_points_log` entries in the window, ordered DESC by XP earned (default) or sales attributed (if `sort=sales`). Event-scoped leaderboards (`event_id=...`) are always lifetime-for-that-event — the 30-day window only applies to lifetime/promoter-wide rank.

### 6.10 Devices / push

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/rep-portal/devices` | rep | Register device. Body `{ platform, token, app_version?, os_version?, device_model? }`. Upsert on `(rep_id, token)`. |
| DELETE | `/api/rep-portal/devices/[token]` | rep | Unregister. |
| PATCH | `/api/rep-portal/me/push-preferences` | rep | `{ push_enabled, quiet_hours_start?, quiet_hours_end? }`. |

### 6.11 Media / uploads

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/rep-portal/uploads/signed-url` | rep | Body `{ kind: 'avatar'\|'banner'\|'quest_proof', content_type, size_bytes }`. Returns `{ upload_url, public_url, key, expires_at }`. |
| POST | `/api/rep-portal/uploads/complete` | rep | Body `{ key }`. Confirms + moves to permanent storage. Returns `{ public_url }`. |

### 6.12 Admin (new surfaces)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET / PATCH | `/api/admin/promoter` | admin | Tenant's own promoter profile. |
| GET | `/api/admin/team/requests?status=` | admin | Join requests to review. |
| PATCH | `/api/admin/team/requests/[id]` | admin | Approve / reject membership. |
| GET / POST | `/api/admin/poster-drops` | admin | Authoring. |
| PATCH / DELETE | `/api/admin/poster-drops/[id]` | admin | Edit/remove. |
| POST | `/api/admin/ep/purchase-intent` | admin | Create Stripe PaymentIntent for tenant to buy EP. Body `{ ep_amount }`. |
| GET | `/api/admin/ep/balance` | admin | Tenant's EP float + earned-unpaid balance. |
| GET | `/api/admin/ep/ledger?cursor=` | admin | Paginated ledger view. |
| GET | `/api/admin/ep/payouts` | admin | Historical payouts. |
| GET / POST | `/api/admin/rewards` | admin | CRUD shop items. (Extends existing.) |

### 6.13 Platform-owner surfaces

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/platform/ep/global-ledger` | platform | Cross-tenant ledger view. |
| PATCH | `/api/platform/ep/config` | platform | EP-to-fiat rate, platform cut %, min payout. |
| GET / POST | `/api/platform/quests` | platform | Platform-level quests (Entry-authored). |

### 6.14 Webhooks (inbound)

| Path | Purpose |
|------|---------|
| `/api/stripe/webhook` | Existing. Extends to handle `payment_intent.succeeded` with `metadata.type === 'ep_purchase'` (writes ledger) and Stripe Transfer events for tenant payouts. |

---

## 7. EP economy — deep dive

### 7.1 Money flow

```
Tenant (FERAL) ── buys 10,000 EP for £100 ──> Entry (platform)
                                                │
                                   ep_ledger: tenant_purchase +10,000 (fiat 1p)
                                                │
Tenant publishes quest "Post a story: +200 EP"
                                                │
Rep completes quest, admin approves
                                                │
                                   ep_ledger: tenant_quest_debit  -200 from FERAL float
                                   ep_ledger: rep_quest_credit   +200 to rep balance
                                                │
Rep redeems "drink token" at 200 EP
                                                │
                                   ep_ledger: rep_shop_debit     -200 from rep balance
                                                                  +200 to FERAL "earned unpaid"
                                                │
End of month — cron runs payout
                                                │
                                   ep_ledger: tenant_payout      -200 from earned
                                                 Stripe Transfer to FERAL: (200 × £0.01) − 10% = £1.80
```

### 7.2 Tenant UX (admin dashboard)

New `/admin/ep/` page, four subpages:

1. **Float** — current EP balance, recent entries, "Buy EP" CTA (opens Stripe Checkout).
2. **Earned** — EP redeemed by reps in this tenant's shop, breakdown by reward, pending next payout.
3. **Ledger** — full paginated view, filterable by entry type.
4. **Payouts** — historical Stripe Transfers, amount, status, transfer ID.

Shop builder lives at `/admin/rep-rewards/` (existing) — extend with `ep_cost`, `stock`, `fulfillment_kind`.

### 7.3 Invariants

1. Ledger is append-only. Never UPDATE, never DELETE. Corrections use `reversal` entries referencing the prior row.
2. Balance views sum the ledger. `reps.ep_balance` (and its XP sibling) are denormalised caches updated by trigger — never edited directly.
3. Every customer-facing EP value is always in integer EP units. Fiat display is computed at render time from `platform_ep_config.fiat_rate_pence` snapshotted into ledger entries.
4. Tenant can't publish a quest with `ep_reward > 0` if they lack float to cover it times quest max-completions (soft warning) or without any float at all (hard block). Actual debit happens on approval.
5. Claiming a shop reward with insufficient rep balance returns `error.code = "insufficient_ep"`. Claims run in a transaction — concurrent claims on limited stock use `FOR UPDATE` row lock on the `rep_rewards` row.

### 7.4 Edge cases

- **Refund a quest approval.** Admin PATCHes submission back to `rejected`. Ledger writes reversal entries in both directions (tenant float restored, rep balance reduced). If rep already spent the EP, reversal is partial — tenant float gets whatever's unspent; rejection can't claw back already-redeemed value.
- **Tenant's float goes negative via bulk retroactive approvals.** Block approval server-side if it would take float negative. Surface to admin with "top up EP first."
- **Rep closes account with unspent EP.** Balance zeroes out via a reversal entry. Does NOT return to tenants — it's already been spent (tenant float was debited at approval). Sits as permanent platform liability reduction. Logged for reconciliation audit.
- **Tenant wants to refund unspent float before 90-day window.** Tenants initiate from `/admin/ep/` — refund issued via Stripe Refund on the original PaymentIntent, FIFO against oldest unspent purchases. Ledger writes `tenant_refund` reversal entries.
- **Concurrent redemption of last-stock shop item.** `rep_rewards` row is locked `FOR UPDATE` inside the claim transaction; second claimant gets `out_of_stock` error before ledger writes happen.
- **Stripe Transfer to tenant fails.** Payout row marked `failed`, ledger reversal on `tenant_payout` entry, amount rolls into next month's payout. Platform-owner alert fires.

### 7.5 Worked examples — does the economy hold?

Five scenarios at different scales. Every rate = 1 EP = £0.01, platform cut = 10%.

**Scenario A — small underground promoter (FERAL today)**

| Step | Action | Tenant cash | Rep EP | Tenant float | Entry pocket |
|------|--------|-------------|--------|-------------|--------------|
| 1 | Tenant buys 10,000 EP | −£100 | 0 | +10,000 | +£100 liability |
| 2 | Rep submits IG-story quest → approved (200 EP reward) | — | +200 | −200 | — |
| 3 | Rep redeems 200 EP for drink token in shop | — | −200 | — | — |
| 4 | Tenant fulfils at venue: drink costs ~£2 product | £0 cash (£2 product cost) | — | — | — |
| 5 | Monthly payout: 200 EP × 1p × 90% | +£1.80 Stripe Transfer | — | — | −£1.80 liability, +£0.20 revenue |

**Tenant economics after one cycle:** £100 prepaid, £1.80 back, £2 drink cost. Float remaining: 9,800 EP (worth £98 of future redemption value). **Marginal cost of this one quest-plus-redemption cycle: £2.20 for a real IG post that reached the rep's network.** Below any micro-influencer rate.

**Entry:** £0.20 realised revenue this cycle. The other £98.20 sits as liability on the books until the tenant's remaining float is awarded and spent.

**Rep:** Earned a tangible drink at a party they were going to anyway. Balance felt real — went up, came down for something physical.

---

**Scenario B — mid-sized promoter (100 reps, monthly events)**

- Tenant buys **500,000 EP for £5,000** — a proper campaign budget
- Month runs: 200 quest completions at 200 EP each = 40,000 EP awarded → float drops to 460,000
- Reps redeem ~60% of awarded EP = 24,000 EP spent in shop
- Redemption mix: 60% guest-list (£0 marginal), 30% drink tokens (£2 cost each), 10% free tickets (£0 marginal digital)
- Payout to tenant: 24,000 × 1p × 90% = **£216 Stripe Transfer**
- Tenant fulfilment cost: 36 drinks × £2 = £72
- **Tenant monthly net:** £5,000 prepay (one-time) − £216 received − £72 drinks = £4,856 that month, BUT 460,000 EP still sits as future float worth £4,140 of future redemption value
- Adjusted cost of the month's activity: £72 drinks + £24 platform fees + (16,000 EP × 1p = £160 unredeemed awarded value held against tenant's books) = ~£256 real cost
- Per quest: £1.28 average. Per rep: £2.56 per month. **Way below market.**

**Entry:** £24 realised revenue that month; £4,600 float liability continues. The revenue catches up as the float depletes.

---

**Scenario C — tenant experiments, refunds within 90 days**

- Tenant buys 5,000 EP for £50
- Publishes one quest, reps submit, tenant doesn't love the fit, approves none
- Day 60 — tenant cancels: refund eligible
- Entry refunds £50 via Stripe (original PaymentIntent)
- Ledger records `tenant_refund` reversal entries

**No one is harmed.** Tenant experimented without commitment. Low-stakes on-ramp.

---

**Scenario D — tenant holds float past 90 days**

- Tenant buys 5,000 EP for £50, doesn't use, returns at day 120 — refund window closed
- Float sits on platform books as liability until used
- Tenant can still spend it — EP doesn't expire for tenants either, just isn't cashable

**Platform exposure:** cash held, still owed against future redemption. Normal SaaS-credit treatment.

---

**Scenario E — reps earn, never redeem (breakage)**

- Tenant awards 20,000 EP to 100 reps over a year (200 EP each, via approved quests)
- Tenant float has been debited 20,000 EP → tenant effectively paid £200 upfront into the platform for those credits
- Over 12 months, 80% of reps redeem → 16,000 EP spent
- Tenant gets back: 16,000 × 1p × 90% = £144 in payouts
- Dormant balance: 4,000 EP (£40) sits on inactive rep accounts
- **Platform holds £40 as ongoing liability.** This is real revenue potential (gift-card breakage), but the spec does not auto-recognise it. Accounting policy can claim it after N years.

**Economic truth:** The tenant already got their quest value (the rep did the IG post). If the rep never redeems, the tenant has effectively over-paid by that amount — but they don't notice, and the platform holds the corresponding cash. Everyone is honest, no one is robbed.

---

**Cross-check on Entry's business model:** EP platform fees are supplementary revenue. The primary revenue line is still the 3.5% + 30p per ticket sale on the main Entry platform. EP exists to make the rep program a real product (which drives more ticket sales, which drives ticket fee revenue). Low EP platform fees are a feature, not a bug — they keep the incentive economy frictionless so the ticket-selling flywheel turns faster.

### 7.6 VAT / accounting treatment

Detail per Decision K. **Read before first real-money transaction.**

**EP classification:** Multi-purpose voucher (MPV) under UK VAT Schedule 10A. A voucher where the goods/services it can be redeemed for are not specified at issuance (a rep might redeem EP for a ticket, a drink, merch, or a guest-list spot — different VAT categories).

**Consequence 1 — no VAT on the EP purchase.** When a tenant buys 1000 EP for £100, no VAT is added. The purchase is a prepayment, not a supply of goods. Ledger records £100 received.

**Consequence 2 — VAT applies at the redemption point.** When a rep redeems EP for a specific item (say, a £6 drink token), the tenant's supply-to-rep is subject to VAT at the appropriate rate for that item. The tenant accounts for this on their own VAT return — same as any other sale they'd make.

**Consequence 3 — Entry's platform fee is a service supply.** The 10% cut that Entry keeps on redemption is treated as a commission for marketplace services. Subject to standard 20% UK VAT on B2B services. Entry issues the tenant a monthly invoice detailing: EP redeemed, fiat equivalent, platform fee, VAT on fee. Tenant can reclaim the VAT on the fee (they're VAT-registered).

**Consequence 4 — Stripe Transfer amount is net of Entry's cut.** Transfer = (EP redeemed × fiat rate × 0.9). Tenant receives the 90% side via Stripe. Entry's 10% stays on the platform Stripe account. Invoice for the fee + VAT goes out separately (could be automated via Stripe Invoicing in a later phase).

**Practical tenant-facing UX:**
- Monthly PDF statement downloadable from `/admin/ep/payouts`
- Shows: opening float, EP purchased, EP awarded, EP spent at shop, redemption value, platform fee, VAT on fee, net transfer, closing float
- Matches what their accountant needs to file

**For Entry (platform accounting):**
- EP purchases land as deferred revenue / liability on the balance sheet, NOT as revenue
- Revenue recognised at redemption, equal to the platform cut on that redemption
- Unredeemed EP sits on the balance sheet indefinitely (breakage policy can claim as revenue after N years — set later, defer decision)

**What needs an accountant before live launch (but not before build):**
1. Confirm MPV treatment vs SPV (single-purpose voucher) for UK VAT
2. Confirm platform cut is VAT-standard-rated (not zero-rated or exempt)
3. Confirm cross-border behaviour — tenants in EU/US buying EP
4. Set breakage policy (what age of stale EP, if any, becomes revenue)

None of those block Phase 0–2. Phase 3 (where EP purchases start) needs the first two confirmed, which is a 30-minute accountant conversation.

### 7.7 Platform config table

```sql
CREATE TABLE platform_ep_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton
  fiat_rate_pence INT NOT NULL DEFAULT 1,        -- 1 EP = 1p (launch calibration)
  platform_cut_bps INT NOT NULL DEFAULT 1000,    -- basis points: 1000 = 10%
  min_payout_pence INT NOT NULL DEFAULT 5000,    -- £50
  refund_window_days INT NOT NULL DEFAULT 90,
  default_bonus_ep_per_quest INT NOT NULL DEFAULT 0,  -- Decision Q placeholder; 0 = off
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
INSERT INTO platform_ep_config (id) VALUES (1);
```

Only editable via `PATCH /api/platform/ep/config` (platform-owner auth). Rate changes are forward-only — historic ledger entries snapshot the rate that applied at the time. UI forces confirmation with a preview of affected balances.

---

## 8. Image pipeline

### 8.1 Who uploads what

| Asset | Uploader | Destination | Example size |
|-------|----------|-------------|--------------|
| Promoter avatar, cover | Tenant admin | Supabase Storage `promoter-media/` | 2MB max |
| Event cover / poster / banner | Tenant admin | Supabase Storage `event-media/` | 5MB each |
| Quest cover | Tenant admin | Supabase Storage `quest-media/` | 2MB |
| Shop item image | Tenant admin | Supabase Storage `reward-media/` | 2MB |
| Rep avatar | Rep (iOS/web) | Supabase Storage `rep-avatars/` | 2MB |
| Rep banner | Rep (iOS/web) | Supabase Storage `rep-banners/` | 3MB |
| Quest proof screenshot | Rep (iOS/web) | Supabase Storage `quest-proofs/` | 8MB |
| Tenant logo (branding) | Tenant admin | **Stays in `site_settings`** (legacy, small, rarely changes) | 500KB |

### 8.2 Signed upload flow

1. Client: `POST /api/rep-portal/uploads/signed-url` with `{ kind, content_type, size_bytes }`.
2. Server: validates kind/size, generates a UUID key, calls Supabase Storage `createSignedUploadUrl`, returns `{ upload_url, public_url, key, expires_at }`.
3. Client: uploads bytes directly to `upload_url` via `PUT`.
4. Client: `POST /api/rep-portal/uploads/complete` with `{ key }`. Server verifies object exists + within size limits, optionally runs image processing (thumbnail generation, strip EXIF, compress), writes permanent `public_url`.
5. Client: uses `public_url` in subsequent request (e.g. `PATCH /me { photo_url }`, `POST /quests/.../submissions { proof_url }`).

Signed upload URLs expire in 10 minutes. Quest proof uploads write to a quarantine path; on submission the server moves the object to the permanent path.

### 8.3 Content-type allowlist

`image/jpeg`, `image/png`, `image/webp`, `image/heic` (iOS native). No SVG for rep-uploaded media (XSS vector).

### 8.4 CDN

Supabase Storage public URLs front a CDN. Add `Cache-Control: public, max-age=31536000, immutable` on the upload record. URL is content-addressable (key contains UUID), so immutable is safe.

---

## 9. Push — cross-platform

### 9.1 Fanout architecture

`lib/rep-notifications.ts` `createNotification(params)` writes one `rep_notifications` row, then fans out:

```
For each device_tokens row of this rep where push_enabled = true:
  - platform='ios'     → APNs (node-apn / HTTP/2 to api.push.apple.com)
  - platform='android' → FCM (firebase-admin sendToDevice)
  - platform='web'     → web-push (existing VAPID flow)
```

All three transports build the same notification payload from a single source, adjusted to each platform's envelope:

**Payload source of truth:**

```typescript
type NotificationPayload = {
  type: 'sale_attributed' | 'quest_approved' | /* ... */,
  title: string,
  body: string,
  deep_link: string,             // 'entry://quest/q_abc' | 'https://entry.events/...'
  data: Record<string, string>   // type-specific extras (rep_id, quest_id, event_id, etc.)
}
```

**APNs envelope:**
```json
{
  "aps": {
    "alert": { "title": "...", "body": "..." },
    "sound": "default",
    "badge": 1,
    "mutable-content": 1
  },
  "type": "quest_approved",
  "deep_link": "entry://quest/q_abc",
  "data": { "quest_id": "q_abc" }
}
```

**FCM envelope:** `data`-only message with the same shape; Android client renders notification locally (allows consistent tenant-theming in notification UI).

**Web envelope:** Existing VAPID payload shape.

### 9.2 Rules (from persona doc)

- Positive events push immediately. Negative events (rank drops, rejections) never push — surface on next app open.
- Max 1 push / hour / rep by default. Configurable via `me.push_enabled` + optional quiet hours.
- First-sale-for-event uses distinct `type` so iOS can apply elevated treatment.
- Payloads must carry display-ready copy — iOS should be able to show the push without opening the app.

### 9.3 Sentry + delivery logging

Every push attempt writes to `notification_deliveries` table:

```sql
CREATE TABLE notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES rep_notifications(id),
  device_token_id UUID NOT NULL REFERENCES device_tokens(id),
  platform TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent','failed','invalid_token')),
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

APNs "BadDeviceToken" or FCM unregistered error → mark device row `push_enabled = false` and log. Next login creates a fresh token.

### 9.4 APNs setup

- P8 auth key (not cert). Stored as env var `APNS_AUTH_KEY_P8` (PEM), plus `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`.
- Dev vs prod topic: `APNS_USE_SANDBOX` env var.
- HTTP/2 client: `node-apn` or vanilla `undici` (Next.js server runtime supports it).

### 9.5 FCM setup

- Service account JSON stored as `FCM_SERVICE_ACCOUNT_JSON` env var.
- `firebase-admin` SDK.

---

## 10. Admin UI additions

New pages in `/admin/`:

| Path | Purpose | Rough scope |
|------|---------|-------------|
| `/admin/promoter/` | Public promoter profile editor. Handle, display name, tagline, bio, accent color, avatar, cover, social links. | ~1 page, all fields + upload widgets. |
| `/admin/team/requests/` | Inbox of pending join requests. Approve/reject with optional reason. Bulk actions. | Table, filter by status, detail drawer. |
| `/admin/ep/` | 4 subtabs: Float, Earned, Ledger, Payouts. Float tab shows a prominent low-float banner when remaining float is below projected obligations (sum of `ep_reward × (max_completions − total_completed)` across active quests). Banner CTA: "Top up EP." Quest editor also surfaces a warning on publish if `ep_reward × max_completions > current_float`, with options "Publish anyway" (soft warning) or "Top up first." On approval, if float would go negative, approval is hard-blocked with a clear error. | Tables + "Buy EP" Stripe flow + low-float state UI. |
| `/admin/poster-drops/` | Compose + schedule + publish drops. Preview. | List + composer sheet. Deferred to Phase 4+. |
| Event editor | Existing page — add two new image slots (poster, banner) alongside existing cover. Add `ep_reward_max` display. | Extend existing form. |
| Quest editor | Existing page — add `subtitle`, `instructions`, `platform`, `proof_type`, `cover_image`, `accent_hex`, `ep_reward`, `auto_approve`, `sales_target`. | Extend existing form. |
| Reward editor | Existing — rename `product` → `shop`, expose `ep_cost`, `stock`, `fulfillment_kind`. | Extend existing form. |

Pattern for new pages: follow existing `/admin/*` conventions — shadcn/ui, Tailwind, admin design tokens.

---

## 11. Migration from current state

The rep platform is pre-launch — the `/rep/*` web portal has no external users (6 test reps in 1 org, internal-only). Migrations can be **direct** with no dual-write / coexistence overhead. The existing rep-related code in `src/app/rep/*` is treated as throw-away scaffolding; changes there won't break any real user.

| Change | Approach |
|--------|----------|
| `reps.org_id NOT NULL` → nullable | Direct migration. Backfill `rep_promoter_memberships` from existing `org_id` (one approved membership per rep), then drop `reps.org_id` entirely in a later phase once all code paths read memberships. |
| `{org_id}_rep_settings.currency_name` | Deprecated and ignored by new clients. Key stays in `site_settings` (harmless) but has no effect on any UI or API response the rebuilt stack reads. Delete when the legacy web rep portal is removed. |
| `rep_push_subscriptions` | Merged into unified `device_tokens` (§5.6) with `platform='web'`. No backwards-compat fanout required. |
| Quest `points_reward` → `xp_reward` | Rename directly. Update any admin pages that write the field. No dual-write. |
| Event `cover_image` → `cover_image_url` + `poster_image_url` + `banner_image_url` | Backfill `cover_image_url` from existing `cover_image` data. Keep `cover_image` on the table for the main event-page / ticket flow (which IS live and critical). Admin editor gains dedicated poster + banner slots. |
| `rep_rewards.reward_type='product'` | Rename enum value to `'shop'` in a single migration that also updates any existing rows. |
| Legacy `/rep/*` web pages | Frozen immediately. No new work. Deleted (not deprecated-but-still-served) once web-v2 is planned — likely alongside Phase 6 or later. |

**What IS live and must not break:** the main Entry platform — event pages, checkout, admin dashboard, scanner PWA, merch store, guest list, waitlist. Those have real tenants and real traffic. Migrations that touch shared tables (e.g. `events`, `orders`) keep the existing columns writable to preserve the ticket-sales flow. Only rep-scoped tables (`reps`, `rep_quests`, `rep_rewards`, `rep_*`) get destructive changes.

**Testing burden:** light. 6 test rep rows is cheap to wipe and re-seed if a migration needs to be re-run. Each Phase ships with integration tests against the new schema, but there's no "preserve prod user sessions" concern.

---

## 12. Build phases

Each phase ends with: migrations applied, endpoints live, admin UI shipped, unit tests, integration tests for money paths, types regenerated, iOS verified against real endpoints (not mocks).

### Phase 0 — Foundation (4–5 days)

- **0.1** Commit the existing `mobile-login` route and add tests.
- **0.2** Ship `mobile-refresh`.
- **0.3** Create `promoters` table, data-migrate from orgs.
- **0.4** Create `rep_promoter_memberships`, data-migrate existing rep↔org.
- **0.5** Create `rep_promoter_follows`, `rep_follows`, `device_tokens`.
- **0.6** Ship `GET/PATCH /api/admin/promoter/` page.

*(Apple Sign-In deferred — see Decision L.)*

**Done when:** iOS can log in, server knows about promoters + memberships, admin can edit promoter profile.

### Phase 1 — Dashboard parity (1 week)

- **1.1** Extend `events` table with three image columns + admin UI slots.
- **1.2** Rewrite `GET /api/rep-portal/dashboard` to return the full shape in §6.3 (with `followed_promoters: []`, `feed: []`, `story_rail: []` empty but present — unblocks iOS).
- **1.3** `GET /api/rep-portal/me/memberships`, `/me/balances`, `/me/following/promoters`.
- **1.4** `GET /api/promoters/discover`, `/api/promoters/[handle]`.
- **1.5** Follow/unfollow endpoints.

**Done when:** iOS home screen populates entirely from backend. No mock fallbacks.

### Phase 2 — Quests full loop (1 week)

- **2.1** Extend `rep_quests` + `rep_quest_submissions` per §5.8/5.9.
- **2.2** Rewrite `/api/rep-portal/quests` response to match §6.5.
- **2.3** `POST /quests/[id]/accept` + `rep_quest_acceptances` table.
- **2.4** Signed-upload flow (`/uploads/signed-url` + `/uploads/complete`) against Supabase Storage.
- **2.5** Extend quest admin editor with new fields.
- **2.6** Admin approve/reject already exists — add `requires_revision` state.

**Done when:** rep can accept, submit proof (screenshot upload), admin can approve/reject, state reflects in iOS next fetch.

### Phase 3 — EP economy (2 weeks, biggest phase)

- **3.1** Create `ep_ledger`, `ep_tenant_purchases`, `ep_tenant_payouts` tables + views.
- **3.2** Rename `rep_rewards.currency_cost` → `ep_cost`; enum migration `product` → `shop`; add `stock`, `fulfillment_kind`.
- **3.3** Ledger triggers to maintain `reps.ep_balance` cache.
- **3.4** `POST /api/admin/ep/purchase-intent` → Stripe PaymentIntent (platform account).
- **3.5** Stripe webhook handler for EP purchase + Transfer events.
- **3.6** Quest approval flow writes ledger entries (debits tenant float, credits rep balance).
- **3.7** Reward claim flow writes ledger entries (synchronous fulfillment for `digital_ticket` + `guest_list` kinds).
- **3.8** Monthly payout cron (`/api/cron/ep-payouts`).
- **3.9** `/admin/ep/` page — 4 subtabs.
- **3.10** Reward editor extended with `ep_cost`, `stock`, `fulfillment_kind`.
- **3.11** Integration tests: full money paths (purchase → quest → claim → payout reversals).

**Done when:** A tenant can buy EP, attach EP to a quest, see it deducted on approval, ship a reward, see the earned balance, receive a Stripe Transfer at month-end. Every movement traceable in the ledger.

### Phase 4 — Push + feed + peer activity (1 week)

- **4.1** `device_tokens` endpoints.
- **4.2** APNs integration + env setup.
- **4.3** FCM integration + env setup (ready for Android).
- **4.4** Unified fanout in `createNotification()`.
- **4.5** `notification_deliveries` logging.
- **4.6** New notification types (10 total per §5.15).
- ~~**4.7** `poster_drops` table.~~ **PAUSED — see §5.10**
- ~~**4.8** Auto-generate `event_reveal` drop on event publish.~~ **PAUSED**
- **4.9** `GET /api/rep-portal/feed` (peer activity only; drops-union reinstates when poster drops unpause).
- **4.10** `GET /api/rep-portal/peer-activity`.
- **4.11** `GET /api/rep-portal/me/friends`.

**Done when:** iOS receives APNs push within 4 seconds of sale/approval/level-up; home feed populated with real event drops and peer activity.

### Phase 5 — Polish + long-tail (3–4 days, was 1 week)

- **5.1** `rep_rank_snapshots` + weekly cron + rolling-30-day leaderboard + `delta_week`.
- **5.2** `rep_streaks` + daily activity marker + midnight reset cron.
- ~~**5.3** Poster drop authoring UI (`/admin/poster-drops/`).~~ **PAUSED — see §5.10**
- **5.4** `xpToday` computation on dashboard.
- **5.5** Account deletion endpoint (App Store requirement).
- **5.6** Email verification flow.

**Done when:** every field the iOS `DashboardMapper` reads comes from real backend, no mocks remaining.

*(rep_seasons work cut — see §5.12.)*

### Total estimate: 5½–6½ weeks of focused backend work

Assumes no parallel web-v2 work. Assumes product decisions (§3) are locked before Phase 0.

---

## 13. Done criteria for "fully functional"

1. Every endpoint in §6 ships with: happy-path test, auth-failure test, validation-failure test, and (for money paths) integration test against real Supabase.
2. `npm test` + `npm run test:integration` both green on every commit touching this work.
3. TypeScript types regenerated from Supabase after each migration.
4. CLAUDE.md updated with every new table, route, lib helper.
5. iOS session can flip `AppConfig.useMockSession = false` and the app works end-to-end.
6. No Sentry unresolved issues on new endpoints.
7. EP ledger passes a reconciliation check: sum of all credits − debits for each party = cached balance, exactly, zero drift.
8. Admin UIs for new surfaces functional on mobile (375px) — tenants use these on phones.
9. Web-v1 rep portal still works unchanged throughout.

---

## 14. Changelog

- **2026-04-22 v2.0 — SHIPPED.** All 5 phases complete across ~36 feature commits and 27 migrations. Session totals: 465 unit tests + 6 EP integration tests (all green). Real-DB reconciliation proves zero `ep_rep_balance_drift` after every state change in the money-path tests.

  What landed across the session:
  - **Phase 0** — `mobile-login` + `mobile-refresh`, promoters table (1:1 with orgs, seeded from branding), `rep_promoter_memberships` + backfill, `rep_promoter_follows`, `rep_follows`, `device_tokens`, `/admin/promoter/` editor page.
  - **Phase 1** — Events `cover_image_url` / `poster_image_url` / `banner_image_url`, dashboard rewrite to §6.3 shape, `/me/memberships` + `/me/balances` + `/me/following/promoters`, `/api/promoters/discover` + `/api/promoters/[handle]` (public, auth-aware), follow/unfollow + join-request endpoints.
  - **Phase 2** — `rep_quests` schema extensions (promoter_id, subtitle, proof_type, cover_image_url, accent_hex/accent_hex_secondary, sales_target, xp_reward, ep_reward, auto_approve), quests list to §6.5 shape, `/quests/[id]/accept`, signed-URL upload flow (`uploads/signed-url` + `uploads/complete`, `rep-media` bucket), admin quest API accepts new fields, `requires_revision` state + typed notifications.
  - **Phase 3** — EP economy end-to-end. `platform_ep_config`, `ep_ledger` (append-only, trigger-enforced), `ep_tenant_purchases`, `ep_tenant_payouts`, balance views, cache sync trigger, `award_quest_ep` + `reverse_quest_ep` + `claim_reward_atomic` + `cancel_claim_and_refund` + `plan/create/complete/fail_tenant_payout` RPCs, Stripe PI purchase flow, Stripe Transfer payout cron, `/admin/ep/` page (4 subtabs), rewards schema overhaul (ep_cost / xp_threshold / stock / fulfillment_kind; `points_shop` → `shop`), full integration test suite.
  - **Phase 4** (minus paused drops) — device registration endpoints, `/me/push-preferences`, unified push fanout (`lib/push/`: APNs + FCM stubbed, web live), `notification_deliveries` log, `peer-activity`, `feed` (peer-only), `/me/friends`.
  - **Phase 5** — `rep_rank_snapshots` weekly cron + dashboard `delta_week`, `rep_streaks` with `mark_rep_active` on dashboard hit + nightly `reset_stale_streaks` cron, `DELETE /api/rep-portal/me` (App Store 5.1.1(v) compliant soft-delete preserving ledger FKs), email verification audit.

  Fixed during cleanup: `rep_rank_snapshots` table was referenced in Phase 5.1 but never actually created — backfilled with a fresh migration before Monday's cron fires. Pre-push hook also extended with `tsc --noEmit -p tsconfig.build.json` to catch the class of TS errors that previously slipped through `npm test` and blew up on Vercel.

  Legacy-freeze policy from v1.4 held: `/rep/*` web portal untouched, existing columns kept writable for backwards compat, `currency_name` ignored by new clients.

- **2026-04-22 v1.5** — poster drops paused. Concept (promoter-authored broadcasts into the feed) deferred — the product surface needs more thought before we build it. §5.10 re-marked as paused, Phase 4.7/4.8 crossed out, Phase 5.3 crossed out, Phase 4.9 feed endpoint scope reduced to peer activity only. Phases 0, 1, 2 now shipped. Phase 3 (EP economy) in progress.
- **2026-04-22 v1 draft** — initial write.
- **2026-04-22 v1.1** — all 12 open questions closed and locked per owner authorisation. Added decisions M (tenant refund window), N (breakage policy), O (flat EP pricing). Added §7.5 (worked economic examples across 5 scenarios), §7.6 (VAT treatment — EP classified as MPV), §7.7 (`platform_ep_config` table). Economy stress-tested and confirmed sound at all promoter scales.
- **2026-04-22 v1.5** — poster drops paused. Concept (promoter-authored broadcasts into the feed) deferred — the product surface needs more thought before we build it. §5.10 re-marked as paused, Phase 4.7/4.8 crossed out, Phase 5.3 crossed out, Phase 4.9 feed endpoint scope reduced to peer activity only. Phases 0, 1, 2 now shipped. Phase 3 (EP economy) in progress.
- **2026-04-22 v1.4** — simplifications from owner confirming rep platform isn't live:
  - §11 rewritten — no dual-write / coexistence engineering needed. Migrations are direct. Legacy `/rep/*` pages frozen-then-deleted rather than preserved. Main Entry platform (event pages, checkout, scanner, merch, guest list) remains critical and untouched; rep-scoped tables get clean migrations.
  - Decision L (Apple Sign-In) deferred — not in v1. Revisited when Google SSO is added. Phase 0 dropped from 7 steps to 6, ~4–5 day estimate.
  - Status flipped to "Phase 0 in progress."
- **2026-04-22 v1.3** — `rep_seasons` cut from v1 per owner direction:
  - Table deleted. Decision J flipped to "cut from v1."
  - Leaderboard rank now rolling 30-day window (`?window=30d` default on `/leaderboard`). `rep_rank_snapshots` repurposed to capture rolling-30-day rank weekly for `delta_week`.
  - Dashboard `season` object removed; masthead kicker ("April 2026" / "This month") rendered client-side from device clock.
  - `/admin/seasons/` CRUD removed. Phase 5.1 work deleted. Total estimate shaved to 5½–6½ weeks.
  - Seasons parked for v2 as a platform-level Entry marketing concept (cross-tenant narrative), not per-tenant cadence.
- **2026-04-22 v1.2** — recalibration pass following iOS-session review and owner feedback:
  - **Fiat rate dropped from 1p × 10 to 1 EP = £0.01** (per owner calibration — £2 reward value per IG post is right, £20 was too rich). All worked examples and `platform_ep_config` default updated accordingly.
  - Added Decision P — XP-only quests (`ep_reward = 0`) are a first-class path that skip the ledger entirely; no tenant float needed. Spec §5.8 hardened with this.
  - Added Decision Q — platform-bonus EP capability (Entry sprinkles small EP on unfunded quests) reserved as a v1.1 flag, schema-ready, not wired v1.
  - Added fourth poster-drop kind `poster_reveal` (distinct from `event_reveal` — covers the artwork drop that often lands weeks after the event announcement).
  - Added masthead rule for reps on multiple teams: aggregate dashboard returns the soonest-ending active season, or null if none.
  - Hardened admin UI in §10 with low-float banner, quest-editor soft warning on publish, hard approval block at float = 0.
  - Confirmed all 6 product calls surfaced by iOS session (signup model, rate, cut, Apple SSO, seasons, poster kinds).
