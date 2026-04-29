# Event Builder — 10/10 Implementation Plan

> **Goal:** take the create-an-event experience from 6.2/10 to 9.5/10 across the whole admin (not just the builder) by end of Phase 3.
> **Scope:** Phases 0–3. Phases 4–6 (tickets-as-heart, architectural debt, polish) deferred until phases 0–3 ship and real promoter feedback returns.
> **Estimated calendar time:** ~12 weeks for a single focused builder.
> **Source audit:** see conversation 2026-04-27 (Harry × Claude). Composite score and weaknesses derived from full code walk of `src/app/admin/events/`, `src/app/admin/onboarding/`, `src/app/api/events/`, and the data model.

---

## How to use this doc

- Each item has a status: `⬜` todo, `🟨` in progress, `✅` done, `⏸️` blocked, `🚫` cancelled.
- When picking work up, scan for `🟨` first (resume), then `⬜` in phase order.
- Update status inline as items complete. Add a one-line outcome note.
- Append to the **Decision log** at the bottom whenever a meaningful trade-off is made.
- Acceptance criteria are the bar. "I changed some code" is not done.

---

## North Star

> A first-time host opens Entry, types in their event name, picks a date and a venue, and within sixty seconds is looking at a beautiful event page on a phone frame that they can edit by clicking anything. As they edit, a Readiness pill climbs from 30% to 100%. When it hits 100%, the Publish button becomes available. Total time elapsed: under five minutes. Zero documentation read.
>
> A pro host opens Entry, duplicates last month's event, edits the date and lineup, and is done in ninety seconds.

Phases 1–3 deliver the first paragraph. The pro flow (duplicate event) is in Phase 4.

---

## Phase 0 — Admin Design Language (target: 2 weeks)

**Why this comes first:** the new event builder must feel premium, but if it's a beacon of quality dropped into a shadcn-default admin shell, the visual gear-shift between `/admin/events/{slug}` and `/admin/orders/` will be jarring. Phase 0 establishes the design language so every subsequent phase applies it consistently — and every existing admin page benefits over time as it gets touched.

**Visual quality bar:** match `BrandPreview.tsx` and `FinishSection.tsx` from the onboarding wizard. Anything less is below standard.

### 0.1 Create `admin-ux-design.md` ✅
**Outcome (2026-04-27):** Shipped at `docs/admin-ux-design.md`. 12 sections covering philosophy, typography, spacing, colour, surfaces, components, empty states, loading, motion, iconography, focus/a11y, density. Includes wrapper-component migration tracker and decision log. Grounded in the existing `BrandPreview.tsx` + `FinishSection.tsx` quality bar.
**Goal:** sibling to `ux-design.md` (which covers the public Midnight surface). The canonical design language for everything inside `/admin/*`.
**Location:** `docs/admin-ux-design.md` (repo, single source of truth). Memory gets a pointer entry only.
**Sections (each must include CSS tokens or class examples):**
1. **Design philosophy** — premium = restraint; admin is a workspace, not a marketing surface; clarity > flourish; mobile-usable but desktop-optimised.
2. **Typography scale** — display / heading / body / label / mono. Sizes, weights, tracking. Clear rules for when to use Space Mono vs Inter (or whatever final stack).
3. **Spacing grid** — 4pt base, named tokens (`space-1` through `space-12`). Card padding rules. Section gaps.
4. **Color tokens** — admin uses Electric Violet primary (`#8B5CF6`); semantic tokens for success/warning/destructive/info; neutral scale for surfaces; explicit dark/light treatment of every token.
5. **Surface treatment** — card vs panel vs sheet vs dialog. Elevation language (admin uses subtle borders + soft shadows, NOT glass — glass is reserved for the public Midnight surface).
6. **Component patterns** — primary/secondary/ghost button, input field with label/hint/error, select, checkbox/toggle, table row, tab, dropdown, dialog, sheet. Each as a code example.
7. **Empty states** — universal pattern: icon + heading + one-line description + primary action. Apply to orders, customers, guest list, events, merch, abandoned carts.
8. **Loading states** — skeleton language (no spinners except for sub-1s actions). Skeletons match the shape of the content they're replacing.
9. **Motion language** — section transitions (200ms ease-out), section pulse on selection (600ms), dialog entrance (300ms cubic-bezier), respect `prefers-reduced-motion`.
10. **Iconography** — single source (lucide-react, weight `1.5px`); rules for icon-with-label vs icon-only; minimum 16×16, default 20×20.
11. **Focus + accessibility** — focus ring treatment on dark admin theme (currently inconsistent), keyboard nav rules, ARIA patterns for collapsible sections.
12. **Density** — comfortable by default, compact mode for power users (deferred to Phase 6 — flag the hook only).
**Acceptance:** every section has visual examples, code snippets, and explicit "do / don't." A dev opening this doc can build a new admin page that visually fits without designer input.

