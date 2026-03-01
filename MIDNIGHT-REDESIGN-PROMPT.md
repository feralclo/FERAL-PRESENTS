# Midnight Event Page — Ground-Up Visual Redesign

## READ THIS FIRST — Why This Prompt Exists

This task has been attempted **5+ times** by AI agents. Every single time, the agent reads the existing code, gets anchored to the current design patterns, and delivers **incremental CSS tweaks** instead of a genuine redesign. Adjusting opacity values, changing padding, tweaking border widths — that is NOT a redesign. That is a refinement pass.

**This time must be different.** You are being asked to create a fundamentally new visual experience. Same components, same props, same hooks — but the visual output should be unrecognizable from what exists today.

### The Anchoring Trap — How to Avoid It

The reason agents keep failing is:
1. They read existing component JSX → their brain locks onto the existing element structure
2. They see existing Tailwind classes → they adjust values instead of replacing approaches
3. They interpret "technical constraints" as "don't change much"
4. They optimize for safety over ambition

**Your process MUST be:**
1. Read the **Design Vision** section below FIRST
2. Study the **Design References** to build a mental model of the target aesthetic
3. Read the **Technical Contract** (props, hooks, constraints) — NOT the existing component implementations
4. Only THEN look at existing files — and when you do, treat them as **reference for prop shapes and hook APIs only**, not as a starting point for your design
5. Write each component's JSX fresh. Do not copy-paste existing JSX and modify it.

---

## What You're Building

**Entry** is a white-label events and ticketing platform ("Shopify for Events"). The **Midnight theme** is the default public-facing event page where ticket buyers browse event info and purchase tickets. This is the revenue-generating surface — it must be beautiful, fast, and make competitors (Dice, Eventbrite, FIXR) look dated.

Most ticket buyers are on phones. Mobile UX is the #1 priority.

### Current State (What You're Replacing)

