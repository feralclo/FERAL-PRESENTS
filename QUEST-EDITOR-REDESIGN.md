# Quest Editor Redesign — Implementation Plan

> **Goal:** rebuild the Create Quest dialog so a first-time tenant ships a working quest in ~30 seconds with 3 fields, while a power user has the same depth available as opt-in chips. Add the walkthrough-video field along the way without it adding cognitive cost to the default path.
> **Scope:** the admin Create/Edit Quest surface end-to-end. iOS contract gets one new field (`walkthrough_video_url`). Live preview pane on the right (phone-frame mirror of the rep card) borrowed from the event editor's `BrandPreview` shape.
> **Quality bar:** match `BrandPreview.tsx` and `FinishSection.tsx`. Apply `docs/admin-ux-design.md` rigorously. Editorial copy, sentence case, no glass on admin.
> **Estimated calendar time:** 2–3 focused days for admin + ~half day for the walkthrough field migration + iOS contract bump.
> **Source conversations:** 2026-04-30 (Harry × Claude — pool quest UX iterations) and 2026-05-01 (Harry × Claude — "make Create Quest unbelievable" reflection).

---

## How to use this doc

- Each item has a status: `⬜` todo, `🟨` in progress, `✅` done, `⏸️` blocked, `🚫` cancelled.
- When picking up, scan for `🟨` first, then `⬜` in phase order.
- Update inline as items complete. Append a one-line outcome note.
- Append to the **Decision log** at the bottom whenever a meaningful trade-off is made.
- Acceptance criteria are the bar. "I changed some code" is not done.

---

## North Star

> A first-time tenant clicks **+ New quest**, picks "Post on social" from a 3-tile visual picker, types "Post Only Numbers to your story", sees the live phone-frame render their rep will see appear next to the form, and clicks **Create**. Done. Quest is live, share URL works, reps see it on TestFlight 30 seconds later. Zero tabs. Zero scary options. Zero "do I need to set this?" friction.
>
> A pro tenant clicks **+ New quest**, picks the same 3-tile, types the title, then taps the "+ Walkthrough" chip below to drop in a screen recording showing reps how to do the quest, the "+ Reference link" chip to paste the TikTok they want recreated, the "+ Anchor to event" chip to bind the share URL to ONLYNUMBERS London, and the "+ Rules" chip to set max_completions=1. Same 30-second core flow, opt-in depth. Hit Create.

---

## What we're replacing

The current Create Quest dialog is a 5-step / 5-type matrix:

| Quest type | Tabs |
|---|---|
| social_post | Details · Platform · Content · Publish |
| story_share | Details · Content · Publish |
| content_creation | Details · Platform · Content · Publish |
| custom | Details · Setup · Publish |
| sales_milestone | Details · Target · Publish |

≈29 form controls across those tabs. Even a "post Only Numbers to your story" quest forces 3 tabs and 12+ field decisions including: Platform, sound, reference link, proof type, expiry, max completions, auto-approve, XP/EP overrides. Most are useful, none are essential for shipping the first quest, all are visually peer-weighted with the title — so first-timers either give up or ship half-configured quests.

The frame is wrong. The features are right.

---

## Locked design decisions

These are settled — don't relitigate without putting an entry in the Decision log first.

