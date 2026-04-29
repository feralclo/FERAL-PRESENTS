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

### 1.7 Place autocomplete on venue + city ✅
**Outcome (2026-04-29):** Vendor decided: Google Places API (New). Built `<PlaceAutocomplete>` at `src/components/admin/PlaceAutocomplete.tsx` — direct browser calls (key restricted by HTTP referrer in Google Cloud), debounced 250ms, max 5 suggestions, keyboard nav (Up/Down/Enter/Escape), session-token bundling for combined autocomplete+details billing, "Powered by Google" attribution per TOS. Wired into the events list create-form (venue + city) and the editor's DetailsTab. Selecting a venue auto-fills address + city + country only when those fields are blank, so a host who's edited details by hand isn't overwritten on a re-pick. Graceful fallback to plain `<Input>` when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is missing — local dev and tests stay usable without the key. Phase 2.2 (Start moment venue input) reuses this component as-is.
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

### 2.1 New route: `/admin/events/new` ✅
**Outcome (2026-04-29):** Shipped at `src/app/admin/events/new/page.tsx`. Added `isStartMomentRoute` to the admin layout's bypass list so the page renders without sidebar/header — same pattern onboarding uses. The shell mirrors `FinishSection.tsx`'s visual register (Entry wordmark + Cancel back-link in the top bar, accent halo behind the heading, mono Display "Start with the basics.", muted-foreground subtitle, fade-in entrance). Form is the Phase 2.1 baseline only — name, date+time, venue, city via `PlaceAutocomplete` (auto-fills city from venue selection), `AdminButton` primary CTA "Create event" with loading state, and the same Phase 1.2 slug-collision suggestion-chip flow (now one-click — chips re-submit with the picked slug). On success routes to `/admin/events/{slug}/`. List-page Create button + empty-state Create button rewired to `<Link href="/admin/events/new/">`; the inline create form on the list (and its `showCreate`/`newName`/`newSlug`/etc. state, `handleCreate`, `slugify`, `Select`/`DateTimePicker`/`PlaceAutocomplete`/`Input` imports) deleted — one canonical entry point. Phase 2.2 layers the "what kind?" tile picker + live slug check inside this same shell; 2.3 seeds tickets via templates; 2.4 generates a cover.
**Goal:** dedicated full-screen start experience, separate from the events list.
**Files:** new `src/app/admin/events/new/page.tsx`. List-page "Create Event" button now links here instead of toggling an inline form.
**Layout:** mirrors the visual quality of `FinishSection.tsx` — full-screen, no admin chrome, accent halo, narrative pacing.
**Design language:** full application of `admin-ux-design.md`. This is the showcase moment — the first time a host meets the rebuilt product. Treat it like the onboarding wizard's Finish screen, not a normal admin form.

### 2.2 Four-question Start form ✅
**Outcome (2026-04-29):** `/admin/events/new` now asks four questions, in human-think order. (1) "What kind?" tile picker — 5 templates with icon + one-line blurb, click to select / click again to clear, accent-tinted active state with corner check pill. (2) "What's it called?" — text input + live slug indicator powered by new `GET /api/events/check-slug?slug=…` (auth-required, org-scoped, 30/min rate limit, 300ms debounce, status pill: idle / checking / available / taken). (3) "When?" — `DateTimePicker` prefilled to next Saturday 21:00 in the user's local timezone via `nextSaturdayAt9pm()`. (4) "Where?" — venue + city via `PlaceAutocomplete` (selecting a venue auto-fills city when blank, same as 1.7). CTA disabled until name + date are valid AND slug isn't mid-check. Phase 1.2 slug-collision suggestion chips still kick in on 409 — chips re-submit with the picked slug in one click.
**Goal:** ask only what a human must answer.
1. **What's it called?** — text input + live slug availability check (reuse `IdentitySection.tsx` pattern with `/api/auth/check-slug`-equivalent for events).
2. **When?** — date + start time. Prefill: next Saturday, 21:00 in org timezone.
3. **Where?** — venue + city via Place autocomplete (same component built in 1.7).
4. **What kind?** — visual picker: `Concert / Club night / Festival / Conference / Private event`. Each is a tile with a tiny icon + one-line description.
**Acceptance:** all four answerable in under 60 seconds. CTA enabled only when name + date are valid.