### 0.2 Pilot the language on one existing surface ✅
**Outcome (2026-04-27):** Dashboard now uses `AdminPageHeader` (proper Inter H1, eyebrow + subtitle slot), `AdminCard` for QuickLink tiles, `AdminBadge` for the Live indicator, and the new section spacing. The fresh-tenant case (Phase 1.1) replaces the data shelf with `FreshTenantHero`. Side-by-side with onboarding Finish: visual rhythm matches; no gear-shift between the two surfaces.
**Goal:** validate the design language on a real page before applying it to the new builder. Pick `/admin/page.tsx` (the dashboard) — it's already getting the empty-state hero in 1.1, so this overlaps cleanly.
**Files:** `src/app/admin/page.tsx`, `src/app/admin/layout.tsx`, the sidebar component, the dashboard hero card.
**Specific changes:**
- Apply new typography scale to the dashboard heading + KPI labels.
- Apply new spacing grid to KPI card padding + gaps.
- Apply new surface treatment to KPI cards, presence cards, event spotlight.
- Apply new motion language to checklist expand/collapse + card hover.
- Apply new empty-state pattern to the live feed when no activity.
- Apply new loading skeleton pattern to the revenue hero + KPI cards on initial load.
**Acceptance:** the dashboard visually matches the quality bar of `FinishSection.tsx`. Side-by-side comparison: the gear-shift between dashboard and onboarding finish is gone. Mobile dashboard feels designed-for-mobile, not shrunk-desktop.

### 0.3 Apply language tokens to the admin shell ✅
**Outcome (2026-04-27):** Mobile drawer overlay uses `bg-background/70` instead of hardcoded `bg-black/70`, with a fade-in animation. Header `Live` indicator uses the canonical `AdminBadge` variant=success+dot — same treatment everywhere. Sidebar typography (Inter body, Space Mono nav labels) was already on-spec; tab order and active states confirmed correct.
**Goal:** the bits visible on every admin page — sidebar, top bar, breadcrumb, mobile hamburger drawer.
**Files:** `src/app/admin/layout.tsx`, sidebar component (find via grep — likely `src/components/admin/Sidebar.tsx` or similar).
**Acceptance:** sidebar typography matches new scale; active-state treatment uses new motion language; mobile drawer uses new sheet pattern; breadcrumb uses new label typography. Every admin page inherits the upgraded shell automatically.

### 0.4 Document component upgrade strategy ✅
**Goal:** decide explicitly: do we override shadcn defaults globally (one diff, every page benefits, slight risk of regression), or build wrapper components in `src/components/admin/ui/` that consume the design language and migrate page-by-page?
**Output:** a 1-page decision in `admin-ux-design.md` Section 6 with the choice, the rationale, and the migration path.
**Decision (2026-04-27):** wrapper components. Global overrides on shadcn defaults silently break things at random; wrappers are safer, explicit, and let us track migration progress.
**Acceptance:** decision committed, first wrapper component (probably `<AdminButton>`) built and used in 0.2's dashboard pilot.

**Outcome (2026-04-27):** Built first wave of wrappers in `src/components/admin/ui/`: `AdminButton` (primary/secondary/outline/ghost/destructive/link variants, sm/md/lg/icon sizes, loading + leftIcon/rightIcon props, focus ring baked in), `AdminCard` + `AdminCardHeader`/`AdminCardContent`/`AdminCardFooter`/`AdminCardTitle`/`AdminCardDescription` + `AdminPanel`, `AdminEmptyState`, `AdminPageHeader`, `AdminSkeleton`, `AdminBadge` + `AdminStatusBadge`. Barrel export at `src/components/admin/ui/index.ts`. Subsequent phases add more (Input, Select, Dialog, Table, Toast) as they're needed — no need to build the whole library before using any of it.

### Phase 0 done = design language doc shipped, dashboard pilot live, admin shell uses new language. Estimated ship: 10 working days.

---

## Phase 1 — Quick Wins (target: 2 weeks)

The cheap, high-impact fixes. None of these need the canvas; they ship independently and immediately raise the floor.