1. **Three visual quest types in the picker, five behind the scenes.** "Post on social" wraps `social_post + story_share + content_creation` (a sub-toggle inside the form picks story / feed / make-your-own). "Hit a sales target" maps to `sales_milestone`. "Something else" maps to `custom`. The DB column `quest_type` keeps its 5 values; the picker just stops asking the host to think in those terms.
2. **One screen, not multiple tabs.** The default form is one calm vertical surface. Tabs are dead.
3. **Optional fields live as `+ Add ...` chips.** Closed by default. Each chip expands inline into a small editable block with an X to collapse. Removing closes the section AND nulls its data so the host can iterate freely.
4. **Live phone-frame preview on the right.** Real-time render of the rep card the rep will see. Click anything in the form, the relevant section pulses on the preview. Built using the same inlined-mirror pattern as `BrandPreview` and the event editor's `CanvasPreview` — no mounting of the iOS app, no analytics pollution.
5. **Walkthrough video is a chip, not a top-level field.** Same visual weight as Reference link, Cover image, etc. New column `walkthrough_video_url` stores a Mux playback id; same pipeline as the existing shareable video upload.
6. **Save = creates as draft.** A separate **Publish** primary CTA at the bottom flips status to `active` and gates by readiness rules (title present, type set, et al). Mirrors the event editor's publish gate. **No "Status" dropdown.**
7. **Editorial CTA tone.** "Create", "Publish", "Save", "Cancel". Sentence case. No "Save Quest!", no "Get Started!".

---

## Phase 0 — Schema + iOS contract (target: 0.5 day)

### 0.1 Migration: add `walkthrough_video_url` to rep_quests ✅
**Goal:** new optional column for the example screen recording. Stores a Mux playback id (same convention as `video_url`) so the existing pipeline works unchanged.
**File:** `supabase/migrations/20260501_rep_quests_walkthrough_video_url.sql`
**SQL:**
```sql
ALTER TABLE rep_quests
  ADD COLUMN IF NOT EXISTS walkthrough_video_url TEXT NULL;
```
**Acceptance:** migration applies cleanly via Supabase MCP `apply_migration`. `INSERT … (walkthrough_video_url) VALUES ('mux_playback_id')` succeeds. Existing rows get `NULL`.
**Outcome (2026-05-01):** applied via Supabase MCP. Column verified `text NULL` with comment. File committed at `supabase/migrations/20260501_rep_quests_walkthrough_video_url.sql`.

### 0.2 iOS contract bump ✅
**File:** `docs/ios-quest-pool-contract.md` — add a new "Walkthrough video" section. The field is independent of pool mode; it's just one more optional URL on every quest.
**Outcome (2026-05-01):** doc bumped to v1.1. Section 9 added with field definition, suggested "Watch how" CTA on `QuestDetailSheet`, and note that the existing Mux player handles playback. DTO sample in Section 2.1 updated.
**DTO addition** (on `RepQuestDTO`):
```jsonc
{
  "walkthrough_video_url": "<mux_playback_id_or_full_url> | null"
}
```
**iOS UX recommendation** (suggested, not binding): "Watch how" button inside `QuestDetailSheet` that opens the existing Mux player surface (already used for shareables). Hidden when the field is null.
**Acceptance:** doc updated, iOS team has a one-paragraph spec they can build against without asking questions.

### 0.3 Type plumbing ⬜
**Files:**
- `src/types/reps.ts` — add `walkthrough_video_url?: string | null` to `RepQuest`.
- Existing rep-portal serializers (`/api/rep-portal/quests`, `/api/rep-portal/dashboard`) — pass the field through.
- Admin POST/PUT (`/api/reps/quests` + `/[id]`) — accept the field.
**Acceptance:** `npx tsc --noEmit -p tsconfig.build.json` clean. Field round-trips DB ↔ admin ↔ rep-portal without manual mapping.

---

## Phase 1 — Foundations (target: 0.5 day)

