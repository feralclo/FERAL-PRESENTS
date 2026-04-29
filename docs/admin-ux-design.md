# Admin Design Language

The canonical visual + interaction language for everything inside `/admin/*`.

> **Status:** v1.0 — drafted 2026-04-27, item 0.1 of `EVENT-BUILDER-PLAN.md`.
> **Quality bar:** match `src/app/admin/onboarding/BrandPreview.tsx` and `src/app/admin/onboarding/FinishSection.tsx`. These are the floor, not the ceiling.
> **Scope:** admin only. Public-facing event pages, checkout, and the Midnight theme follow `ux-design.md` (memory) and use a different language (glass-on-dark). **Do not mix.**

---

## How to use this doc

1. Read the philosophy section before touching any admin code.
2. If you see a pattern in the codebase that conflicts with this doc, **the doc wins.** Either change the surface to match, or update this doc with rationale and append to the Decision log at the bottom.
3. When you upgrade an existing page to the new language, append it to the **Page migration tracker** at the bottom so we can see progress.
4. The companion `EVENT-BUILDER-PLAN.md` is the *what* and *when*; this doc is the *how it should look and feel*.

---

## 1. Design philosophy

Five rules that govern every decision. If the rule and a request conflict, push back.

### 1.1 Premium = restraint
Apple, not Vegas. Static borders beat animated gradients. Zero rotating conic gradients, ever — they read "crypto" and undermine trustworthiness on a financial product. The most premium things in design are usually the most boring things, executed with absolute precision.

### 1.2 Admin is a workspace, not a marketing surface
The host is here to do work — publish an event, refund an order, scan tickets at the door. Information density matters. We optimise for clarity and speed of action over emotion. Marketing-grade flourish lives on public-facing pages; admin gets calm typography, predictable layouts, and one job per screen.

### 1.3 Borders + soft shadows, never glass
This is the most important visual rule in this document. Glass-on-dark (`backdrop-filter: blur`, translucent layers, halo effects) is the **public Midnight language**, reserved for the buyer-facing surfaces. Admin uses **thin borders + small shadows** — solid, tactile, work-focused. If you find yourself reaching for `backdrop-blur` in an admin component, stop and use `border + shadow-sm` instead.

### 1.4 Mobile-usable, desktop-optimised
Admin is primarily used on laptops. We don't apologise for designing for that. But every admin page must be **functional** on a 375px phone — touch targets ≥44px, single-column collapse, no horizontal scroll, safe-area insets for the bottom bar. "Functional on mobile" ≠ "shrunken desktop." Sheets, sticky CTAs, and full-screen takeovers replace modals on small screens.

### 1.5 Animation has a budget
Per page: one entrance animation (200–300ms), one micro-interaction on the primary action (200ms), one ambient signal if it's earned (a pulse on a live indicator). That's the budget. `prefers-reduced-motion` is always respected. If you need more animation than that, you're probably hiding a UX problem behind motion.

---

## 2. Typography scale

The admin uses two fonts:
- **Inter** (`--font-sans`) — body, UI, headings
- **Space Mono** (`--font-mono`) — labels, eyebrows, prestige metadata, the numbers in stat cards

Inter does the work; Space Mono adds rhythm. Don't reach for `--font-display` in admin — that's reserved for public event pages.

### 2.1 The scale

| Role | Font | Size | Weight | Tracking | Line-height | When |
|---|---|---|---|---|---|---|
| **Display** | Space Mono | `clamp(28px, 4vw, 40px)` | 700 | -0.02em | 1.04 | Hero moments only — FinishSection greeting, FreshTenantHero, Start moment. The premium editorial signature; not a workspace H1. |
| **H1 (page title)** | Inter | 24px | 600 | -0.005em | 1.2 | Top of every admin workspace page |
| **H2 (section)** | Inter | 18px | 600 | 0 | 1.3 | Section dividers within a page |
| **H3 (card)** | Inter | 15px | 600 | 0 | 1.4 | Card headers |
| **Body** | Inter | 14px | 400 | 0 | 1.5 | Default. If you don't think about it, this is the answer. |
| **Body-sm** | Inter | 13px | 400 | 0 | 1.5 | Tight contexts, table cells |
| **Body-xs** | Inter | 12px | 400 | 0 | 1.4 | Microcopy, timestamps, secondary info |
| **Eyebrow** | Space Mono | 11px | 600 | 0.16em | 1.2 | UPPERCASE. Section labels, metadata headers, the "LIVE" pill |
| **Label** | Inter | 13px | 500 | 0 | 1.4 | Form labels |
| **Hint** | Inter | 12px | 400 | 0 | 1.4 | Below a form field, `text-muted-foreground` |
| **Error** | Inter | 12px | 500 | 0 | 1.4 | Below a form field, `text-destructive` |
| **Numeric** | Space Mono | 24px | 700 | -0.005em | 1.1 | Stat card big numbers |
| **Numeric-sm** | Space Mono | 14px | 600 | 0 | 1.2 | Inline metrics, IDs, codes |

