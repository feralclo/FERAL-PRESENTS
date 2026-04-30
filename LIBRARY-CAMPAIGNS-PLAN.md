# Library Campaigns + Pool Quests — Implementation Plan

> **Goal:** ship a "campaign quest" type — tenants upload a bulk pool of images and videos to a named campaign, link a quest to that campaign, and reps see up to 10 always-fresh shareables that rotate as they're used. Bottom-line outcome: a tenant can run a 10-day Instagram-story push without authoring 30 quests, and reps always have something new to post.
> **Scope:** end-to-end. Schema + admin UX + rep-facing API + iOS DTO contract. iOS rendering work is out of scope for this repo (handed to the iOS team via the DTO doc).
> **Visual quality bar:** match `BrandPreview.tsx` and `FinishSection.tsx`. Apply `docs/admin-ux-design.md` to every admin surface.
> **Estimated calendar time:** ~3–5 working days for backend + admin UX. iOS team's screen build runs in parallel.
> **Source conversation:** 2026-04-30 (Harry × Claude). Vision: bulk asset upload per campaign (e.g. "Only Numbers — Spring 26"), shared across many quests, with a rotation algorithm that keeps the rep feed feeling fresh as new assets land.

---

## How to use this doc

- Each item has a status: `⬜` todo, `🟨` in progress, `✅` done, `⏸️` blocked, `🚫` cancelled.
- When picking work up, scan for `🟨` first (resume), then `⬜` in phase order.
- Update status inline as items complete. Add a one-line outcome note.
- Append to the **Decision log** at the bottom whenever a meaningful trade-off is made.
- Acceptance criteria are the bar. "I changed some code" is not done.

---

## North Star

> A tenant opens the Library, clicks **+ New campaign**, types "Only Numbers — Spring 26", drags 47 images and videos into the upload sheet, and within two minutes has a campaign live. They open a quest, flip the **Shareables** radio to *From a campaign*, pick "Only Numbers — Spring 26" from the dropdown, and save. From that moment on, every rep on their team sees a rotating 10-asset feed inside that quest. New uploads bubble to the top. Previously-used assets drop to the back. No tenant intervention needed for two weeks. Total elapsed time at upload: under three minutes. Zero documentation read.

---

## Three-noun mental model

The whole feature uses three plain-English nouns. No tags, no pools, no kinds, no shareables-vs-content terminology in user copy.

| Noun | What it is | Where it lives |
|---|---|---|
| **Library** | every image and video the tenant has uploaded | `/admin/library/` |
| **Campaign** | a named bundle inside the library (e.g. "Only Numbers — Spring 26") | left-rail row in `/admin/library/`, plus a row on each quest |
| **Quest** | a task for reps; can pull shareables from one campaign | `/admin/reps/` (existing) |

Internally we still use `tenant_media.tags[0]` as the campaign label and reuse the `quest_asset` `kind`. The UI never exposes those words.

---

## Architecture decisions (locked)

These are settled — don't relitigate without putting an entry in the Decision log first.

1. **Tag-based linkage, not a junction table.** A campaign is the set of `tenant_media` rows where `tags[0] = '<campaign-label>'` AND `kind = 'quest_asset'`. New uploads to that label automatically appear in every quest pulling that campaign. No quest→media junction.
2. **One campaign per quest, one campaign feeds many quests.** Tenants who want sub-pools create more campaigns. No per-quest asset pinning.
3. **Downloads tracked per (rep_id, media_id), not per quest.** If a rep uses asset X for the IG quest, they don't see it again on the TikTok quest pulling the same campaign. The new table is `rep_asset_downloads`.
4. **Server returns exactly 10 assets per request.** No pagination. Pull-to-refresh re-runs the sort and returns a fresh slice. The 10-cap is an iOS UX rule, enforced server-side as the source of truth.
5. **Rotation = a single SQL ordering, no scheduled jobs.** `ORDER BY (downloaded_by_me_at NULLS FIRST), tenant_media.created_at DESC LIMIT 10`. New uploads bubble; used items drop. Pool exhaustion gracefully falls into "your oldest-used first."
6. **Quest-level rewards only.** No per-asset XP/EP variance.
7. **Additive, not replacing.** The existing single-asset quest stays. The new mode is opt-in via `rep_quests.asset_mode = 'pool'`.

---

## Phase 0 — Schema + Foundations (target: 0.5 day)