### 1.1 New file structure ⬜
**Goal:** the new editor lives as a distinct directory so the migration is incremental and rollback-able.
**Files (new):**
- `src/components/admin/reps/quest-editor/QuestEditor.tsx` — the orchestrator (replaces the inline editor in `QuestsTab.tsx`).
- `src/components/admin/reps/quest-editor/QuestTypeStep.tsx` — the 3-tile visual picker.
- `src/components/admin/reps/quest-editor/QuestForm.tsx` — the single-screen form body.
- `src/components/admin/reps/quest-editor/QuestPreview.tsx` — phone-frame mirror.
- `src/components/admin/reps/quest-editor/QuestChip.tsx` — the canonical "+ Add X" chip + expanded section pattern.
- `src/components/admin/reps/quest-editor/sections/CoverSection.tsx`
- `src/components/admin/reps/quest-editor/sections/ShareableSection.tsx`
- `src/components/admin/reps/quest-editor/sections/WalkthroughSection.tsx` (new field)
- `src/components/admin/reps/quest-editor/sections/PlatformSection.tsx` (sub-type toggle + reference link + sound)
- `src/components/admin/reps/quest-editor/sections/ProofSection.tsx`
- `src/components/admin/reps/quest-editor/sections/EventSection.tsx`
- `src/components/admin/reps/quest-editor/sections/RulesSection.tsx` (max_completions, expires_at, auto_approve)
- `src/components/admin/reps/quest-editor/sections/RewardSection.tsx` (XP/EP — visible by default but minimal)
- `src/components/admin/reps/quest-editor/sections/PoolSection.tsx` (already built; just relocated)
**Acceptance:** the directory exists, all files compile, `QuestsTab.tsx` still works (uses the OLD editor for now). Both can coexist behind a feature flag during the cutover.

### 1.2 Visual quest-type picker ⬜
**Goal:** replace the existing button-list type step with three big visual cards.
**Cards (each ~280×180px on desktop, full-width stacked on mobile):**
| Card | Maps to | Hero illustration |
|---|---|---|
| **Post on social** | (social_post / story_share / content_creation — pick sub-type later) | Phone with social glyphs |
| **Hit a sales target** | sales_milestone | Ascending bar chart |
| **Something else** | custom | Sparkle / catch-all |
**Acceptance:** click a card → form renders pre-filled with the matching `quest_type`; for "Post on social" a small segmented sub-toggle inside the form picks story / feed / make-your-own (defaulting to story).

### 1.3 Single-screen form layout + preview pane ⬜
**Goal:** two-column shell on desktop (form left, preview right); single column with sticky preview pill on mobile.
**Files:**
- `QuestForm.tsx` — left column: title input, reward block, then a `<QuestChipsRow />` of optional chips, then primary actions row at bottom (Save draft / Publish).
- `QuestPreview.tsx` — right column: phone-frame mirror of the rep card from `iOS QuestCardView`, faithfully inlined like `BrandPreview` does for the event page. Updates as form state changes.
**Acceptance:** form fields drive the preview live (with a debounce for text inputs). Preview matches the iOS card visually (gradient + cover + title overlay + XP/EP chips). On mobile, preview collapses to a "Preview" floating pill that opens a sheet.

### 1.4 The Chip pattern ⬜
**Goal:** one canonical component for "+ Add X" affordances and their expanded forms.
**File:** `QuestChip.tsx`
**Props:**
```ts
interface QuestChipProps {
  label: string;          // "Cover image"
  icon: ReactNode;        // lucide icon
  filled: boolean;        // does this section have content?
  open: boolean;          // is it expanded?
  onToggle: () => void;
  onClear?: () => void;   // X next to the label when filled
  children: ReactNode;    // the expanded section
}
```
**Visual states:**
- **Closed + empty** → outlined chip, dashed border, "+ Cover image"
- **Closed + filled** → solid chip with summary thumbnail, "Cover image · cover.webp · X"
- **Open** → header row with collapse caret, full section below in an `AdminPanel`
**Acceptance:** every optional section uses `QuestChip` consistently — same chrome, same close behaviour, same data-clear semantics.

---

## Phase 2 — Sections (target: 1 day)

Each section is a small focused component. Build in priority order — top of the list ships first so the editor is usable end-to-end early.

### 2.1 RewardSection ⬜
**Goal:** XP + EP. Visible by default (not chipped) because every quest needs a reward. Compact two-input row.
**Acceptance:** prefilled by quest type via `getPlatformXPConfig()`; tenant can override; saves correctly.