**Why Space Mono for Display:** the existing `FinishSection.tsx` quality bar uses Space Mono for its greeting. That's the editorial signature of Entry — buyers see Space Mono on event pages, hosts see Space Mono on hero moments. It binds the two surfaces together. **Use Display sparingly** — workspace pages get an Inter H1, not a Mono Display.

### 2.2 When to use Space Mono

- **Numbers that matter:** prices, counts, IDs, order numbers, ticket codes. These are the things a host scans for.
- **Eyebrows / labels above sections:** `EVENT DETAILS`, `RECENT ORDERS`. UPPERCASE, tracked, small.
- **Status pills:** `LIVE`, `DRAFT`, `PAST`, `CANCELLED`. Always Space Mono — it makes the status feel like a label on a piece of equipment, not a marketing badge.

### 2.3 When NOT to use Space Mono

- Body copy. Ever. Mono on long-form copy is exhausting to read.
- Buttons. Use Inter. Buttons need to feel actionable, not technical.
- Form labels (use Inter Label style above) — Space Mono is too dense for the field-by-field rhythm of a form.

---

## 3. Spacing grid

Base unit: **4px**. Every spacing decision is a multiple of 4. No `13px` margins, no `7px` paddings.

### 3.1 Token names

| Token | Value | Tailwind | Use |
|---|---|---|---|
| `space-1` | 4px | `gap-1` / `p-1` | Inline icon-text pairs |
| `space-2` | 8px | `gap-2` / `p-2` | Tight (eyebrow → heading) |
| `space-3` | 12px | `gap-3` / `p-3` | Field labels → input |
| `space-4` | 16px | `gap-4` / `p-4` | **Default gap.** Grid gaps, card-internal spacing |
| `space-5` | 20px | `gap-5` / `p-5` | Card padding (`px-5 py-4` is the canonical card inset) |
| `space-6` | 24px | `gap-6` / `p-6` | **Default vertical rhythm** between sections in a card |
| `space-8` | 32px | `gap-8` / `p-8` | Page-level section gaps |
| `space-10` | 40px | `gap-10` / `p-10` | Hero margins, top-of-page breathing |
| `space-12` | 48px | `gap-12` / `p-12` | Empty-state padding |

### 3.2 Canonical patterns

- **Card:** `rounded-lg border border-border/40 bg-card px-5 py-4` (with `space-y-4` or `space-y-6` inside).
- **Form field group:** `<label>` + 8px gap + `<input>` + 4px gap + hint text.
- **Section spacing:** `space-y-6` between fields in a card; `space-y-8` between cards on a page.
- **Page padding:** `px-6 py-8` on desktop, `px-4 py-6` on mobile.

### 3.3 Don't

- Don't use arbitrary Tailwind values like `gap-[13px]`. If the design needs it, the scale is wrong.
- Don't mix `gap-3` and `gap-4` in adjacent components — pick one and stay there.

---

## 4. Color tokens

All admin colours are **`[data-admin]`-scoped CSS variables** declared in `src/styles/tailwind.css`. **Never hardcode hex.** Use the token. If the token doesn't exist, add it.

### 4.1 Semantic tokens

| Token | Hex | Role |
|---|---|---|
| `--color-background` | `#08080c` | Deepest surface — the "void" the admin sits on |
| `--color-sidebar` | `#0a0a10` | Sidebar — anchored, slightly darker than card |
| `--color-card` | `#111117` | Raised surfaces — cards, panels, dialogs |
| `--color-foreground` | `#fafafa` | Primary text |
| `--color-muted-foreground` | (~`#a1a1aa`) | Secondary text, hints, timestamps |
| `--color-border` | `#1e1e2a` | Subtle dividers, card borders |
| `--color-primary` | `#8B5CF6` | **Electric Violet.** Primary CTAs, active nav, focus rings, brand accent |
| `--color-primary-foreground` | `#fafafa` | Text on primary surfaces |
| `--color-destructive` | `#F43F5E` | Delete actions, error states, refunds |
| `--color-success` | `#34D399` | Live indicators, completed checks, paid orders |
| `--color-warning` | `#FBBF24` | Action-needed banners, low-stock pills |
| `--color-info` | `#38BDF8` | Neutral info, help banners |