### 0.1 Migration: extend tenant_media kind, rep_quests, new download table ✅
**Outcome (2026-04-30):** Applied as `library_campaigns_pool_quests` migration via Supabase MCP. tenant_media kind/kinds CHECK constraints rebuilt to include `quest_asset`. rep_quests gained `asset_mode` + `asset_campaign_tag` (default `'single'`/null). New `rep_asset_downloads` table with UNIQUE(rep_id, media_id), CASCADE refs, RLS on (self-read for authenticated, service-role bypass), three indexes for the rotation query.
**Goal:** every persistent shape this feature needs exists, with the right indexes, before any UI is touched.
**File:** `supabase/migrations/20260430_library_campaigns.sql`
**SQL (apply via Supabase MCP `apply_migration`, never give to user to run):**
```sql
-- 1. Allow `quest_asset` as a valid tenant_media kind.
ALTER TABLE tenant_media
  DROP CONSTRAINT IF EXISTS tenant_media_kind_check;
ALTER TABLE tenant_media
  ADD CONSTRAINT tenant_media_kind_check
  CHECK (kind IN ('quest_cover', 'quest_content', 'quest_asset',
                  'event_cover', 'reward_cover', 'generic'));
-- Multi-kind row's kinds[] array also accepts the new value (no constraint
-- there today; verify with a SELECT before relying on it).

-- 2. rep_quests gets the pool fields.
ALTER TABLE rep_quests
  ADD COLUMN asset_mode TEXT NOT NULL DEFAULT 'single'
    CHECK (asset_mode IN ('single', 'pool')),
  ADD COLUMN asset_campaign_tag TEXT NULL;

CREATE INDEX idx_rep_quests_asset_campaign_tag
  ON rep_quests (org_id, asset_campaign_tag)
  WHERE asset_mode = 'pool';

-- 3. Per-rep-per-asset download log. Append-only via app code; no triggers
--    needed because there's only one writer (the download API route).
CREATE TABLE rep_asset_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES tenant_media(id) ON DELETE CASCADE,
  quest_id UUID NULL REFERENCES rep_quests(id) ON DELETE SET NULL,
  org_id TEXT NOT NULL,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rep_id, media_id)
);

CREATE INDEX idx_rep_asset_downloads_rep_media
  ON rep_asset_downloads (rep_id, media_id);
CREATE INDEX idx_rep_asset_downloads_media_time
  ON rep_asset_downloads (media_id, downloaded_at DESC);
CREATE INDEX idx_rep_asset_downloads_org_time
  ON rep_asset_downloads (org_id, downloaded_at DESC);

-- 4. Tag lookup index for the campaign rotation query.
--    `tags @> ARRAY['campaign-label']` will use this.
CREATE INDEX IF NOT EXISTS idx_tenant_media_tags_gin
  ON tenant_media USING GIN (tags);
```
**Acceptance:**
- Migration applies cleanly; schema cache regenerates.
- `INSERT INTO tenant_media (kind, ...) VALUES ('quest_asset', ...)` succeeds.
- `INSERT INTO rep_quests (...) VALUES (..., 'pool', 'only-numbers-spring-26')` succeeds.
- Two `INSERT`s of the same `(rep_id, media_id)` into `rep_asset_downloads` — second raises 23505.
- `EXPLAIN ANALYZE SELECT * FROM tenant_media WHERE tags @> ARRAY['x'] AND kind='quest_asset'` shows index scan, not seq scan.

### 0.2 TypeScript types + constants ✅
**Outcome (2026-04-30):** `quest_asset` added to TENANT_MEDIA_KINDS in `lib/uploads/tenant-media-config.ts`. New `lib/library/campaign-tag.ts` with `slugifyCampaignLabel` (NFD + `\p{M}` strip, 80-char cap, hyphen-trim) and `isValidCampaignTag`. New `types/library-campaigns.ts` with shared DTOs for the admin UI + rep-facing API.
**Files:**
- `src/lib/uploads/tenant-media-config.ts` — add `quest_asset` to the `TenantMediaKind` union and the size cap config (videos up to 200 MB, images up to 12 MB — campaign uploads are pre-prepared, not phone snaps).
- `src/types/library-campaigns.ts` (new) — shared types for the rep-facing API + admin pages: `CampaignAssetDTO`, `CampaignSummary`, `QuestPoolMode`, etc.
- `src/lib/library/campaign-tag.ts` (new) — slugify helper: `"Only Numbers — Spring 26"` → `only-numbers-spring-26`. Stored as `tags[0]`. Display label kept in admin app state, never round-tripped through the slug.
**Acceptance:** `npm run tsc` passes. New types exported and consumed by the helpers in the next phase.

### 0.3 Pure-function rotation library + tests ✅
**Outcome (2026-04-30):** Split into a pure ranker (`rotateAssets`) and a Supabase-fetching shell (`getRotatedAssetsForRep`, `summariseCampaignAssets`, `recordAssetDownload`). 23 unit tests cover never-used / mixed / all-used buckets, stable ordering, idempotent download log, and slugify edge cases (diacritics, em-dashes, unicode, length cap). All passing in `npm test`.
**File:** `src/lib/library/asset-rotation.ts`
**Exports:**
- `getRotatedAssetsForRep({ orgId, repId, campaignTag, limit = 10 })` — runs the canonical SQL ordering, returns rich rows including `is_downloaded_by_me`, `my_last_used_at`, `download_count_total`.
- `summariseCampaignAssets({ orgId, campaignTag })` — `{ count, image_count, video_count, sample_thumb_urls: string[] }` for the quest editor preview.
- `recordAssetDownload({ orgId, repId, mediaId, questId })` — idempotent insert, returns `{ first_time: bool }` (so the API can decide whether to surface "back of queue" feedback).
**Tests** (`src/__tests__/lib-asset-rotation.test.ts`):
- `repA` has used 0/50 assets → first batch is 10 newest by `created_at DESC`.
- `repA` has used 8/50 assets → batch is 10 fresh; the 8 used never appear.
- `repA` has used all 50 → batch is the 10 they used longest ago, ordered by oldest download first.
- A new asset uploaded after `repA`'s last query bubbles to position 1 on the next call.
- `repB` viewing the same campaign sees a different ordering (independent histories).
- `recordAssetDownload` is idempotent: calling twice with same `(rep_id, media_id)` returns `first_time: false` the second time, no error.
**Acceptance:** all tests pass; pure functions return seeded data through a parametrised Supabase client (no live DB needed for unit tests; integration tests in Phase 6 hit real Supabase).

---

## Phase 1 — Library Workspace Upgrade (target: 1 day)

The library page becomes a campaign-first workspace. Two-column layout on desktop; chip strip on mobile.