### 2.2 CoverSection ⬜
**Goal:** the in-app card hero. Reuses `<CoverImagePicker kind="quest_cover">`.
**Acceptance:** filled state shows a 3:4 thumbnail; chip header reads "Cover · cover.webp"; X clears.

### 2.3 ShareableSection ⬜
**Goal:** what reps post. Single-asset OR pool. Reuses the existing `QuestPoolPicker` (which we just rebuilt — it can drop in unchanged).
**Acceptance:** segmented "Single asset / From a campaign" toggle inside the section. Single asset path uses the existing inline upload zone with the polished primary-tinted recipe. Pool path uses `QuestPoolPicker`.

### 2.4 WalkthroughSection (new field) ⬜
**Goal:** optional screen recording showing reps how to do the quest.
**Files:** new section component; reuses the existing Mux upload pipeline (`/api/upload-video` + `/api/mux/upload` + `/api/mux/status`).
**UX:** drop-zone styled the same as the shareable upload (canonical recipe); tile preview when filled with a small play glyph; X clears.
**Server contract:** writes `walkthrough_video_url` as a Mux playback id when ready.
**Acceptance:** drop a 30-second screen recording → progresses through preparing/uploading/processing-video → lands as a playback id on the row. Filled state shows a 16:9 thumbnail with a play glyph. iOS team can fetch and play it once Phase 0.3 is in.

### 2.5 PlatformSection ⬜
**Goal:** combines the existing Platform tab fields. Renders only when quest_type is post-on-social variant.
**Contents:**
- Sub-type segmented toggle: Story / Feed / Make-your-own
- TikTok / Instagram / Either (keep existing 3-button)
- Reference Post Link (text input)
- Uses Specific Sound (Switch, only when TikTok)
**Acceptance:** when collapsed, header summarises ("Story · Instagram · with reference link"). Inline.

### 2.6 EventSection ⬜
**Goal:** anchor the quest to an event so share_url uses the event slug.
**Contents:** event picker (existing `events` array); shows next 3 upcoming + search.
**Acceptance:** when filled, header reads "Event · Only Numbers London"; X detaches.