### 4.2 Opacity is the palette

For tints, gradients, and hover states — use **opacity on the token**, not a separate hex.

```tsx
// ✓ Right
<div className="border-primary/20 bg-primary/[0.05]">…</div>
<p className="text-foreground/60">Secondary copy</p>

// ✗ Wrong
<div className="border-[#8B5CF633] bg-[#8B5CF60D]">…</div>
<p className="text-[#a1a1aa]">Secondary copy</p>
```

### 4.3 The standard tints

| Use | Token expression |
|---|---|
| Subtle accent background (hint card, active row) | `bg-primary/[0.03]` to `bg-primary/[0.06]` |
| Accent border on hint/active surface | `border-primary/15` to `border-primary/25` |
| Hover background on neutral row | `hover:bg-foreground/[0.03]` |
| Icon-on-tint badge | `bg-primary/10 text-primary` |
| Disabled text | `text-foreground/35` |
| Secondary text | `text-foreground/60` to `text-foreground/75` |
| Body text on coloured background | `text-foreground` (no opacity) |

### 4.4 Status colour mapping

| Status | Token | Pattern |
|---|---|---|
| Draft | `--color-muted-foreground` | Grey pill, no glow |
| Live | `--color-success` | Green pill + ping dot, **with** subtle `glow-success` |
| Past | `--color-muted-foreground` | Grey, italic optional |
| Cancelled | `--color-destructive` | Red pill, no glow |
| Action needed | `--color-warning` | Amber pill + amber border on parent card |
| Connected (Stripe) | `--color-success` | Green dot + label |
| Pending verification | `--color-warning` | Amber dot + label |

---

## 5. Surface treatment

Four surface types. Each has one canonical recipe. Don't invent a fifth.

### 5.1 Card

The default container. Used for everything: KPI tiles, form sections, list items, info panels.

```css
border: 1px solid rgb(var(--color-border) / 0.4);
background: rgb(var(--color-card));
border-radius: 8px;          /* rounded-lg */
padding: 16px 20px;          /* px-5 py-4 — canonical */
box-shadow: 0 1px 0 rgb(255 255 255 / 0.02) inset; /* optional top-edge highlight */
```

Hover (only when interactive): `border-color: rgb(var(--color-border) / 0.7)`. No transform on hover for cards.

### 5.2 Panel

A heavier surface — used for the canvas form pane, the readiness rail, sticky sidebars.

```css
border: 1px solid rgb(var(--color-border) / 0.6);
background: rgb(var(--color-card));
border-radius: 12px;         /* rounded-xl */
padding: 24px;
box-shadow:
  0 1px 0 rgb(255 255 255 / 0.03) inset,
  0 8px 24px -12px rgb(0 0 0 / 0.4);
```

### 5.3 Sheet

The mobile takeover surface — replaces dialogs on `< lg`. Slides up from the bottom or in from the side.

```css
background: rgb(var(--color-card));
border-top: 1px solid rgb(var(--color-border) / 0.6);
border-radius: 16px 16px 0 0;  /* rounded-t-2xl */
padding-top: 12px;             /* drag-handle area */
box-shadow: 0 -16px 48px -12px rgb(0 0 0 / 0.5);
```

A 4px-tall, 32px-wide pill at the top centre indicates it's draggable: `bg-foreground/20 rounded-full`.

### 5.4 Dialog

Modal surface for confirmations, focused tasks. **Desktop only** — on mobile, dialogs become sheets.

```css
background: rgb(var(--color-card));
border: 1px solid rgb(var(--color-border) / 0.7);
border-radius: 12px;
max-width: 480px;       /* default; use 640px for forms */
padding: 24px;
box-shadow:
  0 1px 0 rgb(255 255 255 / 0.03) inset,
  0 24px 64px -16px rgb(0 0 0 / 0.6);
```

Overlay: `bg-background/70 backdrop-blur-sm`. Animations from `tailwind.css`: `dialog-overlay-in` (overlay) and `dialog-content-in` (content) — 150ms ease-out, 0.96 → 1 scale.

### 5.5 What's not on this list

- **Glass.** Reserved for public Midnight surfaces. Not used in admin.
- **Gradients on cards.** A subtle `glow-primary` aura is fine on a CTA; a gradient *fill* on a card is not.
- **Patterns / illustrations.** Admin is calm. Patterns belong on empty-state hero moments only (see Section 7).

---

## 6. Component patterns