### 1.1 Dashboard empty-state hero ✅
**Outcome (2026-04-27):** `FreshTenantHero` ships at `src/components/admin/dashboard/FreshTenantHero.tsx`. Renders when `event_count === 0` for non-platform-owners; replaces the data shelf (RevenueHero, KPIs, funnel, spotlight, feed) with three deliberate next-step tiles (Create event, Connect payments, Customise storefront). Tiles auto-show a "Done" check when their underlying state is satisfied. Accent halo behind the Display heading mirrors `FinishSection.tsx`. `OnboardingChecklist` and `QuickLinks` still surface below.
**Goal:** when `event_count === 0`, the dashboard shows a single "Let's go live" hero card with three big tiles (Create event / Connect Stripe / Customize storefront) instead of a sea of zero-value KPI widgets.
**Files:** `src/app/admin/page.tsx`. New component `src/components/admin/FreshTenantHero.tsx`. Visual quality must match `FinishSection.tsx`.
**Design language:** apply `admin-ux-design.md` Sections 1–9. Use the empty-state pattern (Section 7) as the structural backbone; treat the hero as a "moment" not a card (closer to a `<section>` with halo treatment than a normal admin card).
**Acceptance:**
- New tenant lands on `/admin` → sees hero only (no zero-value KPI cards).
- After first event exists → hero disappears, normal dashboard returns.
- `OnboardingChecklist` still surfaces below.
- Mobile: hero stacks to single column, tiles are full-width 64px-tall touch targets.
- Side-by-side with onboarding Finish: visual quality is indistinguishable.

### 1.2 Friendly slug-collision error ✅
**Outcome (2026-04-27):** `POST /api/events` catches Postgres `23505` and returns `{ error, code: "slug_taken", suggestions: [...3 free alts] }` (HTTP 409). Suggestions try `-2`, `-pt2`, `-{year}`, with fallbacks to `-3` / `-encore` / `-{year+1}` and a DB pre-check so every chip is actually free. Events list-page Create form renders the suggestions as clickable chips that overwrite the slug input. Loading and error copy use ellipsis (`…`) per design doc.
**Goal:** stop showing raw Postgres `duplicate key value violates unique constraint` to users.
**Files:** `src/app/api/events/route.ts` (POST handler ~line 91). Catch error code `23505`, return `{ error: "An event with that URL already exists. Try ${suggestion1}, ${suggestion2}, or ${suggestion3}." }` with 3 generated alternatives (append `-2`, `-pt2`, `-{year}`).
**Acceptance:** creating a duplicate slug returns a humanised 409 with 3 suggested slugs. UI shows the suggestions as clickable chips.