### 2.7 ProofSection ⬜
**Goal:** how reps submit proof. Default: screenshot.
**Contents:** segmented control with 5 options (screenshot / url / instagram_link / tiktok_link / text). Already exists as `PROOF_TYPE_OPTIONS` in the current code.
**Acceptance:** chip closed shows "Proof · screenshot" by default (since it's prefilled); changing it updates the chip header.

### 2.8 RulesSection ⬜
**Goal:** the dry power-user controls in one place.
**Contents:** max_completions (number input, default 1), expires_at (date-time, optional), auto_approve (Switch).
**Acceptance:** chip closed shows "Rules · 1 completion" or "Rules · 1 completion · expires Sat 5 May" or "Rules · auto-approve". Empty state header is the default chip.

### 2.9 PoolSection ⬜ (relocate, no rebuild)
**Goal:** drop in the existing `QuestPoolPicker` we just rebuilt under `ShareableSection`'s "From a campaign" branch — no new code, just the right wiring.
**Acceptance:** parity with current pool-quest behaviour (auto-create campaign, inline thumbnails, swap, rename).

---

## Phase 3 — Publish + readiness (target: 0.5 day)

### 3.1 Publish gate ⬜
**Goal:** status is implicit. Save = draft. Publish = active. Same shape as the event editor's publish gate.
**Files:**
- `src/lib/quest-readiness.ts` (new) — pure-function readiness checker; same shape as `event-readiness.ts`.
- `QuestEditor.tsx` — bottom action row with Save (draft) and Publish (gated).
**Readiness rules (initial):**
- title ≥ 3 chars
- quest_type set
- if quest_type=sales_milestone → sales_target ≥ 1
- if asset_mode=pool → asset_campaign_tag set + at least 1 asset in pool
**Acceptance:** Publish disabled with tooltip listing missing rules. Hover the tooltip → numbered list.

### 3.2 "You're live" success sheet ⬜
**Goal:** when a quest publishes, show a small celebratory sheet with the quest's share URL preview + a "View on iOS preview" link.
**Acceptance:** matches the event editor's "You're live" sheet pattern.

---

## Phase 4 — Cutover (target: 0.5 day)

### 4.1 Replace the editor in QuestsTab.tsx ⬜
**Goal:** swap the existing 1,200-line inline editor for a single `<QuestEditor />` mount. Delete the old code.
**Files modified:**
- `src/components/admin/reps/QuestsTab.tsx` — delete the form (lines ~1270–2100), replace with `<QuestEditor open={...} editId={...} onClose={...} onSaved={...} />`.
- Keep the list-view code untouched — that's not in this rebuild.
**Acceptance:** existing list, filters, table behaviour unchanged. Click + New quest or row-edit → new editor opens. Old editor code is deleted, not commented out.

### 4.2 Migration tracker entry ⬜
**File:** `docs/admin-ux-design.md` — add `src/components/admin/reps/QuestsTab.tsx` to the wrapper-migration tracker as ✅ with a one-line outcome note.

---

## Phase 5 — Tests + polish (target: 0.25 day)

### 5.1 Unit tests for readiness ⬜
**File:** `src/__tests__/quest-readiness.test.ts`
**Coverage:** every readiness rule, edge cases (empty title, missing target, pool-mode without campaign), the "all green" happy path.
**Acceptance:** all green, run as part of `npm test`.

### 5.2 Integration test: walkthrough round-trip ⬜
**File:** `src/__tests__/integration/quest-walkthrough.integration.test.ts`
**Coverage:** create a quest with `walkthrough_video_url`; admin GET returns it; rep-portal GET returns it; iOS contract field present.
**Acceptance:** runs under `npm run test:integration`.

### 5.3 Manual smoke ⬜
- 375 px mobile usability check on every section.
- Keyboard nav: tab through every chip, expand/collapse with Enter/Space.
- Screen reader: each chip announces its filled/empty state.
- Drop a video on Walkthrough; confirm Mux playback id lands; confirm iOS receives it via the contract.

---

## Phase 6 — Docs + ship ⬜
- `CLAUDE.md` Quests + Rewards section updated to mention `walkthrough_video_url`.
- `LIBRARY-CAMPAIGNS-PLAN.md` cross-referenced if pool integration changed.
- Final tsc + test pass.
- Single push when every phase is ✅.

---

## File-by-file map

### New backend
- `supabase/migrations/<date>_rep_quests_walkthrough_video_url.sql`

### New admin UI
- `src/components/admin/reps/quest-editor/QuestEditor.tsx`
- `src/components/admin/reps/quest-editor/QuestTypeStep.tsx`
- `src/components/admin/reps/quest-editor/QuestForm.tsx`
- `src/components/admin/reps/quest-editor/QuestPreview.tsx`
- `src/components/admin/reps/quest-editor/QuestChip.tsx`
- `src/components/admin/reps/quest-editor/sections/CoverSection.tsx`
- `src/components/admin/reps/quest-editor/sections/ShareableSection.tsx`
- `src/components/admin/reps/quest-editor/sections/WalkthroughSection.tsx`
- `src/components/admin/reps/quest-editor/sections/PlatformSection.tsx`
- `src/components/admin/reps/quest-editor/sections/ProofSection.tsx`
- `src/components/admin/reps/quest-editor/sections/EventSection.tsx`
- `src/components/admin/reps/quest-editor/sections/RulesSection.tsx`
- `src/components/admin/reps/quest-editor/sections/RewardSection.tsx`
- `src/components/admin/reps/quest-editor/sections/PoolSection.tsx` (thin wrapper)
- `src/lib/quest-readiness.ts`

### Modified
- `src/components/admin/reps/QuestsTab.tsx` — editor replaced
- `src/types/reps.ts` — add `walkthrough_video_url`
- `src/app/api/reps/quests/route.ts` — POST accepts the field
- `src/app/api/reps/quests/[id]/route.ts` — PATCH accepts the field
- `src/app/api/rep-portal/quests/route.ts` — GET returns the field
- `src/app/api/rep-portal/dashboard/route.ts` — same
- `docs/ios-quest-pool-contract.md` — add walkthrough section
- `CLAUDE.md` — document the new field

### Tests
- `src/__tests__/quest-readiness.test.ts`
- `src/__tests__/integration/quest-walkthrough.integration.test.ts`

---

## Cross-cutting rules

- **Visual quality bar:** every new admin surface matches `BrandPreview.tsx` / `FinishSection.tsx`. Apply `docs/admin-ux-design.md` rigorously. Tokens, never hex.
- **Mobile-first 375 px:** start there, enhance up. Touch targets ≥ 44 px. Sticky preview pill on mobile.
- **No tech-speak in copy:** "shareable", "campaign", "walkthrough", "cover" — never "Mux", "Sharp", "tag", "kind", "DTO".
- **Editorial tone:** sentence case. "Create" / "Save" / "Publish" / "Cancel". No exclamations.
- **Animation budget:** one entrance per section open, one micro on the primary CTA. No more.
- **Sentry:** wrap any new API handler with `setSentryOrgContext()`.
- **Supabase clients:** `getSupabaseAdmin()` for data, `getSupabaseServer()` for auth only.
- **No new vendors.** Mux, Sharp, Supabase Storage are the only pipeline pieces.

---

## Decision log

Append entries as `YYYY-MM-DD — decision — rationale`.

- *2026-05-01 — plan created — Harry asked to make Create Quest "unbelievable" UX; the existing 5-tab matrix overwhelms first-timers and a one-screen + chip pattern handles both audiences cleanly. Walkthrough video is folded into the same chip pattern so adding it doesn't push complexity.*
- *2026-05-01 — five quest_types collapse to three visible options — `social_post + story_share + content_creation` consolidate under "Post on social" with a sub-type toggle inside the form. The DB column keeps its 5 values; only the picker layer changes the framing.*
- *2026-05-01 — status dropdown deleted, replaced by Save (draft) + Publish (gated) — mirrors the event editor's gate. Fewer concepts to learn, readiness rules surface what's missing without the host having to know what "active" vs "paused" means until they actually need to pause one.*
- *2026-05-01 — walkthrough video stored as Mux playback id (string), not a separate table — same shape as `video_url`, reuses the existing pipeline, no schema sprawl.*
- *2026-05-01 — phone-frame preview is hand-composed, not a mounted iOS component — matches `BrandPreview` and the canvas editor's `CanvasPreview`. No analytics, no real Mux player mounting in admin (uses static thumbnail with play glyph).*
- *2026-05-01 — `walkthrough_video_url` lives on `ios-quest-pool-contract.md` (not a new doc) — the field rides the same iOS surface (`QuestDetailSheet`) and adding a second contract doc for one optional field would split context. Renamed nothing; just added Section 9 + bumped to v1.1.*

---

## Pickup checklist for the implementer

When the new session starts:

1. Read this file top to bottom.
2. Read `docs/admin-ux-design.md` for the design language.
3. Read `LIBRARY-CAMPAIGNS-PLAN.md` for context on the pool-quest work this sits on top of.
4. Verify file paths still exist (`Read` or `Bash ls`) — codebase moves.
5. Check the **Decision log** for trade-offs already made.
6. Pick Phase 0.1, mark it `🟨`, ship it as the first commit.
7. Move through phases in order. Each phase = one commit. Push when each is solid.
8. Don't batch — ship items individually so progress is real and reversible.