### 6.1 Strategy: wrapper components

shadcn primitives in `src/components/ui/` are **untouched**. We build admin wrappers in `src/components/admin/ui/` that consume the design language and lock in our patterns.

**Why:** global overrides on shadcn defaults silently break things at random (the public Midnight pages share Tailwind tokens). Wrappers are explicit, trackable, and reversible.

**Naming:** `AdminButton`, `AdminCard`, `AdminInput`, `AdminSelect`, etc. Imports look like `import { AdminButton } from "@/components/admin/ui/button"`.

**When to use shadcn directly vs the wrapper:**
- Inside `/admin/*` → use the wrapper. Always.
- Outside `/admin/*` (public pages) → use shadcn directly.
- One-offs that need full control → use shadcn directly *and* document why in code comments.

### 6.2 The component library (build order)

1. `AdminButton` (variants: primary, secondary, ghost, destructive, link; sizes: sm, md, lg, icon)
2. `AdminCard` (and `AdminCardHeader`, `AdminCardContent`, `AdminCardFooter`)
3. `AdminInput` (text, number, email; with label + hint + error props)
4. `AdminTextarea`
5. `AdminSelect` (and `AdminCombobox` for searchable)
6. `AdminCheckbox`, `AdminSwitch`, `AdminRadio`
7. `AdminBadge` (variants: default, success, warning, destructive, info, outline)
8. `AdminTable` (with `AdminTableRow`, `AdminTableCell`, header sort indicators built-in)
9. `AdminDialog`, `AdminSheet` (responsive — picks one based on viewport)
10. `AdminTooltip`
11. `AdminEmptyState` (see Section 7)
12. `AdminSkeleton` (see Section 8)
13. `AdminPageHeader` (canonical page title + subtitle + actions row)
14. `AdminToast` (replaces ad-hoc toast/alert calls — currently fragmented)

### 6.3 AdminButton — the canonical example

```tsx
// Variants
<AdminButton variant="primary">Save changes</AdminButton>      // bg-primary, white text, glow-primary on hover
<AdminButton variant="secondary">Cancel</AdminButton>          // bg-foreground/[0.06], no border
<AdminButton variant="ghost">Skip</AdminButton>                // transparent, hover bg-foreground/[0.04]
<AdminButton variant="outline">Connect Stripe</AdminButton>    // border-border, hover border-primary/40
<AdminButton variant="destructive">Delete event</AdminButton>  // bg-destructive, white text
<AdminButton variant="link">Learn more</AdminButton>           // text-primary, underline on hover

// Sizes
<AdminButton size="sm">…</AdminButton>   // h-8, px-3, text-xs
<AdminButton size="md">…</AdminButton>   // h-10, px-4, text-sm — default
<AdminButton size="lg">…</AdminButton>   // h-12, px-6, text-sm — for hero moments
<AdminButton size="icon">…</AdminButton> // square, 36×36, for icon-only

// States — all built into the component
<AdminButton loading>Saving…</AdminButton>          // spinner replaces icon, button stays at width
<AdminButton disabled>…</AdminButton>               // 40% opacity, cursor not-allowed
<AdminButton leftIcon={<Plus />}>New event</AdminButton>
<AdminButton rightIcon={<ArrowRight />}>Continue</AdminButton>
```

Hover lift on primary: `hover:translate-y-[-1px]` + `transition-all duration-200`. No lift on secondary/ghost/outline (too distracting in a workspace).

### 6.4 AdminInput — the canonical example

```tsx
<AdminInput
  label="Event name"
  hint="Shown on event pages and emails."
  error={errors.name}
  placeholder="e.g. Midnight Mass"
  {...register("name")}
/>
```

The wrapper handles: label rendering, hint/error swap (error replaces hint when present), focus ring (`ring-1 ring-primary/40`), disabled state, prefix/suffix slots (for currency, units), and the consistent 40px height.

### 6.5 AdminPageHeader — every admin page uses this

```tsx
<AdminPageHeader
  title="Events"
  subtitle="3 live · 2 drafts"
  actions={<AdminButton variant="primary" leftIcon={<Plus />}>New event</AdminButton>}
  breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Events" }]}
/>
```

Locks in: H1 typography, breadcrumb spacing, primary action alignment, mobile collapse (action becomes a sticky bottom bar on `< md`).

---

## 7. Empty states

The most-neglected pattern in the current admin. We standardise it now.

### 7.1 The pattern

Every empty list, table, or section uses **`AdminEmptyState`**:

```tsx
<AdminEmptyState
  icon={<CalendarDays />}                          // lucide, size 24
  title="No events yet"
  description="Create your first event to start selling tickets."
  primaryAction={<AdminButton variant="primary">Create event</AdminButton>}
  secondaryAction={<AdminButton variant="ghost">Import from CSV</AdminButton>}
/>
```

### 7.2 Anatomy

```
┌─────────────────────────────────────┐
│                                     │
│           ┌───────┐                 │
│           │  ico  │   ← 48×48 box, bg-primary/10, rounded-xl, primary-coloured icon
│           └───────┘                 │
│                                     │
│         No events yet               │   ← H3 typography (15px, 600)
│                                     │
│    Create your first event to       │   ← Body (14px), text-foreground/70, max-w-prose
│    start selling tickets.           │
│                                     │
│    ┌──────────────┐  ┌─────────┐    │   ← Primary + optional secondary action
│    │ Create event │  │ Import  │    │
│    └──────────────┘  └─────────┘    │
│                                     │
└─────────────────────────────────────┘
        py-12, max-w-md, centred
```

### 7.3 The three flavours

| Context | Treatment |
|---|---|
| **Inside a card** (e.g. "no recent orders" widget on dashboard) | `py-8`, no icon-box border, smaller body copy |
| **Full page** (e.g. `/admin/events` with zero events) | `py-16`, full pattern with primary + secondary action |
| **Hero empty** (e.g. fresh tenant dashboard) | Becomes a **moment**, not an empty state — see `FreshTenantHero` in `EVENT-BUILDER-PLAN.md` item 1.1 |

### 7.4 Copy rules