### 1.1 Campaigns rail (desktop) + chip strip (mobile) ✅
**Outcome (2026-04-30):** Two-column shell at `LibraryShell.tsx` wraps the existing 1280-line `LibraryWorkspace` (kept intact for "All assets") behind a campaign rail. URL state via `?campaign=<slug>` so the canvas is shareable. New `CampaignRail` (desktop) + `CampaignChipStrip` (mobile) read from the new `/api/admin/media/campaigns` endpoint and surface counts per row.
**Goal:** campaigns become a first-class navigable surface alongside the all-assets view.
**Files:**
- `src/components/admin/library/CampaignRail.tsx` (new) — desktop left rail.
- `src/components/admin/library/CampaignChipStrip.tsx` (new) — mobile horizontal chip strip.
- `src/components/admin/library/LibraryWorkspace.tsx` — wrap the existing grid in a two-column layout; lift the active filter into a single `useReducer` (`{ scope: 'all' | { campaign: string }, kind: KindFilter, sort }`).
- `src/app/api/admin/media/campaigns/route.ts` (new) — `GET` returns `[{ tag, label, asset_count, image_count, video_count, linked_quest_count }, ...]` for the active tenant. Pulls from `tenant_media.tags[0]` distinct, joined with `rep_quests` count.
**Visual spec:**
- Rail uses `AdminPanel` (`rounded-xl`, `border-border/40`, `bg-card`). Width 248px desktop, full collapse on `< lg`.
- Eyebrow `CAMPAIGNS` (Space Mono 11/0.16em).
- Active row `bg-primary/[0.06] border-l-2 border-primary`. Inactive row hover `bg-foreground/[0.03]`.
- Each row two lines: campaign label (Inter 14/500), then `47 assets · 2 quests` (Inter 12/400, mono numerals via `tabular-nums`).
- "+ New campaign" pinned at the bottom, ghost-style, full-width, opens an `AdminDialog` with a single text input.
- Mobile chip strip: horizontal scroll, snap-to-chip, active chip `border-primary`. "+ New" inline at the end.
**Acceptance:**
- Tenant with 0 campaigns sees only "All assets" pinned + "+ New campaign". No empty rail.
- Clicking a campaign updates the URL (`?campaign=only-numbers-spring-26`) so the canvas state is shareable.
- Keyboard: `↑/↓` cycles rail rows, `Enter` activates. Focus ring uses `focus-visible:outline-primary/60`.
- `prefers-reduced-motion` honoured (no slide-in on switch).

### 1.2 Campaign canvas — the right pane ✅
**Outcome (2026-04-30):** `CampaignDetailView` orchestrates three blocks above the asset grid: stat row (`CampaignStatRow` w/ MicroSparkline), `CampaignLinkedQuests` (deep-links into the quest editor), `CampaignTopAssets` (collapsible top-5 by download count). Stats land via `GET /api/admin/media/campaigns/[tag]/stats` (single-fetch).
**Goal:** when a campaign is active, the canvas shows a rich detail surface (stats + linked quests + asset grid).
**Files:**
- `src/components/admin/library/CampaignCanvas.tsx` (new) — orchestrates the three blocks below the existing kind-filter row.
- `src/components/admin/library/CampaignStatRow.tsx` (new) — three `AdminCard` tiles using the design doc's `Numeric` typography (Space Mono 24/700) and `eyebrow` labels.
- `src/components/admin/library/CampaignLinkedQuests.tsx` (new) — list of `rep_quests` with `asset_campaign_tag = current`, each row click → `/admin/reps/quests/[id]/edit`.
- `src/components/admin/library/CampaignTopAssets.tsx` (new, optional collapsible) — top 5 most-downloaded tiles with download counts.
- `src/app/api/admin/media/campaigns/[tag]/stats/route.ts` (new) — `GET` returns `{ asset_count, image_count, video_count, linked_quests: [{id, title, status, cover_image_url, ...}], top_assets: [...], downloads_this_week: int, downloads_sparkline: int[] }`.
**Visual spec:**
- Stats: 3 `AdminCard` tiles in a `grid grid-cols-3 gap-4` (collapses to a single 3-pill row on mobile). Each shows eyebrow + numeric, no icon decoration — restraint per design doc.
- Linked quests: subtle row list (`border-b border-border/30 last:border-0`), 56px row height, hover `bg-foreground/[0.03]`, status badge on the right.
- Top assets: title row with chevron toggle (collapsed by default — hosts who care expand it).
**Acceptance:**
- Switching campaigns smoothly updates the canvas (single-fetch, optimistic load).
- "All assets" shows the existing grid with no campaign-specific blocks above (canvas is the unchanged shape).
- Empty linked-quests case shows a hint card: `"This campaign isn't linked to any quests yet. Reps won't see it."` with a `Create quest` link.

### 1.3 Campaign rename / delete / move-all ✅
**Outcome (2026-04-30):** `CampaignActions` owns rename + delete dialogs. PATCH rewrites every asset's `tags[0]` AND every linked `rep_quests.asset_campaign_tag` in one call. DELETE refuses with the linked-quest list when any quest still references the campaign; otherwise offers "move assets to All assets" (default) or "delete the assets too". Empty-campaign reservations live in `site_settings` so the rail can surface campaigns before the first upload.
**Goal:** lifecycle operations without leaving the rail.
**Files:**
- `src/components/admin/library/CampaignActions.tsx` — context menu (right-click desktop, long-press mobile) on each rail row.
- `src/app/api/admin/media/campaigns/[tag]/route.ts` (new) — `PATCH` (rename: rewrites `tags[0]` on every row in the campaign + updates `rep_quests.asset_campaign_tag` in a single transaction), `DELETE` (only if zero `rep_quests` reference it; otherwise 409 with the conflict list).
**Acceptance:**
- Renaming "Spring 26" → "Spring '26" updates every asset row + every linked quest atomically. No quest references a stale tag mid-rename.
- Deleting a campaign with 0 linked quests + 0 assets succeeds. With assets, it asks: "Delete X assets too, or move them to All assets?" Move = clear `tags[0]` (preserve other tags). Delete = soft-delete via `deleted_at`.
- Deleting a campaign with linked quests is blocked with copy: `"3 quests still pull from this campaign. Update them first."`

