# Entry — Admin Pages Index

Linked from `CLAUDE.md`. `/admin/*` — 33 directories (`requireAuth()` unless flagged owner-only).

- **Daily ops**: `/` (dashboard + `OnboardingChecklist`), `/events/` + `/[slug]/` (Content/Design/Details/Tickets/Waitlist/SEO tabs), `/orders/`, `/customers/`, `/scanner/`, `/guest-list/` (4 tabs), `/abandoned-carts/`, `/import-tickets/` (CSV via `lib/import-csv.ts` + `lib/import-tickets.ts`; `payment_method:"imported"`, no email), `/discounts/`, `/popup/`, `/artists/`, `/merch/`, `/merch-store/`.
- **Brand & content**: `/onboarding/` (3-step), `/settings/` (9 subs: branding, domains, general, plan, search-social, integrations, users, finance, scanner), `/ticketstore/` (theme builder).
- **Marketing**: `/marketing/` (Klaviyo), `/communications/` (templates), `/campaigns/` + `/email/` (live: guest-list outreach), `/traffic/`.
- **Rep program**: `/reps/` (6 tabs: Dashboard / Reps / Rewards / Quests / Reports / Settings — Library promoted to `/admin/library/`), `/promoter/` (public profile), `/ep/` (Float / Earned / Ledger / Payouts + Buy EP).
- **Creative**: `/library/` (Library — campaigns rail + canvas on desktop, chip strip on mobile. Active `?campaign=<slug>` swaps the canvas to a stat row + linked-quests + top-assets + scoped grid. "All assets" is the existing multi-kind workspace. Bulk upload sheet routes images via Sharp/WebP and videos via Mux capped-1080p, every batch tagged to one campaign). Shared between Rep Programme + Events editor + the inline picker (`<CoverImagePicker kind=…>`) on each cover/asset surface.
- **Money**: `/payments/` (Stripe Custom 5-state), `/finance/` → `/settings/finance/`, `/plans/`.
- **Owner only**: `/connect/` (all Stripe accounts, fee defaults), `/command/` (UK command center: globe + map + live sessions), `/platform-settings/`, `/backend/` (8 subs: beta, plans, health, tenants, payment-health, platform-settings, connect, xp), `/beta/`.
- **Auth**: `/login/`, `/signup/`, `/account/`, `/invite/[token]/`.