- **Title:** declarative, present tense. "No events yet." Not "You have no events." (Don't blame the user.)
- **Description:** one sentence, ≤80 chars. Tells them *what to do next*, not *what's missing*.
- **Primary action:** verb-led. "Create event" beats "Get started."
- **Don't:** apologise, joke, or use exclamation marks. Calm.

---

## 8. Loading states

Default: **skeletons that match the shape of the content.** Spinners only for sub-1s actions inside a button.

### 8.1 When to skeleton

- Initial page load with data fetch >300ms.
- Tab switch or filter change with a refetch.
- Any list or table that's about to render data.

### 8.2 When to spinner

- Inside a button while a submit is in flight (`AdminButton loading`).
- Inside an icon-only action (e.g. refresh button).
- **Not** for full-page loads. Never block a page with a centred spinner — show the layout skeleton instead.

### 8.3 The skeleton language

`AdminSkeleton` is the building block:

```tsx
<AdminSkeleton className="h-4 w-32" />            // text line
<AdminSkeleton className="h-10 w-full" />          // input field
<AdminSkeleton className="h-24 w-full rounded-lg" /> // card
<AdminSkeleton variant="circle" className="h-8 w-8" /> // avatar
```

Visual: `bg-foreground/[0.04]` with a subtle shimmer (`animate-pulse` is fine; the existing `capacity-shimmer` keyframe is too marketing).

### 8.4 Compose, don't reinvent

Every list/table page exports a co-located `*PageSkeleton` component that matches the populated layout. e.g. `EventsPage.tsx` ships with `EventsPageSkeleton.tsx`. The router shows the skeleton during data fetch (Next.js `loading.tsx`).

### 8.5 Don't

- Don't use a centred spinner with the word "Loading…" — it's lazy and shows up most often when something is broken (no skeleton means no thought went into the loading state).
- Don't fade the entire page during a refetch. Only the changing region.
- Don't use a progress bar unless the percent is real (file uploads only).

---

## 9. Motion language

### 9.1 The animation budget

Per page:
- **One** entrance animation (page-level fade-in + subtle slide-up).
- **One** primary action micro-interaction (hover lift on primary CTA).
- **Up to one** ambient signal where it's earned (live status pulse, presence dot).

That's it. If the design needs more, you're hiding a UX problem behind motion.

### 9.2 Motion tokens

| Token | Duration | Easing | Use |
|---|---|---|---|
| `motion-instant` | 100ms | `ease-out` | Hover state changes (background, border) |
| `motion-fast` | 150ms | `ease-out` | Dialog/dropdown open, tooltip reveal |
| `motion-base` | 200ms | `ease-out` | Default for component transitions |
| `motion-slow` | 300ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Page entrance, sheet slide-in |
| `motion-celebrate` | 600ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Success moments (publish, payment received) — rare |

### 9.3 Canonical animations

These already exist in `src/styles/tailwind.css` — use them, don't redefine:

- `dialog-overlay-in` / `dialog-content-in` — modal entry
- `numeric-change-in` — when a number on screen updates (220ms iOS-style)
- `milestone-in` — celebration entry (FinishSection accent halo uses this family)

### 9.4 Reduced motion

Wrap any non-trivial animation in `@media (prefers-reduced-motion: no-preference)`. The dashboard live indicator's `animate-ping` should *not* run if the user has reduced motion enabled — replace with a static dot.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

This rule is already in `tailwind.css`. Don't override it.

### 9.5 Don't

- No bouncing physics on default elements (springs feel toy-like in a workspace).
- No infinite loops except on a status indicator that *means* something is live.
- No parallax. No mouse-tracking glows. Save it for marketing pages.

---

## 10. Iconography

**Library:** [lucide-react](https://lucide.dev). Single source. Don't import from Heroicons, Tabler, or any other set.

### 10.1 Sizes

| Size | Use |
|---|---|
| 12px | Inline with body-xs text (timestamps, micro-badges) |
| 14px | Default for body-sm and inline contexts |
| 16px | **Default for buttons, nav items, form prefix/suffix** |
| 20px | Card headers, page-header actions |
| 24px | Empty state icon (centred in tinted box) |
| 32px+ | Hero moments only (FreshTenantHero tiles) |

### 10.2 Stroke width

Lucide default is `2px`. Stick with default. Don't go to 1px (looks fragile) or 2.5px (looks heavy).

### 10.3 Alignment

Icons paired with text: `flex items-center gap-2` (8px gap is canonical). Vertical alignment is automatic with `items-center`; don't add manual `mt-0.5` adjustments.

### 10.4 Icon-only buttons

Always have an `aria-label`. Always at least 36×36 touch target on desktop, 44×44 on mobile.

```tsx
<AdminButton size="icon" variant="ghost" aria-label="Delete event">
  <Trash2 className="h-4 w-4" />
</AdminButton>
```

### 10.5 Custom SVG

Allowed only for: brand logo, payment-method marks (Visa/Mastercard/Apple Pay), and tenant-uploaded logos. Everything else is lucide.

---

## 11. Focus + accessibility

### 11.1 Focus ring

The single most-broken thing in the current admin. We fix it here.

**The rule:** every interactive element shows a visible focus ring on `:focus-visible`. The ring is:

```css
outline: 2px solid rgb(var(--color-primary) / 0.6);
outline-offset: 2px;
border-radius: inherit;
```

In Tailwind: `focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2`.

### 11.2 Don't

- Don't disable focus rings to "clean up" the design. Mouse users see them on click; keyboard users *need* them. The `:focus-visible` pseudo-class shows the ring only for keyboard nav — design problem solved.
- Don't override the ring with `box-shadow` rings — they don't respect `border-radius` properly on irregular shapes.
- Don't use a 1px ring — too thin to see on dark backgrounds.

### 11.3 Keyboard nav requirements

- Tab order matches visual order. If you `flex-direction: row-reverse`, fix the DOM order.
- Every dialog has focus trapping (Radix handles this — use the wrapper).
- Every dialog has an explicit `aria-labelledby` pointing to the title.
- Every form has an explicit `<label>` (no placeholder-only inputs — placeholders disappear when typing).
- Every collapsible section has `aria-expanded`.

### 11.4 Colour contrast

WCAG AA minimum. The token combinations to check:
- `text-foreground/60 on bg-card` → 4.7:1 ✓
- `text-foreground/35 on bg-card` → 2.1:1 ✗ — **never use for important info, only decorative**
- `text-primary on bg-card` → 5.8:1 ✓
- `text-primary on bg-primary/10` → 11:1 ✓ (the icon-on-tint pattern)

### 11.5 Live regions

Toasts, status updates, and the live presence indicators need `aria-live="polite"`. Use the `AdminToast` wrapper — it's built in.

---

## 11.5 CTA tone (Phase 1.9)

The voice across primary actions follows an **editorial-style** tone — quiet, confident, sentence case. No exclamations, no "Get started"-style platitudes.

| Surface | Primary CTA | Loading state |
|---|---|---|
| Onboarding · Identity | `Next` | Provisioning the org? "Reserving your address…". Resume? "Saving…". |
| Onboarding · Branding | `Next` | "Saving…" |
| Onboarding · Finish | `Open dashboard` | "Wrapping up…" |
| Editor save | `Save` | "Saving…" |
| List-page primary | Verb-led, sentence case (`Create event`, `New customer`) | `{Verb}ing…` |

**Why editorial over Apple-style or Stripe-style:** "Continue / Continue / Done / Save" (Apple) reads like a setup wizard for a phone, not a tool you live in. "Save / Activate / Publish / Save" (Stripe) is technical and verb-heavy in a way that doesn't match the rest of the surface. "Next / Next / Open dashboard / Save" is the editorial middle — it implies progress without ceremony, and it fits the same voice the public Midnight pages use ("Get tickets", "Reserve").

**Sentence case everywhere.** "Create event" not "Create Event". "Save" not "Save Changes". The fewer words, the heavier each one weighs — and the more confident the surface feels.

**Ellipsis (…) not three dots (...).** Use the actual character — it's one glyph, kerns cleanly, and reads as proper typography rather than a cheap stand-in.

---

## 12. Density (deferred to Phase 6)

A future "compact mode" lets power users opt into tighter spacing for high-volume admin work (booking-heavy nights, scanner ops at the door). The hook is just a boolean stored at `{org_id}_admin_density`; when true, wrapper components apply `[data-density="compact"]` to the body and adjust paddings down by one step.

**Not building this in Phase 0.** Documented here so we don't paint ourselves into a corner — make sure all wrapper components support a `density` prop or read from the data attribute when we get there.

---

## Wrapper-component-vs-shadcn migration tracker

When you upgrade an existing surface to use the new wrapper components, log it here. This is how we measure progress without ambiguity.

| Page | Migrated | Date | Notes |
|---|---|---|---|
| `src/app/admin/page.tsx` (dashboard) | ✅ | 2026-04-27 | Phase 0.2 pilot — AdminPageHeader, AdminCard, AdminBadge, FreshTenantHero |
| `src/app/admin/layout.tsx` (shell + sidebar) | ✅ | 2026-04-27 | Phase 0.3 — AdminBadge for Live indicator, overlay token cleanup |
| `src/app/admin/events/page.tsx` (list) | 🟨 | 2026-04-29 | AdminPageHeader applied. CTA verbs (1.9), slug chips (1.2), delete merged (1.5). Card swap to AdminCard pending. |
| `src/app/admin/orders/page.tsx` | 🟨 | 2026-04-29 | H1 typography swapped. AdminPageHeader pending — header has 2 conditional H1s. |
| `src/app/admin/customers/page.tsx` | 🟨 | 2026-04-29 | AdminPageHeader applied. |
| `src/app/admin/guest-list/page.tsx` | 🟨 | 2026-04-29 | AdminPageHeader applied. |
| `src/app/admin/discounts/page.tsx` | 🟨 | 2026-04-29 | AdminPageHeader applied. CTA "Create discount". |
| `src/app/admin/popup/page.tsx` | 🟨 | 2026-04-29 | H1 typography swapped (header has live status badge). |
| `src/app/admin/artists/page.tsx` | 🟨 | 2026-04-29 | H1 typography swapped (header has icon + action button). |
| `src/app/admin/merch/page.tsx` | 🟨 | 2026-04-29 | AdminPageHeader applied. CTA "Create merch". |
| `src/app/admin/merch-store/page.tsx` | 🟨 | 2026-04-29 | H1 typography swapped (header has enabled badge). |
| `src/app/admin/abandoned-carts/page.tsx` | 🟨 | 2026-04-29 | H1 typography swapped (header has hot-cart badge). |
| `src/app/admin/import-tickets/page.tsx` | 🟨 | 2026-04-29 | AdminPageHeader applied. |
| `src/app/admin/communications/page.tsx` | 🟨 | 2026-04-29 | AdminPageHeader added (page had no header before). |
| `src/app/admin/communications/marketing/page.tsx` | 🟨 | 2026-04-29 | H1 typography swapped (back-link + breadcrumb structure). |
| `src/app/admin/communications/transactional/page.tsx` | 🟨 | 2026-04-29 | H1 typography swapped. |
| `src/app/admin/campaigns/page.tsx` | 🟨 | 2026-04-29 | AdminPageHeader applied. |
| `src/app/admin/campaigns/email/page.tsx` | 🟨 | 2026-04-29 | H1 typography swapped (header has back-link + icon). |
| `src/app/admin/traffic/page.tsx` | 🟨 | 2026-04-29 | AdminPageHeader applied with dynamic subtitle. |
| `src/app/admin/reps/page.tsx` | 🟨 | 2026-04-29 | AdminPageHeader applied. |
| `src/app/admin/reps/event-boards/page.tsx` | 🟨 | 2026-04-29 | H1 typography swapped (back-link structure). |
| `src/app/admin/promoter/page.tsx` | 🟨 | 2026-04-29 | H1 typography swapped (icon + live preview structure). |
| `src/app/admin/ep/page.tsx` | 🟨 | 2026-04-29 | H1 typography swapped (icon + refresh button structure). |
| `src/app/admin/payments/page.tsx` | 🟨 | 2026-04-29 | H1 typography swapped (test-mode badge structure). |
| `src/app/admin/plans/page.tsx` | 🟨 | 2026-04-29 | AdminPageHeader applied. |
| `src/app/admin/connect/page.tsx` | 🟨 | 2026-04-29 | H1 typography swapped (was using legacy `admin-page-title` class). |
| `src/app/admin/ticketstore/page.tsx` | 🟨 | 2026-04-29 | H1 typography swapped. |
| `src/app/admin/merch-store/online/page.tsx` | 🟨 | 2026-04-29 | H1 typography swapped (Coming Soon badge structure). |
| `src/components/admin/event-editor/EventEditorHeader.tsx` | 🟨 | 2026-04-27 | Phase 1.9 — Save → "Save". Wrapper migration pending. |
| `src/components/admin/event-editor/SettingsTab.tsx` | 🟨 | 2026-04-27 | Phase 1.3 (live gates) + Phase 1.10 (Mobile Experience card). Wrapper migration pending. |
| `src/components/admin/event-editor/TicketCard.tsx` | 🟨 | 2026-04-27 | Phase 1.4 (VAT preview). Wrapper migration pending. |
| `src/components/admin/dashboard/FreshTenantHero.tsx` | ✅ | 2026-04-27 | Phase 1.1 — built fresh on AdminPanel + tile pattern. |
| `src/app/admin/events/[slug]/page.tsx` (editor → canvas) | ⬜ | — | Phase 3 |
| `src/app/admin/events/new/page.tsx` (Start moment) | ✅ | 2026-04-29 | Phase 2 complete — chrome-bypass full-screen shell, halo, mono Display heading, four-question form (template tile picker / name+slug check / datetime prefill / venue+city autocomplete), GTM instrumentation, generated cover via deterministic OG URL. The single canonical path to create an event. |
| `src/app/admin/orders/` | ⬜ | — | Phase 4+ |
| `src/app/admin/customers/` | ⬜ | — | Phase 4+ |
| `src/app/admin/guest-list/` | ⬜ | — | Phase 4+ |
| `src/app/admin/settings/*` | ⬜ | — | Phase 4+ |
| `src/app/admin/marketing/` | ⬜ | — | Phase 4+ |
| `src/app/admin/reps/` | ⬜ | — | Phase 4+ |

---

## Decision log

Append entries as `YYYY-MM-DD — decision — rationale`.

- *2026-04-27 — admin uses borders + soft shadows, never glass — glass is reserved for the public Midnight surface to keep a clear visual separation between "you're shopping for tickets" and "you're managing a business."*
- *2026-04-27 — wrapper components in `src/components/admin/ui/` chosen over global shadcn overrides — explicit, trackable migration; no silent regressions on public pages.*
- *2026-04-27 — Inter for everything except labels/eyebrows/numbers (Space Mono) — admin is a workspace, not a magazine; mono on body copy fatigues the eye.*
- *2026-04-27 — animation budget is one-per-page — admin is high-volume and motion-heavy interfaces become tiring after the third event of the day.*
- *2026-04-27 — wrapper components support `density="compact"` from day 1 (even though Phase 6 ships the toggle) — avoids a costly retrofit later.*
- *2026-04-27 — Display font is Space Mono, not Inter (corrects v1.0 typography table) — `FinishSection.tsx` is the named quality bar and uses Space Mono for its greeting. Public Midnight pages also use Space Mono prominently. Aligning the doc keeps the editorial signature consistent across surfaces.*

---

## Pickup checklist for implementers

When you sit down to build a new admin surface:

1. Open this doc. Skim philosophy + the relevant section.
2. Open `src/app/admin/onboarding/FinishSection.tsx` to remember the bar.
3. Use wrapper components from `src/components/admin/ui/`. If a wrapper doesn't exist yet, build it (don't reach for shadcn directly inside `/admin/*`).
4. Apply tokens, never hex. Use Tailwind arbitrary values only when the design genuinely needs them.
5. Build the empty state, loading state, and error state at the same time as the populated state. Not later.
6. Test at 375px before you ship. If it doesn't work on a phone, it's not done.
7. Add a focus ring check: tab through the whole page on the keyboard. Every interactive element should be reachable and visibly focused.
8. Add the page to the migration tracker above when you ship.