### 1.4 Empty states + skeletons ✅
**Outcome (2026-04-30):** `LibraryShellSkeleton` (rail + grid ghost rows) + `app/admin/library/loading.tsx` boundary so first paint never blocks. `LibraryEmptyHero` for the "zero campaigns AND zero assets" case (single CTA → New campaign dialog). Per-campaign empty state inside `CampaignAssetGrid` (icon + copy + Upload CTA pre-targeted to the active campaign).
**Goal:** ship loading + empty states at the same time as the populated state, per design doc Section 7 + 8.
**Files:**
- `src/components/admin/library/LibraryWorkspaceSkeleton.tsx` — full-page skeleton: rail with 4 ghost rows, canvas with stat row + 12 ghost tiles. No spinners.
- `src/app/admin/library/loading.tsx` (new) — Next.js loading boundary mounting the skeleton above.
**Empty cases (use `AdminEmptyState`):**
- Library has 0 campaigns AND 0 assets: full-page hero, copy `"No campaigns yet"` / `"Create your first campaign to start uploading shareables your reps can use."`, primary `New campaign`, secondary `Upload to "All assets"` (latter creates a default `general` campaign behind the scenes — never call it that in copy).
- Campaign has 0 assets: in-canvas empty state (smaller, `py-8`), primary `Upload`, secondary `Browse all assets`.
**Acceptance:**
- First paint shows skeleton, never a centred spinner.
- Mobile empty state stacks correctly at 375px, primary CTA is full-width.

---

## Phase 2 — Upload (target: 1 day)

The single most-visible polish surface. This is where the feature feels premium or doesn't.

### 2.1 Bulk upload sheet/dialog ✅
**Outcome (2026-04-30):** `BulkUploadSheet` + `useBulkUpload`-style internal queue. Three concerns surfaced inline: drop zone (drag/click) → campaign chooser (combobox or "+ New campaign") → live progress list. Mixed image + video acceptance, parallelism cap of 3, friendly error copy ("That video's a bit big — try under 200 MB"). Closing mid-upload doesn't cancel the queue.
**Goal:** a single `Upload` button drops in N files of mixed types, routes each through the right pipeline, lets the user keep working while videos process.
**Files:**
- `src/components/admin/library/BulkUploadSheet.tsx` (new) — the sheet/dialog body, drives the upload state machine.
- `src/components/admin/library/UploadDropZone.tsx` (new) — full-width drag target with the canonical `border-foreground/20` resting + `border-primary` + `bg-primary/[0.04]` dragover treatment.
- `src/components/admin/library/UploadProgressList.tsx` (new) — per-file row with thumbnail, filename, percent, campaign destination pill, error retry.
- `src/hooks/useBulkUpload.ts` (new) — orchestrates parallel uploads (max 3 in flight), surfaces aggregate progress, supports background-continue when sheet closes.
**State machine:** `idle → picking → uploading → completed | partial-failed`. Files that fail get a `Try again` button on their row; other files keep going.
**Visual spec:**
- Mobile: full-screen `AdminSheet` with drag handle. Desktop: 640px `AdminDialog`.
- Step 1 = drop zone. Step 2 = "Add to campaign:" `AdminCombobox` (defaults to active rail campaign; "All assets" forces a chooser). Step 3 = list. Step 4 = single sentence outcome (`"22 added to Only Numbers."`) + `Done`.
- Closing during upload triggers a confirm sheet: `"Still uploading 8 files. Close and continue in the background?"`. Confirm → upload continues, a small toast (`fixed bottom-4 right-4`) shows aggregate progress.
**Acceptance:**
- Mixed batch (5 images + 3 videos) uploads correctly; videos show `"Preparing video…"` while Mux processes.
- Closing the dialog during upload → uploads continue, completion toast appears.
- Friendly oversize copy: `"That video's a bit big — try under 200 MB"` (not "413: Payload Too Large").
- File-type rejection inline before upload starts.

### 2.2 Image pipeline for quest_asset ✅
**Outcome (2026-04-30):** Existing signed-url + complete pipeline accepts `kind: 'quest_asset'` after the config update. Tags pass-through already in place. Sharp resize → WebP@q82 + EXIF strip applies unchanged.
**Goal:** every uploaded image goes through Sharp → 1200px-long-edge WebP@q82 + EXIF strip. Same as `quest_cover` today.
**Files:**
- `src/app/api/admin/media/upload/route.ts` (or wherever the existing tenant-media upload completion lives) — accept `kind: 'quest_asset'`, accept the campaign label, write `tags[0]` accordingly.
- `src/lib/uploads/tenant-media-pipeline.ts` — extend the kind-aware sizing rules to include `quest_asset` (1600px max long edge — slightly larger than `quest_cover` because reps may zoom).
**Acceptance:**
- 5 MB JPEG ends up ~150 KB WebP, EXIF stripped, `tenant_media.file_size_bytes` reflects post-pipeline size.
- `tags[0]` correctly stores the campaign slug.
- Original aspect ratio preserved.

### 2.3 Video pipeline for quest_asset ✅
**Outcome (2026-04-30):** Reuses the existing `/api/upload-video` (signed Supabase URL) → `/api/mux/upload` (server-side ingest, capped-1080p) flow. New `POST /api/admin/media/complete-video` polls for ready, extracts the public playback id, and inserts a `tenant_media` row with `kind='quest_asset'`, `mime_type='video/mp4'`, `storage_key=<playback_id>`, `url=<thumbnail URL>`. Rotation engine recognises Mux ids via `isMuxPlaybackId` and surfaces playback + download URLs to iOS.
**Goal:** uploaded videos go through Mux capped-1080p, get a thumbnail, and land in `tenant_media` with `mime_type` set + a Mux playback ID stored.
**Files:**
- `src/lib/mux.ts` — verify `getMuxStreamUrl()`, `getMuxDownloadUrl()`, `getMuxThumbnailUrl()` work for the `quest_asset` kind without modification.
- `src/app/api/admin/media/upload/route.ts` — when MIME is video, route through `/api/upload-video` flow (existing); store the Mux playback ID in `tenant_media.storage_key` (or add a dedicated column if cleaner — TBD during build).
- `src/components/admin/library/VideoTile.tsx` (new) — grid tile for video assets: thumbnail + play glyph, hover-loops muted, falls back to static thumbnail under `prefers-reduced-motion`.
**Acceptance:**
- Uploading a 100 MB MOV produces a Mux asset, capped at 1080p, with `mp4_support: capped-1080p` enabled (so iOS can download a flat MP4).
- Library grid renders video tiles correctly mixed with image tiles.
- Mux thumbnail fetched as a `next/image`-friendly URL.