### 1.3 Pre-publish gates: zero tickets, zero capacity, past date ✅
**Outcome (2026-04-27):** `PUT /api/events/[id]` runs three gates in cost order before transitioning to live: (1) `date_start > now()`, (2) at least one active ticket type with capacity > 0 or null, (3) Stripe Connect verified (existing). Each returns 400 with a friendly message + a `code` (`live_gate_past_date|no_tickets|no_stripe|stripe_unverified`). SettingsTab pre-flights the same checks client-side so the host sees the blocker inline before clicking Save. Platform owners stay exempt across all three.
**Goal:** block `status='live'` transition when the event isn't actually sellable. Same gate location as the existing Stripe check.
**Files:** `src/app/api/events/[id]/route.ts` (~line 91, `isAlreadyLive` short-circuit). Add three checks before Stripe:
1. At least one `ticket_types` row with `status='active'` AND `capacity > 0` (or `capacity IS NULL` for unlimited).
2. `date_start > now()`.
3. (Stripe gate stays last — it's the most expensive check.)
**Error responses:** 400 with friendly messages: "Add a ticket on sale before going live" / "Event date must be in the future" — match the tone of the existing Stripe message.
**Client:** Settings tab "Go Live" button shows the same reasons inline before user clicks.
**Acceptance:** every failure path returns a tenant-friendly message and a deep-link to the relevant tab/section.

### 1.4 VAT-inclusive price preview on ticket cards ✅
**Outcome (2026-04-27):** TicketsTab now resolves the effective VAT mode (event override → org default → off) and passes `vatEnabled / vatRate / vatIncludesPrice` into TicketCard. TicketCard renders `Buyer pays £X (incl. £Y VAT @ rate%)` under the price input via `calculateVat()` from `lib/vat.ts`. Hidden when VAT is off, when the price is zero, or when no rate is configured. Updates live on every price/rate edit.
**Goal:** under each ticket price input in `TicketCard.tsx`, render `Buyer pays £{total} (incl. £{vat_portion} VAT)` when VAT is enabled on the event.
**Files:** `src/components/admin/event-editor/TicketCard.tsx`. Use the same VAT logic that powers checkout (`lib/vat.ts` or equivalent — verify path during execution).
**Acceptance:** changing the price or toggling `vat_prices_include` updates the preview line in real time. Hidden when VAT mode is "disabled" or "use org default + org has no VAT."

### 1.5 Merge duplicate delete-event buttons ✅
**Outcome (2026-04-27):** Removed the inline Yes/No confirm flow from the events list rows. The list keeps Archive (reversible) as the only row-level destructive-ish action; permanent delete lives in the editor (`EventEditorHeader` → existing Dialog). One canonical flow, one place to keep up-to-date.
**Goal:** the events list row and the editor header both have separate delete UIs. Pick one (editor header dialog) and remove the other.
**Files:** `src/app/admin/events/page.tsx` (remove inline row delete), `src/components/admin/event-editor/EventEditorHeader.tsx` (keep dialog). List row keeps a "..." menu that opens the editor focused on the delete dialog, or just the editor link.
**Acceptance:** one canonical delete flow, with confirmation dialog, accessible from one place.

### 1.6 Persist OnboardingChecklist collapsed state ✅
**Outcome (2026-04-27):** Added `entry_onboarding_collapsed:{orgId}` to localStorage alongside the existing dismissed-key. Collapse → reload → still collapsed. Per-org so a user with multiple orgs sees independent state. Idempotent removal when expanded so we don't accumulate dead keys.
**Goal:** stop re-expanding on every visit.
**Files:** `src/components/admin/OnboardingChecklist.tsx`. Add `localStorage` key `entry_onboarding_collapsed_${orgId}`.
**Acceptance:** collapse → reload → still collapsed. Per-org (a user with two orgs sees independent states).

### 1.7 Place autocomplete on venue + city ⏸️
**Status (2026-04-27):** BLOCKED on vendor decision. Checked `.env.local` and `package.json` — no Google Places, Mapbox, or geocoder keys / dependencies. Per the rule "do not add new vendor without checking", surfacing to user before committing one. Three options: (a) Google Places (~£200/mo for autocomplete + place details, gold standard for venue lookup), (b) Mapbox (similar pricing, simpler API), (c) Nominatim/OSM (free, but TOS restricts production-scale commercial use; rate-limited). Phase 2.2 (Start moment venue input) re-uses this component, so unblocking should happen before Phase 2 work.
**Goal:** stop relying on free-text typos.
**Files:** `DetailsTab.tsx` (the venue/city inputs). Integrate Google Places (or Mapbox if cheaper — check existing API keys in `.env.local` first; do not add new vendor without checking).
**Storage:** populate `venue_name`, `venue_address`, `city`, `country` from the place result. Keep the underlying inputs editable.
**Acceptance:** typing a venue name shows up to 5 suggestions; selecting one fills all four fields. Manual override still allowed. Mobile keyboard-friendly.

### 1.8 Kill the lineup "legacy mode" UI ✅
**Outcome (2026-04-27):** Pre-flight via Supabase MCP showed 11 events with legacy `lineup` arrays (only 1 lacked an `event_artists` row). Idempotent migration `migrate_legacy_event_lineup_to_event_artists` walks each legacy event and inserts artist + event_artists rows (case-insensitive dedupe within the org), preserving original ordering. Verified: zero events left with legacy-only lineup. ContentTab no longer renders the LineupTagInput fallback; `src/components/admin/LineupTagInput.tsx` deleted. The `events.lineup` column is left in place — Phase 5 architectural-debt work removes it.
**Goal:** stop telling users about tech debt.
**Files:** `src/components/admin/LineupTagInput.tsx` (remove the "Or add names manually (legacy mode)" branch from `ContentTab.tsx`). Migrate any existing string-array `events.lineup` rows into `event_artists` via a one-shot migration (use Supabase MCP `apply_migration`).
**Acceptance:** ContentTab shows only `ArtistLineupEditor`. Existing events with legacy `lineup` arrays load with their artists already in the catalog. `LineupTagInput.tsx` deleted from the codebase.

### 1.9 Unify CTA verbs across wizard + editor ✅
**Outcome (2026-04-27):** Editorial tone adopted (the plan's recommended option). Identity → "Next", Branding → "Next", Finish → "Open dashboard" (kept), Editor → "Save" (was "Save Changes"), List Create → "Create event" (was Title Case). Loading copy uses the proper ellipsis `…` everywhere. Tone document committed inline at `docs/admin-ux-design.md` Section 11.5 with rationale and the loading-state mappings.
**Goal:** consistent voice. Today: "Create my space" / "Continue" / "Open dashboard" / "Save changes" / "Save" — three different tones.
**Decision needed:** pick one of:
- Apple-style: "Continue / Continue / Done / Save"
- Stripe-style: "Save / Activate / Publish / Save"
- Editorial-style (recommended for FERAL): "Next / Next / Open dashboard / Save"
**Files:** `IdentitySection.tsx`, `BrandingSection.tsx`, `FinishSection.tsx`, `EventEditorHeader.tsx`, list-page Create button.
**Acceptance:** one tone document committed alongside this doc; all CTAs match.

### 1.10 Kill list ✅
**Outcome (2026-04-27):** Verified via Supabase MCP that ZERO tenants have aura as their active template (`active_template !== "aura"` for all 13 themes settings rows). Migrated the sticky-checkout-bar toggle from `/admin/event-page/` into the editor's SettingsTab (new "Mobile Experience" card). Then deleted: `src/app/admin/event-page/`, `src/app/admin/health/`, `src/components/aura/` (18 files), `src/lib/themes.ts` (only consumer was the aura branch). Stripped the `if (template === "aura")` branches from `src/app/event/[slug]/page.tsx` and `.../checkout/page.tsx`; `src/app/event/[slug]/layout.tsx` now hard-codes `data-theme="midnight"` instead of fetching the active template. Updated `auth.test.ts` to point at `/admin/backend/health/` instead of the removed `/admin/health/`. CLAUDE.md Project Structure + Theme System + Admin Pages Index + Known Gaps all updated.
- Delete `/src/app/admin/event-page/` (deprecated; move its single sticky-bar toggle into Settings tab first).
- Delete `/src/app/admin/health/` (deprecated, → `/admin/backend/health/`).
- Delete `/src/components/aura/` (18 files; theme deprecated 2025-02-25).
**Acceptance:** routes return 404; no broken imports; CLAUDE.md "Known Gaps" updated.

### Phase 1 done = ✅ on every item above. Estimated ship: 10 working days.

---

## Phase 2 — The Start Moment (target: 2.5 weeks)

Replace the "click Create Event → inline form on a list page → land in a 6-tab spreadsheet" flow with a single full-screen guided start that drops the user into the canvas with content already populated.

### 2.1 New route: `/admin/events/new` ⬜
**Goal:** dedicated full-screen start experience, separate from the events list.
**Files:** new `src/app/admin/events/new/page.tsx`. List-page "Create Event" button now links here instead of toggling an inline form.
**Layout:** mirrors the visual quality of `FinishSection.tsx` — full-screen, no admin chrome, accent halo, narrative pacing.
**Design language:** full application of `admin-ux-design.md`. This is the showcase moment — the first time a host meets the rebuilt product. Treat it like the onboarding wizard's Finish screen, not a normal admin form.

### 2.2 Four-question Start form ⬜
**Goal:** ask only what a human must answer.
1. **What's it called?** — text input + live slug availability check (reuse `IdentitySection.tsx` pattern with `/api/auth/check-slug`-equivalent for events).
2. **When?** — date + start time. Prefill: next Saturday, 21:00 in org timezone.
3. **Where?** — venue + city via Place autocomplete (same component built in 1.7).
4. **What kind?** — visual picker: `Concert / Club night / Festival / Conference / Private event`. Each is a tile with a tiny icon + one-line description.
**Acceptance:** all four answerable in under 60 seconds. CTA enabled only when name + date are valid.

### 2.3 Event-type templates ⬜
**Goal:** the "what kind?" answer pre-populates ticket types, lineup section visibility, content sections, theme defaults.
**Files:** new `src/lib/event-templates.ts` exporting:
```ts
type EventTemplate = {
  key: 'concert' | 'club' | 'festival' | 'conference' | 'private';
  ticket_types: Partial<TicketTypeInput>[];
  default_theme: 'midnight';
  show_lineup: boolean;
  default_tag_line?: string;
  default_about_text?: string;
  recommended_image_aspect: 'square' | 'portrait';
};
```
**Concrete templates:**
- **Concert:** GA + VIP (with merch bundle slot)
- **Club:** Early bird + General + Door
- **Festival:** Day 1 / Day 2 / Weekend (3 tiers, sequential release on)
- **Conference:** Early bird + Standard + Group
- **Private:** Single ticket "Entry" + invite-only visibility default
**Acceptance:** picking a template + completing the start form creates an event with those tickets pre-filled, all editable in the canvas.

### 2.4 Generated cover image fallback ⬜
**Goal:** a brand-new event never appears with a grey placeholder. Auto-generate a poster-quality cover via `next/og` using the event name, venue, date, and the org's accent color.
**Files:** new `src/app/api/og/event-cover/route.ts` (returns PNG via `next/og`'s `ImageResponse`). Save the rendered PNG to Supabase Storage on event creation, store URL in `cover_image_url`.
**Visual:** large display-font event name + small venue + date + tenant logo bottom-right + brand-color gradient bg. Same typography stack as the public event page (Space Mono / Inter).
**Acceptance:** fresh event has a striking cover before the host uploads anything. Replacing it in the canvas works as before.

### 2.5 Wire Start → canvas ⬜
**Goal:** submitting the Start form creates the event via existing `POST /api/events` (extended to accept template key) and routes to `/admin/events/{slug}` — which in Phase 3 becomes the canvas.
**Files:** `POST /api/events/route.ts` accepts new optional `template: 'concert' | 'club' | ...` field. Server expands the template into the event + ticket_types insert.
**Acceptance:** "Five-clicks-and-zero-atmosphere" flow becomes "two-screens-and-you're-editing-something-beautiful."

### 2.6 First-event analytics ⬜
**Goal:** instrument the new flow so we know if it's working.
**Files:** add `track('first_event_started')`, `track('first_event_template_picked', { template })`, `track('first_event_created', { time_to_create_seconds })` to existing analytics layer (find via grep for `useEventTracking` or similar).
**Acceptance:** numbers visible in whatever dashboard the team uses. Without measurement we won't know if 60 seconds is real.

### Phase 2 done = `/admin/events/new` ships, used by 100% of new events, drops users into the canvas (Phase 3) with content. Estimated ship: 12–13 working days.

---

## Phase 3 — The Canvas + Live Preview (target: 5 weeks)

The big one. Replace the 6-tab editor with a two-pane canvas: scrollable narrative form on the left, live phone-frame event-page preview on the right.

### 3.1 Refactor editor route into canvas shell ⬜
**Goal:** strip `Tabs` from `src/app/admin/events/[slug]/page.tsx`. Replace with two-column layout: form (40%) + preview (60%). Mobile: form full-width, preview behind a floating "Preview" pill that opens as a sheet.
**Files:** `src/app/admin/events/[slug]/page.tsx`. New `src/components/admin/canvas/CanvasShell.tsx`, `CanvasFormPane.tsx`, `CanvasPreviewPane.tsx`.
**Save model:** keep the central "Save changes" button in the header (the audit confirmed users like the explicit save). State management identical to today.
**Design language:** canvas shell uses the surface treatment from `admin-ux-design.md` Section 5. The form pane is a workspace; the preview pane is a stage. Different visual weight, same design language.
**Acceptance:** existing editor still functional, just visually re-laid-out. No tabs anywhere. All existing fields reachable. Section dividers, scroll behaviour, and shadows match the design language doc.

### 3.2 Narrative section structure ⬜
**Goal:** the form pane is six sections in the order a host actually thinks, not in alphabetical-tab order.
1. **Identity** — name, slug, date, venue, city, capacity, age
2. **Story** — tag line, about, lineup, details
3. **Look** — cover image, banner, poster, theme picker
4. **Tickets** — ticket types (Phase 4 enhancements come here)
5. **Money** — currency, multi-currency, VAT, payment method, Stripe account, external link
6. **Publish** — status, visibility, announcement mode, hype queue, sale window, SEO
**Files:** new section components under `src/components/admin/canvas/sections/`. Each is collapsible with a chevron header showing completeness pill (`3/4`).
**Acceptance:** every field from the old 6-tab editor lives in exactly one section. Order is the canonical order. Collapsing/expanding is per-section, persisted to `localStorage`.

### 3.3 Live preview pane ⬜
**Goal:** the right pane renders the actual public `MidnightEventPage` in a phone frame, fed by current form state (not saved DB state).
**Files:** new `src/components/admin/canvas/PreviewPane.tsx`. Reuse `BrandPreview.tsx`'s phone-frame chrome. Inside the frame, mount the real `MidnightEventPage` component with a `previewState` prop overriding the DB-loaded event.
**Performance:** debounce form-state → preview-render at 150ms. Use `useDeferredValue` for non-critical updates (description text). Image uploads: render a blob URL immediately, swap to the uploaded URL when complete.
**Acceptance:** type in the name field → preview headline updates in <200ms. Drag to reorder a ticket → preview list reorders. Toggle hype queue → preview swaps to queue page.

### 3.4 Click-to-scroll-sync between form and preview ⬜
**Goal:** clicking a section header in the form pane scrolls the preview to the matching block and pulses it for 600ms. Hovering a ticket card in the form pulses the matching ticket in the preview.
**Files:** ref-passing between sections + preview blocks. New hook `useCanvasSync()` managing the active section anchor.
**Acceptance:** click "Story" header → preview scrolls to about/lineup section with a soft pulse. Reverse direction (click preview → scroll form) is **out of scope for this phase** — too fiddly, low value.

### 3.5 Readiness scoring engine ⬜
**Goal:** real-time grading. Sticky card in the right rail (above the preview frame) shows:
```
Readiness  •  72%
✓ Date and venue set
✓ Cover image uploaded
✓ At least one ticket on sale
⚠ No description (buyers convert lower without one)
✗ Stripe payouts not verified
```
**Files:** new `src/lib/event-readiness.ts` exporting `assessEvent(event, ticketTypes, orgState): ReadinessReport` (pure function, deterministic). Rules:

| Rule | Severity | Weight |
|---|---|---|
| date_start in future | required | 20 |
| At least 1 active ticket type with capacity | required | 20 |
| Stripe Connect verified (or non-stripe payment_method) | required | 20 |
| Cover image present | required | 10 |
| Description ≥ 80 chars | recommended | 10 |
| Lineup populated (if event-type implies one) | recommended | 5 |
| SEO title set | recommended | 5 |
| Doors time set | recommended | 5 |
| Banner image present | nice-to-have | 5 |
**Acceptance:** all rules update in real time as the form edits. Weights sum to 100. "Publish" button disabled when any required rule fails — disabled state shows the failing reasons inline.

### 3.6 Publish flow ⬜
**Goal:** replace the current Settings-tab "Status" dropdown with a dedicated Publish moment in the right rail. Big button, gated by Readiness, animates to a confetti-free "You're live" sheet on success with copyable link + share-to-Instagram CTA.
**Files:** new `src/components/admin/canvas/PublishCard.tsx`. Status dropdown still exists for advanced cases (cancelled, archived, draft) but Publish is the primary action.
**Acceptance:** going live from a fresh draft is one button + one confirmation, not "find the right tab → find the dropdown → save changes."

### 3.7 Mobile canvas ⬜
**Goal:** below `lg:` breakpoint, form is full-width, preview is a floating "Preview" pill bottom-right that opens a full-screen sheet (matching the wizard's mobile preview pattern from `Shell.tsx`).
**Files:** `CanvasShell.tsx` responsive logic. New `CanvasPreviewSheet.tsx`.
**Acceptance:** at 375px, every form field is reachable, every touch target ≥44px, preview sheet opens smoothly, sections feel native (not shrunk-desktop).

### 3.8 Image-upload UX upgrade ⬜
**Goal:** the Look section shows three slots (cover, banner, poster) with **example silhouettes** of where each appears on the event page (so hosts know what they're uploading and why).
**Files:** `src/components/admin/canvas/sections/LookSection.tsx`. Replace `ImageUpload` slots with `ImageSlot` showing: aspect-ratio guidance, where-it-appears mini-thumbnail, drag-drop, paste-from-clipboard support, blob-URL immediate preview.
**Acceptance:** uploading a wrong-aspect image shows a friendly "this is portrait but should be landscape — crop now?" inline cropper. No silent acceptance.

### 3.9 Polish + accessibility pass ⬜
**Goal:** the canvas feels like a finished product, not an internal tool.
**Checks:**
- Every section header has ARIA `aria-expanded`.
- All form controls have labels (audit current state — many are placeholder-only).
- Keyboard nav: tab order matches visual order, no traps.
- Reduced-motion respected on the readiness pulse and section transitions.
- Color contrast: section headers and the readiness pill must hit AA on the dark admin theme.
- Loading state: switching events shows a coherent skeleton, not a layout shift.
**Acceptance:** Lighthouse accessibility ≥95 on the canvas page. Manual keyboard-only walkthrough completes a full event creation.

### 3.10 Kill the old editor ⬜
**Goal:** delete dead code.
**Files:** old tab components in `src/components/admin/event-editor/` that are no longer mounted (`ContentTab.tsx`, `DetailsTab.tsx`, `DesignTab.tsx`, `TicketsTab.tsx`, `SettingsTab.tsx`, `WaitlistTab.tsx`) — they get replaced by canvas section components. Keep ones that the canvas re-uses (`TicketCard.tsx`, `GroupManager.tsx`, `ArtistLineupEditor.tsx`, `EventEditorHeader.tsx`, `SeoCard.tsx`).
**Acceptance:** no orphan imports; `npm run build` clean; bundle size measurably smaller.

### Phase 3 done = canvas live, all tenants on it, old editor deleted, readiness scoring live, mobile QA passed. Estimated ship: 25 working days.

---

## Out of scope (deferred to Phases 4–6)

Documented here so they don't get scope-crept into 1–3:

- **Phase 4 — Tickets as the heart:** timeline view, "what-if" sales velocity, tier templates beyond basics, sequential release time-to-unlock estimates.
- **Phase 5 — Architectural debt:** base64 → Supabase Storage migration for cover/hero, RPC transaction wrapper for `PUT /api/events/[id]`, Zod schemas at the API boundary, deduplicate `events.lineup` vs `event_artists`, drop legacy `cover_image` column.
- **Phase 6 — Polish + duplication:** "Duplicate event" feature, scheduled publish (`publish_at` cron), batch edit, share-to-stories template variants, Onboarding Progress micro-interaction on dashboard.

When Phases 1–3 ship, re-prioritise based on real promoter feedback before committing to 4.

---

## Cross-cutting requirements (apply to every item)

- **Visual quality bar:** every new admin surface must match `BrandPreview.tsx` / `FinishSection.tsx`. Apply `admin-ux-design.md` (Phase 0.1) to typography, spacing, color, components, empty states, loading, motion, focus. If it doesn't match, it isn't done.
- **Multi-tenant:** every change must work for non-FERAL orgs. Mentally test with `org_id = "skiddle-test"` or similar.
- **Mobile-first:** start at 375px, enhance up. Touch targets ≥44px.
- **Production-grade:** no TODO placeholders. Loading, error, and empty states for every new surface — all using the patterns defined in `admin-ux-design.md`.
- **Tests:** every new lib function gets a Vitest unit test. Pre-publish gate changes (1.3) require integration tests under `npm run test:integration`. New hooks need tests.
- **No new Supabase clients:** use `getSupabaseAdmin()` for data, `getSupabaseServer()` for auth only. Wrong client = silent data loss.
- **Sentry:** wrap new API handlers with the existing `setSentryOrgContext()` pattern.
- **CLAUDE.md updates:** when a phase ships, update the relevant section + Known Gaps + Admin Pages Index.
- **Pilot, then propagate:** if you touch an existing admin page that hasn't been upgraded to the new design language, upgrade the bits you touch (don't leave a Frankenstein page). Maintain a running list at the bottom of `admin-ux-design.md` of which pages have been migrated.

---

## Decision log

Append entries as `YYYY-MM-DD — decision — rationale`.

- *2026-04-27 — plan created — phases 1–3 committed; phases 4–6 deferred pending real promoter feedback after Phase 3 ships.*
- *2026-04-27 — Phase 0 added (Option B chosen) — admin design language doc + dashboard pilot precede the builder rebuild, so the new builder doesn't visually clash with the rest of admin. +2 weeks calendar; raises ceiling from 8.7/10 (builder only) to ~9.5/10 (whole admin). Migration is per-page as work touches them, not a big-bang refactor.*
- *2026-04-27 — list-row Delete removed entirely (Phase 1.5) — instead of "..." menu deep-linking to the editor's dialog, just removed the row-level Delete. Archive remains as the reversible row-level action; permanent delete lives in the editor. Cuts the surface area of "two confirm-delete UIs to keep in sync" to one.*
- *2026-04-27 — Phase 1.7 (Place autocomplete) deferred mid-Phase-1 — no Google/Mapbox vendor configured and the plan explicitly says "do not add new vendor without checking". Surfacing options for user decision. Phase 2.2 unblocks once vendor is chosen.*
- *2026-04-27 — Aura deletion went deeper than planned — the kill list naming `/components/aura/` understated the actual blast radius: also removed `lib/themes.ts`, the `getActiveTemplate()` plumbing in `event/[slug]/page.tsx`, `.../checkout/page.tsx`, and `.../layout.tsx`. Verified zero live tenants on aura first via Supabase MCP. The single-theme assumption is now baked in at the layout level (`dataThemeAttr = "midnight"`).*
- *2026-04-27 — admin Display font corrected from Inter to Space Mono in design doc — `FinishSection.tsx` was named the quality bar but uses Space Mono. Aligning the doc to the implementation rather than retrofitting FinishSection. Display still reserved for hero moments only; workspace pages use Inter H1.*

---

## Pickup checklist for a future session

1. Read this file top to bottom.
2. Scan statuses: `🟨` first, then `⬜` in phase order.
3. Read `CLAUDE.md` for current platform state (it may have moved since this plan was written).
4. Verify the assumed file paths still exist (`Read` or `Bash ls`) — codebase moves.
5. Check the **Decision log** for trade-offs already made.
6. Pick one item, mark it `🟨`, work on it, ship it, mark `✅` with a one-line outcome note.
7. Don't batch — ship items individually so progress is real and reversible.