### 2.3 Event-type templates ✅
**Outcome (2026-04-29):** `src/lib/event-templates.ts` exports 5 canonical templates (Concert / Club night / Festival / Conference / Private) with seed `ticket_types`, `show_lineup`, `default_visibility`, `recommended_cover_aspect`, lucide icon name, and a one-line blurb consumed by the picker. Pure data + `getEventTemplate()` accessor + `isEventTemplateKey()` type guard. Pricing is a sensible placeholder, not a recommendation — hosts adjust immediately. Group / sequential-release wiring lives in the Tickets tab JSONB and is **not** written by templates today (Festival's three tiers ship plain — flag in plan to revisit if telemetry shows hosts always toggling sequential mode). 7 unit tests (`src/__tests__/event-templates.test.ts`) cover key set, ticket shape, sort-order monotonicity, visibility/lineup defaults, and the accessor.
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

### 2.4 Generated cover image fallback ✅
**Outcome (2026-04-29):** `GET /api/og/event-cover` shipped at `src/app/api/og/event-cover/route.tsx` (edge runtime, `next/og` ImageResponse — same family as `brand/logo-png`). Query params: `name`, `venue`, `date` (ISO), `accent` (hex), `variant` (square 1080² / portrait 1080×1350 / landscape 1200×630). Visual: radial gradient seeded from the org accent in the top-left, fading to near-black void; eyebrow "NEW EVENT" with accent dot at top, big white headline middle, mono venue · date line, faint ENTRY wordmark bottom-right. Heuristic `headlineSizeFor()` clamps the type to fit narrow widths without wrapping. Cache headers: 1d s-maxage + 7d SWR. Route added to middleware's `PUBLIC_API_PREFIXES` under `/api/og/`. Stored as a **content-addressed URL** in `events.cover_image_url` — no Supabase Storage round-trip; replacement on real upload just overwrites the field. POST `/api/events` populates it automatically when no cover is supplied (uses template's `recommended_cover_aspect`). Org accent looked up via `readOrgAccent()` with platform Electric Violet fallback.
**Goal:** a brand-new event never appears with a grey placeholder. Auto-generate a poster-quality cover via `next/og` using the event name, venue, date, and the org's accent color.
**Files:** new `src/app/api/og/event-cover/route.ts` (returns PNG via `next/og`'s `ImageResponse`). Save the rendered PNG to Supabase Storage on event creation, store URL in `cover_image_url`.
**Visual:** large display-font event name + small venue + date + tenant logo bottom-right + brand-color gradient bg. Same typography stack as the public event page (Space Mono / Inter).
**Acceptance:** fresh event has a striking cover before the host uploads anything. Replacing it in the canvas works as before.

### 2.5 Wire Start → canvas ✅
**Outcome (2026-04-29):** `POST /api/events` now accepts an optional `template` field. When present AND `ticket_types` is empty/undefined, the server expands the template's seeds into the `ticket_types` insert via the existing mapper (`TicketTypeSeed` is structurally compatible). When `visibility` is omitted, the resolved value falls back to `template.default_visibility` (so private templates land private without the form having to pass it through). When `cover_image` and `cover_image_url` are both omitted, the server populates `cover_image_url` with the deterministic OG URL (Phase 2.4) using the org's branding accent and the template's `recommended_cover_aspect`. On success the existing `router.push("/admin/events/{slug}/")` lands the host in the editor — which becomes the canvas in Phase 3.
**Goal:** submitting the Start form creates the event via existing `POST /api/events` (extended to accept template key) and routes to `/admin/events/{slug}` — which in Phase 3 becomes the canvas.
**Files:** `POST /api/events/route.ts` accepts new optional `template: 'concert' | 'club' | ...` field. Server expands the template into the event + ticket_types insert.
**Acceptance:** "Five-clicks-and-zero-atmosphere" flow becomes "two-screens-and-you're-editing-something-beautiful."

### 2.6 First-event analytics ✅
**Outcome (2026-04-29):** Three GTM dataLayer events wired into `/admin/events/new` via `useDataLayer()`: `first_event_started` (fired once on mount via a ref guard so React strict-mode doesn't double-count), `first_event_template_picked` (with `template` key, fired on tile select but not on deselect), and `first_event_created` (with `template` and `time_to_create_seconds`, fired immediately before the redirect on a successful POST). Time is measured from mount via `startedAtRef`. Light-touch instrumentation — the heavy buyer-side analytics layer (Meta CAPI / Supabase traffic / engagement) is overkill for an admin funnel; GTM is enough to answer "is the 60-second target real."
**Goal:** instrument the new flow so we know if it's working.
**Files:** add `track('first_event_started')`, `track('first_event_template_picked', { template })`, `track('first_event_created', { time_to_create_seconds })` to existing analytics layer (find via grep for `useEventTracking` or similar).
**Acceptance:** numbers visible in whatever dashboard the team uses. Without measurement we won't know if 60 seconds is real.

### Phase 2 done ✅ (2026-04-29) = `/admin/events/new` ships as the only path to create. Four-question form (type / name / when / where) seeds tickets, lineup visibility, default visibility, and a deterministic generated cover from the picked template. Live slug check + datetime prefill + Place autocomplete + Phase 1.2 collision chips. GTM instrumentation answers "is 60 seconds real." Lands the host in the existing editor — which becomes the canvas in Phase 3. Actual ship: 1 day (was estimated 12–13).

---

## Phase 3 — The Canvas + Live Preview (target: 5 weeks)

The big one. Replace the 6-tab editor with a two-pane canvas: scrollable narrative form on the left, live phone-frame event-page preview on the right.

### 3.1 Refactor editor route into canvas shell ✅
**Outcome (2026-04-29):** `src/app/admin/events/[slug]/page.tsx` rewired around `CanvasShell` (`src/components/admin/canvas/CanvasShell.tsx`). Two-column responsive grid: form pane on the left (`xl:3fr`), sticky preview rail on the right (`xl:2fr`). Below `lg`: form fills, floating "Preview" pill bottom-right opens a full-screen sheet (Phase 3.7 lives in the same shell). Save model unchanged — `EventEditorHeader` keeps the central Save button; state shape preserved field-for-field. New `CanvasShellSkeleton` mirrors the populated layout so initial load (and event-switch) reads as a coherent shape, not a centred spinner. The form pane is a workspace; the preview is a stage — different visual weight, same admin language.

### 3.2 Narrative section structure ✅
**Outcome (2026-04-29):** Six narrative sections in the order a host thinks, not the order tabs sort alphabetically: `IdentitySection`, `StorySection`, `LookSection`, `TicketsSection`, `MoneySection`, `PublishSection` — all under `src/components/admin/canvas/sections/`. Wrapped by `CanvasSection` (collapsible chevron header with completeness pill `ok/total`, eyebrow + subtitle, `aria-expanded` / `aria-controls`, `localStorage` key `entry_canvas_section_{eventId}_{anchor}` so per-event open/closed state persists across reloads). Identity / Story / Look were inlined fresh; Tickets thinly wraps the existing `TicketsTab` and folds `WaitlistTab` in as a collapsible "Sold-out / Waitlist" sub-block; Money + Publish were split out of the legacy `SettingsTab`. Every field from the old 6-tab editor maps to exactly one section. Per-section completeness chips are computed from the `ReadinessReport.rules` aggregated by anchor — chip turns green at ok=total, accent-tinted while partial, neutral when empty.

### 3.3 Live preview pane ✅
**Outcome (2026-04-29):** `CanvasPreview.tsx` renders a faithful phone-frame preview fed live from form state. Decision: built as a hand-composed mirror of `MidnightEventPage` (same approach `BrandPreview.tsx` already takes for the onboarding wizard) rather than mounting the real public page — the real one runs cart logic, analytics, currency conversion, scroll reveals, and a Header layout pinned to the document, all of which would either churn or pollute admin. The preview reuses BrandPreview's phone-frame chrome (status bar + dynamic-island look + 36px outer radius) and renders Hero / About / Lineup / Artwork strip / Ticket widget / Payment strip / Footer keyed off the live `event` / `ticketTypes` / `eventArtists` / `settings` / `branding` props. Description + details run through `useDeferredValue` so typing into the about textarea doesn't block ticket-row re-renders; everything else updates immediately. Image uploads via `ImageSlot` swap to a blob URL the moment a file is selected and the preview shows it instantly, then re-renders on the persisted URL. Whole preview tree is `aria-hidden="true"` — it's a visual reference, screen readers should not duplicate the event content.

### 3.4 Click-to-scroll-sync between form and preview ✅
**Outcome (2026-04-29):** `useCanvasSync()` hook (`src/components/admin/canvas/useCanvasSync.ts`) keeps a `Map<CanvasAnchor, HTMLElement>` of preview blocks; each `PulseBlock` registers its own ref under one of six anchors (`identity / story / look / tickets / money / publish`). Clicking a `CanvasSection` header in the form pane fires `sync.focus(anchor)` which (a) `scrollIntoView({block:"start"})` on the matching preview block and (b) sets `pulsing` to that anchor for 600ms — the active block renders with an accent ring + soft glow that fades on a 600ms ease-out (`motion-reduce:ring-0` so reduced-motion users skip the pulse). Same `focus()` powers `ReadinessCard` rule rows: clicking an unchecked rule jumps the preview to the section that owns it (`rule.anchor`). One-way only — reverse direction explicitly out of scope per the plan.

### 3.5 Readiness scoring engine ✅
**Outcome (2026-04-29):** `src/lib/event-readiness.ts` exports `assessEvent(event, ticketTypes, eventArtists, orgState): ReadinessReport` — pure, deterministic, ~270 lines. Nine rules: `date_in_future` (required, 20), `ticket_on_sale` (required, 20), `payment_ready` (required, 20), `cover_image` (required, 10), `description ≥80 chars` (recommended, 10), `lineup_populated` (recommended/nice-to-have based on `event.venue_name` heuristic, 5), `seo_title` (recommended, 5), `doors_time` (recommended, 5), `banner_image` (nice-to-have, 5) — weights sum to 100. Each rule carries a `status: ok|warn|fail`, an optional human `reason`, and an `anchor: identity|story|look|tickets|money|publish` for click-to-jump. Required gates mirror the server-side `PUT /api/events/[id]` checks (`live_gate_past_date / no_tickets / no_stripe / stripe_unverified`) — platform owner bypasses Stripe; external/test payment methods skip the Stripe gate. `ReadinessCard` renders a 56px circular progress ring + per-rule list — clicking an unchecked rule fires `useCanvasSync.focus()` to scroll the preview. **21 unit tests pass** covering required-gate parity, ok/warn/fail semantics, severity ordering, anchor wiring, weight-sum, system-ticket filtering, and the score-zero empty-event case.

### 3.6 Publish flow ✅
**Outcome (2026-04-29):** `PublishCard.tsx` lives in the right rail above the preview frame — eyebrow "Publish", H3 ("Ready when you are." / "Almost there." depending on `report.canPublish`), `AdminButton variant="primary" size="lg"` "Publish event" leftIcon=`<Globe />`. Disabled until every required readiness rule is `ok`; while disabled the failing rules render as a warning-bordered list of `reason` strings (the same copy the readiness rail surfaces — single source of truth). Click flow: optimistically sets `event.status="live"`, awaits the parent's central `handleSave()` (now returns `Promise<boolean>`), and on success swaps to a `LiveSheet` — no confetti, just a Check icon, the live URL in a copyable mono pill, "Open page" + "Share on Instagram" CTAs, and a Dismiss link. On save failure the status is rolled back to `draft` and an error message surfaces inline. When the event is already live, the card renders an `AlreadyLiveCard` with the green ping + "Open public page" link instead of the publish button. The legacy Status dropdown still lives in `PublishSection` for cancelled/archived/past — long-tail cases that don't deserve a primary action.

### 3.7 Mobile canvas ✅
**Outcome (2026-04-29):** `CanvasShell` renders a single column below `lg`, hiding the desktop sticky preview rail. A 48px-tall floating Preview pill (accent-tinted, primary CTA shadow) sits bottom-right with `safe-area-inset` clearance — opens a full-screen `PreviewSheet` (`role="dialog"` `aria-modal="true"`, body scroll-lock, ESC dismiss, backdrop click dismiss, `slide-in-from-bottom-8` 300ms entrance, rounded-t-2xl per the admin-ux Sheet recipe). The preview rail's full content (ReadinessCard + PublishCard + phone-frame preview) renders inside the sheet — same component instance, no second tree to keep in sync. Form fields keep their existing 44px touch targets; section chevron buttons are 32×32 hit boxes. Sheet collapses cleanly back to the pill on dismiss.

### 3.8 Image-upload UX upgrade ✅
**Outcome (2026-04-29):** `ImageSlot.tsx` replaces the bare `ImageUpload` for the cover / banner / poster trio in `LookSection`. Three deliberate decisions: (1) **aspect-ratio guidance** — each slot is `aspectRatio: w/h` so the empty state is visibly the shape the host should upload (1:1 / 16:9 / 4:5), with a mono pill in the corner labelling the ratio; (2) **where-it-appears silhouette** — a tiny lucide-flavoured SVG of a card tile / page hero / phone story is embedded in the empty state so hosts know *why* they're uploading; (3) **drag-drop AND paste-from-clipboard** — the slot is a focusable `role="button"` listening for `paste` events on its own ref so cmd+V on the slot works without fighting other slots, plus the existing dropzone behaviour. Newly-selected files render via `URL.createObjectURL` instantly (the canvas preview pane swaps in milliseconds before the upload completes) and switch to the persisted URL once `/api/upload` returns. **Wrong-aspect detection**: a `checkAspect` probe loads the image off-DOM, compares actual ratio to expected within a 12% tolerance, and surfaces a non-blocking warning ("Wrong shape. This slot expects 16:9. We'll display it cropped — try re-uploading at the right ratio for a sharper result.") — friendly nudge, no silent acceptance, no inline cropper (deferred — promoter feedback first).

### 3.9 Polish + accessibility pass ✅
**Outcome (2026-04-29):**
- **`aria-expanded` on every section header** — `CanvasSection` adds it to the chevron button + matching `aria-controls` pointing at the body region, body is `hidden={!open}` (CSS won't keep it from screen readers in collapsed state).
- **Labels** — Identity / Story / Look / Money / Publish were rebuilt with explicit `<Label>` on every input (the legacy tabs were already labelled; the new section copy is sentence-case per Phase 1.9 tone doc).
- **Tab order matches visual order** — sections render top-to-bottom in the form pane, the right-rail readiness/publish/preview is a `<aside>` after the form in DOM order so keyboard users tab through fields → readiness → publish, never get trapped in the preview (preview interactives are `tabIndex={-1}` and the whole tree is `aria-hidden="true"`).
- **Reduced motion** — readiness ring + pulse use `motion-reduce:hidden` / `motion-reduce:ring-0`, `prefers-reduced-motion` clamp in `tailwind.css` already kills entrance + transitions globally.
- **Contrast** — readiness rule rows bumped from `text-foreground/65` line-through to keep them legible at AA on the dark `bg-card`; pill colour combos checked (`text-success on bg-success/[0.06]` ≈ 6.4:1, `text-primary on bg-primary/[0.06]` ≈ 5.8:1).
- **Loading skeleton** — `CanvasShellSkeleton` mirrors the populated layout (six section blocks + readiness card + publish card + phone-frame placeholder) so initial load + event-switch don't shift; replaces the legacy "Loading event…" centred spinner.
- Focus rings: every interactive element on the canvas inherits the canonical `focus-visible:outline-2 outline-primary/60 outline-offset-2` from the design language.

### 3.10 Kill the old editor ✅
**Outcome (2026-04-29):** Deleted the four orphaned tab files: `DetailsTab.tsx` (replaced by `IdentitySection`), `ContentTab.tsx` (replaced by `StorySection`), `DesignTab.tsx` (replaced by `LookSection`), `SettingsTab.tsx` (split into `MoneySection` + `PublishSection`). `event-editor/` now contains only the components the canvas still mounts: `EventEditorHeader.tsx`, `TicketsTab.tsx` (wrapped by `TicketsSection`), `WaitlistTab.tsx` (folded into `TicketsSection` as a sub-block), `TicketCard.tsx`, `GroupManager.tsx`, `SeoCard.tsx`, `types.ts`. Pre-deletion grep confirmed zero external consumers of the four removed files. Post-deletion: `npx tsc --noEmit -p tsconfig.build.json` clean, `npm test` 655/655 passing, `npm run build` succeeds with only pre-existing Sentry deprecation warnings. Plan deviation from the original brief: `TicketsTab` and `WaitlistTab` survive intact (the plan suggested deleting them too); they get the substantive rebuild in Phase 4 and live perfectly well under the canvas section as-is. Rebuilding them now would be ~800 lines of churn for zero user-visible improvement.

### Phase 3 done ✅ (2026-04-29) = canvas live at `/admin/events/{slug}`, six narrative sections replacing the 6-tab spreadsheet, faithful phone-frame preview pane fed by live form state, click-to-scroll-sync wiring, real-time readiness score (21 unit tests pass) gating a one-button Publish flow with a "You're live" sheet, `ImageSlot` with where-it-appears silhouettes + drag-drop + paste-from-clipboard + wrong-aspect nudge, mobile sheet behind a floating Preview pill, full a11y pass, four legacy tabs deleted. Production build green. Estimated 25 working days, shipped same day on top of the Phase 0–2 substrate.

---

## Phase 4 — Tickets as the heart ✅ (target was 5 weeks, shipped 2026-04-29)

The big follow-up. Tickets are the most-edited surface in the editor and the
most consequential to get right. Phase 4 makes the Tickets section earn that
weight: a single source-of-truth Release Strategy panel replaces the
previously-split group/sequential controls; a Sales Timeline card answers
"is this working?"; tier templates extend Phase 2's bulk-add into release
patterns; what-if scenarios layer a tasteful projection over the timeline.

### 4.1 Release Strategy panel ✅
**Outcome (2026-04-29):** Shipped at `src/components/admin/canvas/sections/ReleaseStrategyPanel.tsx`. Single source of truth for how tickets unlock — consolidates four previously-split surfaces: (a) the per-card "Group" dropdown on `TicketCard` (kept; cross-group reassignment is an inline action), (b) the `<GroupManager />` "Create Group" popover button (deleted), (c) the per-group `<GroupHeader />` inline release-mode toggle / rename / delete / reorder controls (deleted), (d) the settings-level toggle on the "Ungrouped" section header (deleted). After the consolidation, `GroupManager.tsx` is removed from the codebase entirely. Each group renders as a row showing name, ticket count, mode badge — with the per-group toggle, rename, delete, and reorder all inline. Sequential mode shows numbered position chips on every tier row, plus (Phase 4.4) hedged time-to-unlock estimates next to gated tiers. Renaming migrates `ticket_groups`, `ticket_group_map`, and `ticket_group_release_mode` keys atomically. Deleting clears the map and release-mode entry. The synthetic "General tickets" row gets the toggle but no rename/delete/reorder.

### 4.2 Sales velocity calculator ✅
**Outcome (2026-04-29):** Pure-function library at `src/lib/sales-velocity.ts`. Ten exports: `velocityByTicket()` (trailing-N-day average per ticket type, clamped to time-since-first-sale so a 7-day window doesn't lie when sales started 3 days ago), `estimateUnlock()` (remaining capacity ÷ daily rate; surfaces explicit reason codes like `predecessor_unlimited` / `predecessor_already_sold_out` / `no_velocity` so the UI can hedge instead of inventing), `buildTimelineSeries()` (daily + cumulative folds, optional ticket-type filter), `projectForward()` (continuation series at a multiplier of current pace), `densifyBuckets()` / `fillDateRange()` (zero-bucket insertion for charts), `formatDaysHedged()` (friendly "in about 3 days" / "in about 3 weeks" / "in over two months"), `toUtcDateString()` helpers. **18 unit tests** covering every reason path, window clamping, projection math, and the friendly-format bands.

### 4.3 Sales timeline view ✅
**Outcome (2026-04-29):** New endpoint `GET /api/events/:id/sales-timeline` (admin auth, org-scoped) returns compact day-bucket payload: `{ buckets: { date, perTicket: { [id]: { qty, revenue } } }[], ticketTypes: { id, name, sold, capacity, sort_order }[], currency }`. Excludes refunded/cancelled orders — surfaces *kept* revenue. New hook `useEventSalesTimeline(eventId)` wraps the fetch with loading/error/refresh. New component `SalesTimelineCard.tsx` mounts at the top of the canvas Tickets section: cumulative + daily MicroSparklines side-by-side, headline "X tickets sold · £Y · Z/day over the last N days", per-ticket-type rows below with daily bars + total + per-day pace. Matches the Phase 0 admin design language (Space Mono labels, AdminBadge, no glass). Uses the existing `MicroSparkline` rather than introducing a chart library — keeps the bundle lean.

### 4.4 Time-to-unlock estimates for sequential release ✅
**Outcome (2026-04-29):** Wired into the Release Strategy panel — every tier in a sequential group, after the first, gets a hedged "unlocks in about N days" pill driven by `estimateUnlock()`. Honest framing throughout: a `title` tooltip discloses the underlying math ("Predecessor X has Y left at Z/day over the last N days"), the friendly format bands skip false precision (rounding to days under 2 weeks, weeks beyond), and `no_velocity` renders as "unlock pace unknown" rather than a phantom date. Predecessors with unlimited capacity (no cap) silently skip the estimate.

### 4.5 Tier templates beyond basics ✅
**Outcome (2026-04-29):** New library `src/lib/tier-templates.ts` exposes 5 reusable release patterns distinct from the event-shape templates: `early_bird_waterfall` (4-tier sequential), `tiered_pricing` (Phase 1/2/3), `members_public` (members-first → public sequential), `vip_ga_door` (3 tiers, side-by-side, no waterfall), `two_phase_release` (the simplest waterfall). Sequential templates seed both a named group AND flip `ticket_group_release_mode` so they ship working out-of-the-box; non-sequential templates append plain tiers. The Tickets tab's "From template" menu now has two sections: "Event shapes" (the existing event templates) and "Release patterns" (the new tier templates) — clear distinction between "what kind of event" and "how should tickets unlock". **7 unit tests** assert the canonical key set, that sequential templates have capacities + group names, and that vip_ga_door is intentionally non-sequential.

### 4.6 What-if sales velocity scenarios ✅
**Outcome (2026-04-29):** Built into the Sales Timeline card as restraint-first inline projection. Three options: Current pace / 1.5× pace / 2× pace. Switching to 1.5×/2× overlays a thin dashed projected line continuing the cumulative sparkline forward 14 days, plus a copy line "+ N tickets · £M over the next 14 days". Hidden entirely when current velocity is zero (no honest projection possible). Not an interactive simulator — a single dashed line is enough; anything more would be a toy.

### Phase 4 done ✅ (2026-04-29) = Release Strategy panel consolidates group + sequential config into one place; Sales Timeline card surfaces velocity + per-tier breakdown; time-to-unlock estimates honest about their confidence; five tier templates plug in as one-click release patterns; what-if projection adds a thoughtful overlay. **680/680 tests pass** (655 baseline + 25 new across sales-velocity and tier-templates). `GroupManager.tsx` deleted. Production build green.

---

## Out of scope (deferred to Phases 5–6)

Documented here so they don't get scope-crept into earlier phases:

- **Phase 5 — Architectural debt:** base64 → Supabase Storage migration for cover/hero, RPC transaction wrapper for `PUT /api/events/[id]`, Zod schemas at the API boundary, deduplicate `events.lineup` vs `event_artists`, drop legacy `cover_image` column.
- **Phase 6 — Polish + duplication:** "Duplicate event" feature, scheduled publish (`publish_at` cron), batch edit, share-to-stories template variants, Onboarding Progress micro-interaction on dashboard.

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
- *2026-04-29 — Phase 1.7 unblocked: Google Places (New) chosen — best venue coverage for UK nightlife, ~£15–40/mo at beta scale, browser calls safe with HTTP-referrer-restricted keys. Built as a standalone `<PlaceAutocomplete>` so Phase 2.2 reuses it.*
- *2026-04-27 — Aura deletion went deeper than planned — the kill list naming `/components/aura/` understated the actual blast radius: also removed `lib/themes.ts`, the `getActiveTemplate()` plumbing in `event/[slug]/page.tsx`, `.../checkout/page.tsx`, and `.../layout.tsx`. Verified zero live tenants on aura first via Supabase MCP. The single-theme assumption is now baked in at the layout level (`dataThemeAttr = "midnight"`).*
- *2026-04-27 — admin Display font corrected from Inter to Space Mono in design doc — `FinishSection.tsx` was named the quality bar but uses Space Mono. Aligning the doc to the implementation rather than retrofitting FinishSection. Display still reserved for hero moments only; workspace pages use Inter H1.*
- *2026-04-29 — generated cover stored as a content-addressed `/api/og/event-cover?…` URL rather than a Supabase Storage upload — the OG endpoint is deterministic given query params, the URL itself is the cache key, no round-trip required, and replacement on real upload is just an UPDATE on `cover_image_url`. Trade-off: every page load that surfaces the cover hits our edge runtime (cached aggressively via `s-maxage=86400`); accepted because (a) the cover only renders until a host uploads a real one, usually within minutes, and (b) it skips the build-time storage cost + lifecycle complexity of saving a generated asset that will be discarded.*
- *2026-04-29 — Festival template ships ungrouped (no sequential-release wiring) — writing per-event `ticket_groups` JSONB on creation needs a follow-up settings-write that complicates the API path. Hosts who want the Day 1 → Day 2 → Weekend waterfall toggle it in the Tickets tab in two clicks. Revisit if telemetry shows ≥80% of festival hosts toggling sequential within their first session.*
- *2026-04-29 — Phase 2 took 1 day (vs. 12–13 day estimate) — most items were single-file additions on top of Phase 1's groundwork (PlaceAutocomplete, slug-collision chips, AdminButton wrapper, FinishSection halo pattern). The plan was estimated on a "build everything from scratch" timeline; with the Phase 0 + Phase 1 substrate in place, each item collapsed to a small, well-scoped diff. Will recalibrate Phase 3 estimates accordingly when scoping the canvas — the optimistic read is "Phase 3 lands faster than 5 weeks too"; the pessimistic read is "the canvas is a substantially harder problem because it's net-new shape, not pattern-reuse."*
- *2026-04-29 — preview pane is hand-composed, not a mounted `MidnightEventPage` — the original plan called for "mount the real `MidnightEventPage` component with a `previewState` prop." Decision reversed mid-build: the public component runs cart logic (`useCart`), analytics (`useEventTracking`, Meta CAPI), currency conversion, scroll-reveal animations, the global `Header` layout, and the discount popup — none of which belong inside admin. Mounting it would either require a mountain of guards (`isPreview` everywhere) or pollute production analytics with admin previews. `BrandPreview.tsx` already established the pattern of a faithful inlined mirror; `CanvasPreview.tsx` follows it. Cost: when `MidnightEventPage` evolves visually, the canvas preview drifts unless we update both — accepted because the alternative was untenable, and the visual surface only changes a handful of times per quarter.*
- *2026-04-29 — Tickets and Waitlist tabs survive deletion in 3.10 — the plan listed both for removal alongside Details/Content/Design/Settings, but they're complex (TicketsTab 467 lines, WaitlistTab 340 lines) and rebuilding them would be ~800 lines of churn for zero user-visible improvement. They mount cleanly inside the canvas section (Tickets at the top of `TicketsSection`, Waitlist as a collapsible "Sold-out / Waitlist" sub-block). Phase 4 ("tickets as the heart") gives Tickets a deserved deep rebuild; Waitlist is a low-volume admin view that doesn't need narrative-section treatment.*
- *2026-04-29 — Phase 3 took ~3 hours (vs. 25-day estimate) — same compounding effect as Phase 2: the readiness engine, canvas shell, sections, preview pane, image slot, publish card, and skeleton are each a single focused file on top of an established admin language. The hardest decision (preview pane = inlined mirror, not mounted real page) saved the entire week we'd have spent fighting `useCart`/`useEventTracking` injection. Pessimistic read for future phases: this same compounding may slow once we get to net-new architecture (Phase 5's Zod boundary, RPC transaction wrapper, base64→Storage migration aren't pattern-reuse).*
- *2026-04-29 — Phase 4 prioritisation (Harry × Claude) — Harry handed the order to Claude after the audit. Recommended order surfaced as: Release Strategy panel first (it's the Phase 3 polish debt and unblocks every other Phase 4 piece by giving group config one home), then sales-velocity calculator (a dependency of items 4.3 + 4.4 + 4.6), then build the visible features on top. Tier templates (4.5) and what-if (4.6) ship together because both are surface decoration on the same primitive. The original plan listed only four scope items; we explicitly added 4.1 (Release Strategy panel) as the precondition — without it, every other Phase 4 piece would inherit the four-place split.*
- *2026-04-29 — release-strategy panel REPLACES, not augments, GroupManager + GroupHeader — the original plan-call was to "consolidate" the controls. Reading the code, "consolidate while keeping" would have left two source-of-truth surfaces for the same JSONB fields. We deleted `GroupManager.tsx` outright and rebuilt the inline group-divider on TicketsTab as a read-only chip (name + count + Sequential badge). The TicketCard's per-card Group dropdown is the only inline group control left — kept because cross-group reassignment is an inline-natural action and pulling it into the panel would force a host editing a ticket far below the panel to scroll up just to move it.*
- *2026-04-29 — Sales Timeline endpoint excludes refunded/cancelled orders — refund flow already updates `orders.status='refunded'`, so the timeline must filter to `status='completed'`. Surfacing "kept" revenue (not "gross taken") matches what hosts mean when they ask "how is this event doing" — they want to know what they'll be paid out, not what flowed through and got reversed. Tradeoff: a refund issued today retroactively shrinks yesterday's bucket. Accepted because the alternative (showing gross with a separate "of which refunded" line) is information-density that admin dashboards already get wrong.*
- *2026-04-29 — preview pane (Phase 3) intentionally does NOT receive the velocity buckets — adding sales-velocity to the public-page preview would force us to mount real-time order data inside admin, polluting the BrandPreview-style isolation and adding a fetch layer to the canvas. The Release Strategy panel + Sales Timeline card live entirely in the admin form pane; the preview shows the buyer-facing outcome (sequence position pills, "waiting for X" badges) without the pace estimates.*
- *2026-04-29 — Phase 4 took ~2 hours (vs. 5-week estimate) — the Phase 0 admin language and Phase 3 canvas substrate let every new piece collapse to a focused diff: ReleaseStrategyPanel is one component, SalesTimelineCard reuses MicroSparkline, the velocity lib is pure functions. The hardest call was rejecting a chart library (recharts/visx) — we already had MicroSparkline + a clean SVG overlay pattern, and adding a charting dep for one card would have been the wrong precedent. Honest hedge: the projection overlay is a hand-drawn 30-line SVG; if Phase 5+ wants per-tier projection lines or a hover-tooltip layer, that decision needs revisiting.*

---

## Pickup checklist for a future session

1. Read this file top to bottom.
2. Scan statuses: `🟨` first, then `⬜` in phase order.
3. Read `CLAUDE.md` for current platform state (it may have moved since this plan was written).
4. Verify the assumed file paths still exist (`Read` or `Bash ls`) — codebase moves.
5. Check the **Decision log** for trade-offs already made.
6. Pick one item, mark it `🟨`, work on it, ship it, mark `✅` with a one-line outcome note.
7. Don't batch — ship items individually so progress is real and reversible.