The current Midnight theme is a dark cyberpunk aesthetic with:
- Glassmorphism (backdrop-blur cards)
- Metallic tier gradients (platinum shimmer, obsidian, valentine)
- CRT-inspired details
- Monospace typography everywhere (Space Mono)
- Red accent color (#ff0033)

**You are replacing ALL of this.** The new design should share NONE of the same visual language. If someone compared a screenshot of the old design to your new design, they should look like completely different products.

---

## Design Vision — The New Midnight

### Aesthetic Direction: Modern Editorial Luxury

Think: the intersection of a premium fashion e-commerce experience and a world-class music venue's digital presence. Clean. Confident. Effortless.

**Mood keywords:** Restrained elegance, editorial precision, breathing room, intentional emptiness, typographic hierarchy, quiet confidence, tactile surfaces

**NOT:** Busy, neon, glitchy, retro, techno-club, heavy gradients, glassmorphism

### Typography Strategy

The current design uses Space Mono (monospace) for literally everything — headings, body, labels, prices, buttons. This makes everything feel same-y and monotonous.

**New approach — create contrast through type:**
- **Display/Headings**: Use `var(--font-display)` or `var(--font-sans)` (Inter) — large, confident, possibly with letter-spacing or case treatments. Headlines should BREATHE.
- **Mono for data only**: Prices, quantities, ticket codes, status badges — the functional stuff. `var(--font-mono)` (Space Mono) becomes the accent typeface, not the default.
- **Body text**: Inter (`var(--font-sans)`) for descriptions, about text, details. Comfortable reading size, generous line-height.

### Color & Surface

- **Background**: Near-black, but warm — not cold blue-black. Think charcoal, deep graphite.
- **Primary accent**: The accent color comes from CSS vars (`--accent`, mapped to `--color-primary` via the theme's Tailwind tokens). Currently red — design should work with ANY accent color since this is white-label.
- **Surfaces**: Instead of glassmorphism (backdrop-blur), use **subtle elevation** — very slight background color shifts, thin borders, or shadow layers. Cards should feel like they're resting ON the page, not floating behind frosted glass.
- **Text hierarchy**: Pure white for headlines, warm gray for body, muted gray for tertiary. Three clear levels.

### Spatial Design

- **Generous whitespace**: Let content breathe. The current design crams elements together. Add real breathing room between sections — 80px+ gaps on mobile, 120px+ on desktop.
- **Full-width moments**: Some elements should break the container and go edge-to-edge on mobile (hero, ticket widget, dividers).
- **Asymmetric layouts on desktop**: The current 2-column grid is fine structurally but the columns feel like two boxes. Make the left column feel editorial (long-form, generous), the right column feel like a utility panel (tight, functional, sticky).

### Motion & Interaction

- **Scroll-triggered reveals**: Content should fade/slide in as it enters the viewport. Subtle — 20px translate, 400ms ease.
- **Micro-interactions on ticket cards**: When tapping +/-, the quantity should have a satisfying pop. When a ticket is added, the card should subtly acknowledge it (border color shift, gentle scale pulse).
- **Transitions over animations**: Don't loop things. Respond to user actions with smooth transitions. The only ambient animation should be very subtle and ignorable.

### Component-Specific Vision

**Hero:**
- Full-bleed image with a cinematic crop. NOT a centered box.
- Title and metadata overlaid on the image, positioned at the bottom (like a film poster or magazine cover).
- Think: Resident Advisor event page, SSENSE product hero, Apple TV+ show pages.
- The CTA ("Get Tickets") should be elegant, not screaming. Understated but findable.
- On mobile: the hero is the first thing they see. Make it arresting but don't let it eat too much scroll space — they need to get to tickets fast.

**Ticket Widget (right column on desktop, first on mobile):**
- Clean card with clear hierarchy: heading → tier progression → ticket cards → checkout CTA → express checkout.
- The checkout button should transform as items are added — from passive/disabled to alive/ready. Not with glow effects, but with confident color and weight changes.
- Express Checkout (Apple Pay / Google Pay) should feel native, not bolted on.

**Ticket Cards:**
- Each ticket type is a row/card. Name, description, price, quantity controls.
- Standard tier: clean and minimal.
- Premium tiers (platinum, black, valentine): distinguished by SUBTLE markers — a colored left border, a tier badge, a background tint. NOT full metallic gradient explosions. Luxury is quiet.
- Quantity controls: clean stepper. Current value should be the visual anchor.

**Lineup:**
- Artist names displayed with editorial flair. Not just pills in a flex-wrap.
- Think: a credits sequence, a gallery wall, a magazine contributors page.
- Could be: large stacked names, a grid, a flowing comma-separated list with hover effects — whatever feels fresh.

**About/Details:**
- Long-form content. Let the text breathe with generous line-height and max-width.
- Section headings should be distinctive — large, spaced, editorial.

**Bottom Bar (mobile):**
- Fixed at bottom, shows when cart has items.
- Minimal: total + checkout button. Should feel like part of the OS, not part of the page.

**Merch Modal:**
- Full-screen or near-full-screen on mobile.
- Product imagery large and centered. Size selector clean.
- Think: how SSENSE or Mr Porter present a product.

---

## Design References

Study these before writing any code:

1. **SSENSE** (ssense.com) — Product pages. Notice: massive imagery, restrained type, generous whitespace, black backgrounds with warm undertones
2. **Resident Advisor** (ra.co) — Event pages. Notice: editorial layout, clean information hierarchy, confident typography
3. **Bottega Veneta** (bottegaveneta.com) — Notice: the absolute confidence of simplicity. Barely any color. Let the content speak.
4. **Apple TV+** show pages — Notice: cinematic hero images, content overlaid at bottom, scroll-reveal content below
5. **Spotify Canvas / Wrapped** — Notice: bold type pairings, full-bleed color/image, clear visual rhythm

### Anti-References (What NOT to Do)

- **Eventbrite** — Cluttered, form-like, no visual identity
- **FIXR** — Generic card layouts, no editorial quality
- **Current Midnight theme** — Glassmorphism, metallic shimmer, CRT effects, mono-everywhere, neon glow

---

## Technical Contract

These are the rules you CANNOT break. Everything else is creative freedom.

### Component Architecture (MUST keep)

You are rewriting the VISUAL OUTPUT of these components. The component names, file locations, prop interfaces, and hook usage stay the same. The JSX inside each component is what you're redesigning.

| Component | File | Props (DO NOT CHANGE) |
|-----------|------|-----------------------|
| MidnightEventPage | `src/components/midnight/MidnightEventPage.tsx` | `{ event }` — orchestrator, manages hooks + state |
| MidnightHero | `src/components/midnight/MidnightHero.tsx` | `{ title, date, doors, location, age, bannerImage, tag? }` |
| MidnightTicketWidget | `src/components/midnight/MidnightTicketWidget.tsx` | `{ eventSlug, eventId, paymentMethod, currency, ticketTypes, cart, ticketGroups?, ticketGroupMap?, onViewMerch? }` |
| MidnightTicketCard | `src/components/midnight/MidnightTicketCard.tsx` | `{ ticket, qty, currSymbol, onAdd, onRemove, onViewMerch? }` |
| MidnightMerchModal | `src/components/midnight/MidnightMerchModal.tsx` | `{ isOpen, onClose, onAddToCart, merchName?, merchDescription?, merchImages?, merchPrice?, currencySymbol?, availableSizes?, vipBadge? }` |
| MidnightEventInfo | `src/components/midnight/MidnightEventInfo.tsx` | `{ aboutText?, detailsText?, description? }` |
| MidnightLineup | `src/components/midnight/MidnightLineup.tsx` | `{ artists }` |
| MidnightCartSummary | `src/components/midnight/MidnightCartSummary.tsx` | `{ items, totalPrice, totalQty, currSymbol }` |
| MidnightTierProgression | `src/components/midnight/MidnightTierProgression.tsx` | `{ tickets, currSymbol }` |
| MidnightSocialProof | `src/components/midnight/MidnightSocialProof.tsx` | No props (internal timing state) |
| MidnightFooter | `src/components/midnight/MidnightFooter.tsx` | No props (uses useBranding hook) |
| MidnightFloatingHearts | `src/components/midnight/MidnightFloatingHearts.tsx` | No props (Valentine tier animation) |

**You may also create/delete helper files** like `tier-styles.ts`, `MidnightSizeSelector.tsx`, `MidnightCartToast.tsx`, `MidnightBottomBar.tsx` — these are internal helpers, not part of the public contract.

### Hooks (DO NOT MODIFY — use as-is)

```typescript
// Cart state — from useCart() hook, passed via cart prop to TicketWidget
const { activeTypes, quantities, sizePopup, setSizePopup, totalQty, totalPrice,
        cartItems, expressItems, currSymbol, addTicket, removeTicket,
        handleSizeConfirm, handleCheckout } = cart;

// Event tracking — used in MidnightEventPage orchestrator
const tracking = useEventTracking();  // { trackPageView, trackViewContent, trackAddToCart }
const { push: pushDataLayer } = useDataLayer();

// Header scroll behavior
const { scrollDir } = useHeaderScroll(headerRef);

// Branding — used in footer
const branding = useBranding();

// Settings — available via context
const { settings } = useSettings();
```

### CSS Architecture (MUST follow)

1. **midnight.css** — Tailwind v4 theme token mapping. You CAN modify the `@theme inline {}` block to add new tokens, but the base mapping (accent → primary, bg-dark → background, etc.) must remain so white-label branding keeps working.

2. **midnight-effects.css** — All custom CSS effects. **Rewrite this entirely.** Remove the glassmorphism, metallic shimmer, CRT suppression. Replace with whatever your new design language needs (scroll-reveal keyframes, surface treatments, tier indicators, etc.).

3. **Theme scoping**: All CSS must be scoped to `[data-theme="midnight"]`. Never leak styles globally.

4. **Tailwind for layout**: All spacing, responsive, grid, flex via utility classes. Use `cn()` from `@/lib/utils` for conditional classes.

5. **shadcn/ui components**: Use these for all interactive elements:
   - `Dialog` for modals (MerchModal, SizePopup) — provides focus trap + aria-modal + Escape close
   - `Button` from `@/components/ui/button`
   - `Card` / `CardContent` from `@/components/ui/card`
   - `Badge` from `@/components/ui/badge`
   - `Separator` from `@/components/ui/separator`

6. **CSS imports**: Only `MidnightEventPage.tsx` (the orchestrator) imports CSS files. Child components do NOT import CSS.

### iOS Safari Constraints (MUST follow — these cause real bugs)

1. **Hero height**: Use FIXED PIXEL VALUES (e.g., `620px`, `460px`, `400px`). Never use `vh`, `svh`, `dvh` — Safari resizes the viewport on scroll, causing the hero to animate/jank.

2. **Hero image**: Use CSS `background-image` on a div (via inline style or class). Do NOT use `<img>` or `<Image>` for the hero background — it causes pop-in glitches on Safari when the browser repaints during scroll.

3. **Header**: Do NOT use `backdrop-filter: blur()` on the header. Safari recalculates blur on every scroll frame, causing visible jank. Use a solid/semi-transparent background instead.

### Stripe Express Checkout (MUST follow)

The Express Checkout (Apple Pay / Google Pay) element must be **always mounted** in the DOM, hidden when `totalQty === 0`. Use `opacity-0 pointer-events-none max-h-0 overflow-hidden` to hide it, `opacity-100 pointer-events-auto max-h-[200px]` to reveal it. Do NOT conditionally render it (`{totalQty > 0 && <ExpressCheckout />}`) — mounting destroys the preloaded Stripe session.

The `<ExpressCheckout>` component is imported from `@/components/checkout/ExpressCheckout` and takes these props:
```typescript
<ExpressCheckout
  eventId={eventId}
  currency={currency}
  amount={totalPrice}
  items={expressItems}
  onSuccess={handleExpressSuccess}
  onError={setExpressError}
/>
```

### Pointer Events on Content Section (MUST follow)

The content section overlaps the hero via negative margin on mobile (`-mt-[var(--midnight-hero-overlap)]`). Because this section sits above the hero in z-index, it blocks clicks on any hero CTA button. Fix: put `pointer-events-none` on the section wrapper, `pointer-events-auto` on the content div inside it.

### Mobile Layout Order (MUST follow)

On mobile (below `lg` breakpoint), content reorders:
1. **Tickets** appear FIRST (above the fold, `order-1`)
2. **Event info** (about, lineup, details) appears SECOND (`order-2`)

On desktop (`lg`+), it's a 2-column grid: info on left, tickets (sticky) on right.

### Accessibility

- `prefers-reduced-motion: reduce` — disable all animations and transitions
- Ticket cards: `role="article"` + `aria-label` with ticket name and price
- Size dialog: Radix Dialog handles focus trap + aria-modal automatically
- Quantity buttons: `aria-label="Add {name}"` / `aria-label="Remove {name}"`

---

## Deliverables

### Files to Rewrite (fresh JSX, new visual design):
1. `src/components/midnight/MidnightHero.tsx`
2. `src/components/midnight/MidnightTicketWidget.tsx`
3. `src/components/midnight/MidnightTicketCard.tsx`
4. `src/components/midnight/MidnightMerchModal.tsx`
5. `src/components/midnight/MidnightEventInfo.tsx`
6. `src/components/midnight/MidnightLineup.tsx`
7. `src/components/midnight/MidnightCartSummary.tsx`
8. `src/components/midnight/MidnightTierProgression.tsx`
9. `src/components/midnight/MidnightSocialProof.tsx`
10. `src/components/midnight/MidnightFooter.tsx`
11. `src/components/midnight/MidnightEventPage.tsx` (orchestrator — layout structure, spacing, section composition)
12. `src/styles/midnight-effects.css` (full rewrite — new design language)

### Files to Modify Carefully:
13. `src/styles/midnight.css` — May need new tokens in `@theme inline {}`. Keep base mapping intact.

### Files You May Create/Delete:
- Helper components (`MidnightBottomBar.tsx`, `MidnightSizeSelector.tsx`, `MidnightCartToast.tsx`, `tier-styles.ts`, etc.) — create or delete as your design requires.

### Verification:
- `npm run build` must pass with zero errors
- Test on mobile viewport (375px) — this is the primary experience
- All ticket tiers (standard, platinum, black, valentine) must be visually distinct
- Express Checkout must be always-mounted and reveal smoothly
- Size popup dialog must function (Radix Dialog)
- Cart summary must show/hide based on cart contents

---

## Branch

Create and work on: `feature/midnight-redesign-v2`

```bash
git checkout main && git pull origin main
git checkout -b feature/midnight-redesign-v2
```

---

## Verification Checklist (Is This Actually a Redesign?)

Before you call this done, screenshot the result (mentally) and answer these questions:

- [ ] Would someone comparing old vs new screenshots think these are DIFFERENT PRODUCTS? If not, keep going.
- [ ] Is the typography system fundamentally different? (Not just size tweaks — different typeface usage, hierarchy, spacing philosophy)
- [ ] Are the surface treatments fundamentally different? (Not glassmorphism with different opacity — a completely different approach to cards and containers)
- [ ] Is the hero composition fundamentally different? (Not the same centered layout with tweaked gradients — a different spatial approach)
- [ ] Do ticket cards look fundamentally different? (Not the same layout with rounded corners — a different information hierarchy)
- [ ] Does the lineup section look fundamentally different? (Not pills with different borders — a fresh approach to displaying artist names)
- [ ] Would this page make someone say "whoa, this is new" or "oh, they updated some colors"?

If any answer is "no" — you haven't done a redesign. Go back and be bolder.