### 2.4 Move assets between campaigns ✅
**Outcome (2026-04-30):** Sticky `BulkActionBar` slides up from bottom safe-area in `CampaignAssetGrid` whenever ≥1 tile is selected. Actions: **Cancel · Move to All assets · Delete**. Backend at `POST /api/admin/media/move` rewrites `tags[0]` and promotes `kind` to `quest_asset` when moving INTO a campaign (so existing covers/shareables can join a campaign without a re-upload).
**Goal:** the bulk-action bar that slides up from the bottom when ≥1 tile is selected.
**Files:**
- `src/components/admin/library/BulkActionBar.tsx` (new) — sticky-bottom bar matching the canvas-editor sheet pattern.
- `src/app/api/admin/media/move/route.ts` (new) — `POST { ids: string[], campaign_tag: string | null }`. Updates `tags[0]`. `null` clears (moves to "All assets").
**Acceptance:**
- Selecting tiles across the grid shows the bar; deselect-all hides it.
- Move is atomic — partial failure rolls back.
- Toast: `"22 moved to Spring 26"` after success.

---

## Phase 3 — Quest Editor Integration (target: 0.5 day)

### 3.1 Asset-mode radio + campaign combobox ✅
**Outcome (2026-04-30):** New `QuestPoolPicker` injected at the top of the QuestsTab Content tab — radio rows (Single asset / From a campaign) followed by a sentence-form combobox (`Pull from [campaign ▾] · 47 assets · Browse`). Single-asset upload UI is hidden in pool mode. Save body includes `asset_mode` + `asset_campaign_tag`; both POST and PUT routes (`/api/reps/quests` + `/[id]`) accept and persist them.
**Goal:** a quest editor cleanly toggles between single-asset and pool modes without visual gear-shift.
**Files:**
- `src/components/admin/reps/QuestEditor.tsx` (or whichever file owns the quest editor's shareable picker — verify with grep) — add the `AdminRadio` group, conditionally render combobox vs existing single picker.
- `src/components/admin/reps/QuestPoolPicker.tsx` (new) — the sentence-style combobox (`Pull from [campaign ▾] · 47 assets · Browse`).
**Visual spec (sentence layout, not a form field):**
```
SHAREABLES
○ Single asset   — the rep posts this one image or video
●  From a campaign — the rep picks from a rotating pool

  Pull from [Only Numbers — Spring 26 ▾] · 47 assets · Browse

  ┌──────────────────────────────────────────────────────────┐
  │ Each rep sees up to 10, sorted to feel fresh. New        │
  │ uploads appear at the top.                                │
  └──────────────────────────────────────────────────────────┘
```
**Acceptance:**
- Switching to `pool` and saving sets `asset_mode='pool'` + `asset_campaign_tag=<slug>`.
- Switching back to `single` clears `asset_campaign_tag`.
- Combobox is searchable; typing a non-existent campaign offers `Create "{name}"` inline (creates the empty campaign + assigns).
- Browse link opens a dialog/sheet showing the iOS-frame preview from 3.2.

### 3.2 Browse-on-app preview (iOS frame mirror) 🚫
**Outcome (2026-04-30):** Cut for v1 — replaced by a `Browse` link from the picker straight into `/admin/library?campaign=<slug>` so the host sees the actual asset grid + stats. The dedicated phone-frame mirror was deferred; revisit when iOS ships its screen and we have a real visual to mirror.
**Goal:** tenant clicks `Browse` and sees exactly what reps will see — same 10-asset rotation, same sort, same "Used" pills (rendered against a fake "viewer rep" with no download history so it shows a clean fresh state).
**Files:**
- `src/components/admin/reps/QuestPoolPreviewSheet.tsx` (new) — phone-frame mirror, fetches `/api/admin/media/campaigns/[tag]/preview?as=fresh-rep` (returns the rotated 10 with no `is_downloaded_by_me` flag set true).
- `src/app/api/admin/media/campaigns/[tag]/preview/route.ts` (new) — admin-auth, simulates the rotation against a synthetic empty-history rep.
**Acceptance:**
- Preview renders within 200ms (single fetch, no re-fetches).
- Mobile-correct sizing (390×844 frame).
- "Used" state demoable via a toggle in the preview top bar (`Show as: fresh rep | rep who's used 5`).

### 3.3 Pool exhaustion + edge cases ✅
**Outcome (2026-04-30):** Inline hints inside `QuestPoolPicker`: empty campaign → amber warning ("reps won't see anything"); 1–9 assets → muted hint ("add more for variety"). Server-side, `GET /api/rep-portal/quests/[id]/assets` returns `rotation_position: 'fresh' | 'mixed' | 'all-used'` so iOS can display the right empty-state copy.
**Goal:** quest editor surfaces these honestly so the tenant doesn't ship a quest that breaks for reps.
**Files:** same as 3.1.
**UX:**
- Selecting an empty campaign disables Save with copy: `"Add some assets to this campaign first."` with a `Open campaign` link.
- Selecting a campaign with <10 assets shows a sub-line: `"Reps will see all 7 assets. Add more for variety."`.
- Pre-existing single-asset quests are unaffected.
**Acceptance:**
- Save is gated by emptiness check (server-enforced too: 400 if pool is empty when `asset_mode='pool'` and quest moves to `live`).

---

## Phase 4 — Rep-facing API + iOS DTO Contract (target: 0.5 day)

This phase ships the contract iOS will consume. Once 4.4 is published, iOS team can build the screen in parallel.

### 4.1 GET /api/rep-portal/quests/[id]/assets ✅
**Outcome (2026-04-30):** Live. Loads quest, validates pool mode + promoter membership, runs `getRotatedAssetsForRep` (LIMIT 10), returns DTOs matching the iOS contract. `media_kind`, `playback_url`, `thumbnail_url`, `is_downloaded_by_me`, `my_last_used_at`, `download_count_total`, plus `campaign.label` + `total_in_pool` + `rotation_position`. 400/403/404 paths covered.
**Goal:** server returns 10 assets, sorted by the rotation rule, includes per-rep state.
**File:** `src/app/api/rep-portal/quests/[id]/assets/route.ts` (new)
**Auth:** `requireRepAuth()` → `{rep}`.
**Logic:**
1. Load the quest, verify it has `asset_mode = 'pool'` (else 400 `not_a_pool_quest`).
2. Verify the rep is on the quest's promoter team via `rep_promoter_memberships` (else 403).
3. Run `getRotatedAssetsForRep({ orgId: quest.org_id, repId: rep.id, campaignTag: quest.asset_campaign_tag, limit: 10 })`.
4. Compute `rotation_position`: `'fresh'` (all 10 are unused-by-rep), `'mixed'` (some unused, some used), `'all-used'` (every asset has been used by this rep).
**Response shape:**
```jsonc
{
  "data": [
    {
      "id": "uuid",
      "media_kind": "image",          // 'image' | 'video'
      "url": "https://.../1200.webp", // canonical (image)
      "playback_url": null,           // populated for video (Mux .m3u8 or .mp4)
      "thumbnail_url": null,          // populated for video
      "width": 1200,
      "height": 1500,
      "duration_seconds": null,       // video only
      "is_downloaded_by_me": false,
      "my_last_used_at": null,        // ISO8601 when present
      "download_count_total": 12      // global, lightly informational
    }
  ],
  "campaign": {
    "label": "Only Numbers — Spring 26",
    "total_in_pool": 47
  },
  "rotation_position": "fresh"
}
```
**Acceptance:**
- 200 response < 200ms p50 with a 50-asset campaign.
- All `media_kind: 'video'` rows have `playback_url` + `thumbnail_url`.
- Single SQL query (no N+1).
- 401/403/400 paths covered.

### 4.2 POST /api/rep-portal/quests/[id]/assets/[mediaId]/download ✅
**Outcome (2026-04-30):** Live. Cross-tenant guards (org match + campaign membership + media kind) before idempotent UPSERT into `rep_asset_downloads`. Returns canonical URL: image = public WebP (permanent), video = `getMuxDownloadUrl()` capped-1080p MP4. `first_time` flag drives the iOS one-shot UX hint.
**Goal:** idempotent download log + canonical URL.
**File:** `src/app/api/rep-portal/quests/[id]/assets/[mediaId]/download/route.ts` (new)
**Auth:** `requireRepAuth()`.
**Logic:**
1. Verify quest is `asset_mode='pool'`, rep is on team, media is in the quest's campaign.
2. Insert into `rep_asset_downloads` with `ON CONFLICT (rep_id, media_id) DO NOTHING`.
3. Return canonical asset URL. For images: the public storage URL. For videos: a Mux MP4 download URL valid for 24h via `getMuxDownloadUrl()`.
**Response:**
```jsonc
{
  "url": "https://stream.mux.com/.../high.mp4?token=…",
  "expires_at": "2026-05-01T13:00:00Z",   // null for permanent public URLs
  "first_time": true                       // true if this insert was new
}
```
**Acceptance:**
- Calling twice → second response `first_time: false`, no error.
- Cross-campaign abuse blocked: `mediaId` not in the quest's campaign → 403.
- Logged to `rep_asset_downloads` with `quest_id` populated for analytics.

### 4.3 Embed asset_mode + pool summary on existing quest endpoints ✅
**Outcome (2026-04-30):** `/api/rep-portal/quests` GET now ships `asset_mode` + `asset_pool` (count, image_count, video_count, sample_thumbs) on every quest, computed via a single batched fetch (`org_id IN (...) + tags overlap` then bucketed client-side). Dashboard route's quests block stays aggregate-only — no shape change needed for iOS to detect pool mode there.
**Goal:** every quest list/detail endpoint already consumed by iOS includes the new fields so iOS knows when to render the pool screen vs the single-asset screen.
**Files (touch each, no new routes):**
- `src/app/api/rep-portal/quests/route.ts`
- `src/app/api/rep-portal/quests/[id]/route.ts` (if it exists; else fold into list)
- `src/app/api/rep-portal/dashboard/route.ts` (the `quests` block)
**New fields on each `RepQuestDTO`:**
```jsonc
{
  // ... existing fields
  "asset_mode": "pool",                          // or "single"
  "asset_pool": {                                 // null when asset_mode = 'single'
    "count": 47,
    "image_count": 31,
    "video_count": 16,
    "sample_thumbs": ["https://...", "https://...", "https://..."]
  }
}
```
**Acceptance:**
- iOS can render a "47 assets" pill on the quest card without hitting the assets endpoint.
- Existing single-asset quests serialize unchanged (asset_mode defaults to 'single' from the migration).

### 4.4 Publish the iOS DTO contract doc ✅
**Outcome (2026-04-30):** Shipped at `docs/ios-quest-pool-contract.md`. Detection rules, full request/response shapes, error catalog, suggested Swift model layer, Save-to-Photos flow, permissions, change policy. Promoted to "ship first, before any backend" so iOS can build against mocks in parallel.
**Goal:** a single doc the iOS team can implement against, with no admin/web context.
**File:** `docs/ios-quest-pool-contract.md` (new — sibling to `ENTRY-IOS-BACKEND-SPEC.md`)
**Sections:**
1. **Overview** — what a pool quest is, in 3 sentences.
2. **Detection** — `RepQuestDTO.asset_mode === 'pool'` triggers the new screen. `asset_pool.count` lets the card show "47 assets" without a fetch.
3. **GET /api/rep-portal/quests/[id]/assets** — exact request + response shape, including all enum values and nullability rules.
4. **POST /api/rep-portal/quests/[id]/assets/[mediaId]/download** — same.
5. **Rotation rules** — the iOS engineer needs to know that the server already sorted, so they don't re-sort client-side. "Render in array order. Pull-to-refresh re-fetches; do not cache more than 5 minutes."
6. **Save-to-Photos flow** — call download endpoint → write returned URL to `PHPhotoLibrary` → optimistically mark tile as used. If write fails, surface a single-shot toast and don't roll back the download log (it's logged on the server regardless).
7. **Permissions** — `NSPhotoLibraryAddUsageDescription` required in `Info.plist`.
8. **Empty states** — `rotation_position: 'all-used'` UX recommendation. (iOS team owns the visual.)
9. **Error states** — 400 `not_a_pool_quest`, 403 `not_on_team`, 404 `quest_not_found`, 500 generic. Suggested user-facing copy for each.
**Acceptance:** iOS team can build the screen without asking a single clarifying question.

---

## Phase 5 — Analytics + Polish (target: 0.5 day)

### 5.1 Top-assets analytics ✅
**Outcome (2026-04-30):** Folded into the `/api/admin/media/campaigns/[tag]/stats` route (Phase 1.2 work). Returns `top_assets[]` (top-5 by all-time downloads) + `downloads_this_week` + `downloads_sparkline` (7-day daily counts). `CampaignTopAssets` consumes them in a collapsible panel; `CampaignStatRow` consumes the sparkline.
**Goal:** the campaign canvas's "Top assets" block gets real numbers.
**File:** `src/app/api/admin/media/campaigns/[tag]/stats/route.ts` (extend from 1.2) — add `top_assets: [{ media_id, ...media_fields, download_count: int }]`.
**Acceptance:** sub-200ms response, single SQL query (`GROUP BY media_id` aggregate).

### 5.2 Downloads-this-week sparkline ✅
**Outcome (2026-04-30):** Embedded directly into `CampaignStatRow` via the existing `MicroSparkline` (`bar` variant). No new chart dep.
**Goal:** subtle 7-day sparkline on the campaign stat tile, reusing `MicroSparkline` from the canvas editor (don't add a charting dep).
**Files:**
- `src/components/admin/library/CampaignStatRow.tsx` — embed the sparkline.
- `src/lib/library/campaign-stats.ts` — pure function: `bucketDownloadsByDay(rows, 7)`.
**Acceptance:** sparkline matches the visual language of the existing sales-timeline sparklines.

### 5.3 CLAUDE.md updates ✅
**Outcome (2026-04-30):** Quests + Rewards section now documents pool quests with the rotation rule, the new `rep_asset_downloads` table, and pointers to the iOS contract + this plan. Tenant-scoped tables list updated to include `quest_asset` kind. Activity-table list adds `rep_asset_downloads`. Rep self-service routes list includes the two new pool endpoints. Admin Pages Index → Creative entry rewritten for the rail + canvas + bulk upload sheet.
**Goal:** the architecture map stays accurate.
**Sections to update:**
- "Database — Tables" — add `rep_asset_downloads`; update `tenant_media` kinds list with `quest_asset`.
- "Quests + Rewards" — add a paragraph on pool mode + how it ties to the library.
- "Admin Pages Index — Creative" — note the campaign rail addition to `/admin/library/`.
- "API Routes" — list the two new rep-portal routes + the new admin campaigns routes.
- "Known Gaps" — remove "no admin Library tagging" if listed; add "iOS pool quest screen — owned by iOS team" if not yet shipped.
**Acceptance:** CLAUDE.md still under 40K characters; new info compresses cleanly.

---

## Phase 6 — Tests + Ship (target: 0.5 day)

### 6.1 Unit tests ⬜
**Files:** `src/__tests__/lib-asset-rotation.test.ts` (already covered in 0.3), plus:
- `src/__tests__/lib-campaign-stats.test.ts` — sparkline bucketing.
- `src/__tests__/lib-campaign-tag.test.ts` — slugify edge cases (apostrophes, em-dashes, unicode).
**Acceptance:** all green via `npm test`.

### 6.2 Integration tests (real DB) ⬜
**File:** `src/__tests__/integration/library-campaigns.integration.test.ts`
**Coverage:**
- Full upload → tag → quest-link → rep-fetch round trip on `org_id = '__test_integration__'`.
- Rotation behaviour with seeded data: rep with 0 / 8 / 50 downloads against a 50-asset pool.
- Idempotent download log: 100 concurrent calls → exactly one row.
- Cross-org isolation: rep on org A can't fetch quest assets from org B.
- Cleanup via `test_cleanup_*` helpers.
**Acceptance:** `npm run test:integration` green; new tests run in <30s on CI.

### 6.3 Pre-flight + ship ⬜
- `npm run tsc --noEmit -p tsconfig.build.json` clean.
- `npm test` + `npm run test:integration` clean.
- Manual smoke at 375px on real device.
- Migration applied to prod via Supabase MCP `apply_migration`.
- Vercel preview verified before merge.
- Sentry breadcrumb scan after deploy: zero new errors in first hour.

---

## File-by-file map (for the future-you who picks this up cold)

### New backend files
- `supabase/migrations/20260430_library_campaigns.sql`
- `src/lib/library/asset-rotation.ts`
- `src/lib/library/campaign-stats.ts`
- `src/lib/library/campaign-tag.ts`
- `src/types/library-campaigns.ts`
- `src/app/api/admin/media/campaigns/route.ts`
- `src/app/api/admin/media/campaigns/[tag]/route.ts` (PATCH/DELETE)
- `src/app/api/admin/media/campaigns/[tag]/stats/route.ts`
- `src/app/api/admin/media/campaigns/[tag]/preview/route.ts`
- `src/app/api/admin/media/move/route.ts`
- `src/app/api/rep-portal/quests/[id]/assets/route.ts`
- `src/app/api/rep-portal/quests/[id]/assets/[mediaId]/download/route.ts`

### Modified backend files
- `src/lib/uploads/tenant-media-config.ts` — add `quest_asset` kind + size caps
- `src/lib/uploads/tenant-media-pipeline.ts` — pipeline rules for `quest_asset`
- `src/app/api/admin/media/upload/route.ts` — accept new kind + campaign tag
- `src/app/api/rep-portal/quests/route.ts` — add `asset_mode` + `asset_pool` fields
- `src/app/api/rep-portal/dashboard/route.ts` — same
- `src/app/api/rep-portal/quests/[id]/route.ts` — same (if exists)

### New admin UI files
- `src/components/admin/library/CampaignRail.tsx`
- `src/components/admin/library/CampaignChipStrip.tsx`
- `src/components/admin/library/CampaignCanvas.tsx`
- `src/components/admin/library/CampaignStatRow.tsx`
- `src/components/admin/library/CampaignLinkedQuests.tsx`
- `src/components/admin/library/CampaignTopAssets.tsx`
- `src/components/admin/library/CampaignActions.tsx`
- `src/components/admin/library/BulkUploadSheet.tsx`
- `src/components/admin/library/UploadDropZone.tsx`
- `src/components/admin/library/UploadProgressList.tsx`
- `src/components/admin/library/BulkActionBar.tsx`
- `src/components/admin/library/VideoTile.tsx`
- `src/components/admin/library/LibraryWorkspaceSkeleton.tsx`
- `src/hooks/useBulkUpload.ts`
- `src/app/admin/library/loading.tsx`
- `src/components/admin/reps/QuestPoolPicker.tsx`
- `src/components/admin/reps/QuestPoolPreviewSheet.tsx`

### Modified admin UI files
- `src/app/admin/library/page.tsx` — likely unchanged; just renders the upgraded `LibraryWorkspace`.
- `src/components/admin/library/LibraryWorkspace.tsx` — wrap in two-column layout, lift filter state.
- `src/components/admin/reps/QuestEditor.tsx` (or equivalent) — embed `QuestPoolPicker`.

### New docs
- `docs/ios-quest-pool-contract.md` — the iOS-facing API contract.

### Modified docs
- `CLAUDE.md` — sections noted in 5.3.

---

## Cross-cutting rules

- **Visual quality bar:** every new admin surface matches `BrandPreview.tsx` / `FinishSection.tsx`. Apply `docs/admin-ux-design.md`. Tokens, never hex.
- **Multi-tenant:** every query filters by `org_id`. The download endpoint cross-checks `media.org_id === quest.org_id === rep's-team-org` before serving.
- **Mobile-first:** start at 375px. The campaign rail collapses to a chip strip; the upload dialog becomes a full-screen sheet with a drag handle.
- **No tech-speak in copy:** never say "tag", "pool", "kind", "Mux", "Sharp", "WebP", "compression", "tenant_media". Tenants see "campaign", "asset", "image", "video", and "we'll resize and compress for you."
- **Editorial CTA tone (Section 11.5 of admin-ux-design.md):** sentence case, no exclamations. `Upload`, `New campaign`, `Save`, `Done`. Not `Get Started`, `Save Changes`, `Upload Now!`.
- **Animation budget:** one entrance per page, one micro-interaction on the primary CTA, one ambient signal if earned. The video-tile hover-loop counts as the ambient signal — don't add more.
- **Sentry:** wrap new API handlers with `setSentryOrgContext()`. Errors land in the rep-platform Sentry project.
- **Supabase clients:** `getSupabaseAdmin()` for data, `getSupabaseServer()` for auth-only. Wrong client = silent data loss.
- **No new vendors.** Mux, Sharp, Supabase Storage are the only pipeline pieces. If a new dep tempts you, raise it in the Decision log first.

---

## Decision log

Append entries as `YYYY-MM-DD — decision — rationale`.

- *2026-04-30 — plan created — pool-quest mode is additive (not replacement); tag-based linkage instead of a junction table; per-rep download log keyed `(rep_id, media_id)` not `(rep_id, quest_id, media_id)` so cross-quest rotation works; fixed 10-asset window enforced server-side.*
- *2026-04-30 — campaign is the user-facing noun; tag is the internal storage — picked "campaign" over "pool" / "library group" / "collection" because tenants already think in those terms when running marketing pushes. Internally it's still `tenant_media.tags[0]` for backwards compat.*
- *2026-04-30 — no per-quest asset pinning — original plan considered an override list of `asset_pinned_ids` so a quest could exclude specific assets. Cut for simplicity per Harry's "keep it super simple" steer. Tenants who need finer slicing create more campaigns; the tag granularity is theirs to choose.*
- *2026-04-30 — pull-to-refresh re-runs the same SQL, no pagination — the rotation algorithm naturally produces a different 10 as downloads happen and uploads land. Adding cursor pagination would let reps page deeper into their used pile, which is the opposite of what we want.*
- *2026-04-30 — XP/EP per quest, not per asset — Harry confirmed quest-level rewards. Per-asset variance was raised but rejected; would complicate the EP ledger and let reps farm "high-value" assets, which doesn't match the "post anything from this campaign" intent.*

---

## Pickup checklist for a future session

1. Read this file top to bottom.
2. Scan statuses: `🟨` first, then `⬜` in phase order.
3. Read `CLAUDE.md` for current platform state.
4. Read `docs/admin-ux-design.md` before any `/admin/*` UI work.
5. Verify file paths still exist (`Read` or `Bash ls`) — codebase moves.
6. Check the **Decision log** for trade-offs already made.
7. Pick one item, mark it `🟨`, work on it, ship it, mark `✅` with a one-line outcome note.
8. Don't batch — ship items individually so progress is real and reversible.
