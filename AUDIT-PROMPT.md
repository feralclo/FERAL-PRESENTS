# Multi-Tenant Isolation Audit — Journey-Based

## What this is

You are auditing Entry, a white-label "Shopify for Events" ticketing platform. The platform operator is Entry. The first (and currently only) tenant is FERAL. A second tenant could onboard at any time. Your job is to find bugs that would break when that happens.

Read CLAUDE.md first — it is comprehensive and accurate.

## What's already been done

A previous audit already completed a full grep-based sweep of the codebase. It found and fixed ~70 files across 6 commits. Specifically, it already handled:

- All hardcoded `"feral"` org_id references → dynamic resolution
- All hardcoded `feral_` settings key prefixes → helper functions (`stripeAccountKey(orgId)`, `brandingKey(orgId)`, etc.)
- All hardcoded `#ff0033` (FERAL red) color defaults → `#8B5CF6` (platform default)
- All hardcoded `feralpresents.com` URL fallbacks → `entry.events`
- All hardcoded "FERAL" in admin placeholders, demo preview data, metadata
- Media upload keys namespaced with org_id (`media_{orgId}_{key}`)
- Merch deletion cross-tenant query leak (missing org_id filter)
- Stripe Connect account key using wrong settings key
- Middleware logging and query ordering fixes

**Do NOT re-audit string patterns like `feral`, `#ff0033`, or `feralpresents.com`.** That work is done. If you grep for those and find hits, they are either: (a) localStorage keys that intentionally keep the `feral_` prefix to avoid breaking existing users, (b) the `FALLBACK_ORG = "feral"` constant which is the correct default for the first tenant, or (c) test fixtures. These are not bugs.

## What this audit IS

This is a **journey-based functional audit**. Instead of grepping for strings, you are tracing complete user flows and asking: "If Tenant B onboarded tomorrow, would this flow work correctly and in complete isolation from Tenant A?"

### Method

For each journey below:
1. Trace the code path from entry point to database and back
2. Verify every database query filters by `org_id`
3. Verify the `org_id` comes from the correct source (not hardcoded, not leaked from another tenant)
4. Verify any cross-table joins or lookups are also scoped
5. Verify any external service calls (Stripe, Resend, Vercel) use the correct tenant's credentials/config
6. Verify any cached data is keyed by tenant (no shared cache poisoning)
7. Verify any generated URLs, codes, or identifiers won't collide between tenants

### Severity classification

- **CRITICAL**: Data from Tenant A visible to Tenant B, or actions on Tenant A affect Tenant B (cross-tenant data leak, cross-tenant mutation)
- **HIGH**: Feature completely broken for Tenant B (missing org_id filter means empty results, wrong Stripe account charged)
- **MEDIUM**: Cosmetic or non-functional issue for Tenant B (wrong branding shown briefly, wrong default text)
- **INFORMATIONAL**: Not a bug but worth noting (potential future issue, depends on config)

### What is NOT a bug

- `FALLBACK_ORG = "feral"` — this is intentional, it's the default when no domain/user resolution matches
- `feral_cookie_consent` and other `feral_` localStorage keys — platform-level browser storage, not tenant-specific
- Comments or JSDoc examples mentioning FERAL — these don't execute
- The middleware wildcard subdomain trust model — documented and intentional (queries return empty for non-existent orgs)
- Pre-existing test failures in `orders.test.ts` and `rep-deletion.test.ts` — known, unrelated

## Journeys to trace

### Journey 1: Ticket buyer on Tenant B's custom domain
```
Buyer visits tenantb.com
→ Middleware resolves org_id from domains table
→ Event page loads (event/[slug]/page.tsx)
→ Event data fetched (GET /api/events?slug=X)
→ Ticket types displayed
→ Buyer adds tickets to cart
→ Buyer enters checkout (event/[slug]/checkout/page.tsx)
→ Email captured (POST /api/checkout/capture → abandoned_carts)
→ PaymentIntent created (POST /api/stripe/payment-intent)
→ Stripe charge on Tenant B's connected account (not Tenant A's, not platform's)
→ Webhook confirms payment (POST /api/stripe/webhook)
→ Order created (lib/orders.ts → createOrder)
→ Tickets generated with unique codes
→ Email sent via Resend with correct branding
→ PDF ticket has correct branding/colors
→ Wallet pass has correct branding
→ Buyer receives order confirmation
```
Key questions: Does the Stripe PaymentIntent use Tenant B's connected account? Does the webhook create the order under Tenant B's org_id? Does the email use Tenant B's branding? Could Tenant A's orders appear in Tenant B's order list?

### Journey 2: Tenant B admin sets up their org
```
Admin logs into admin.entry.events
→ Middleware resolves org_id from org_users table
→ Admin configures branding (POST /api/branding)
→ Admin configures email templates (POST /api/settings)
→ Admin configures Stripe Connect (admin/payments page)
→ Admin adds custom domain (POST /api/domains)
→ Admin creates an event (POST /api/events)
→ Admin creates ticket types
→ Admin creates discount codes (POST /api/discounts)
→ Admin uploads images (POST /api/upload)
→ Admin views dashboard (GET /api/admin/dashboard)
→ Admin views orders (GET /api/orders)
→ Admin exports orders CSV (GET /api/orders/export)
→ Admin scans tickets (POST /api/tickets/[code]/scan)
```
Key questions: Can Tenant B's admin see Tenant A's events, orders, customers, or settings? If both tenants have an event with slug "summer-party", do they collide? Are uploaded images isolated?

### Journey 3: Rep program on Tenant B
```
Rep signs up via invite link
→ Rep assigned to Tenant B's org_id
→ Rep views dashboard (rep portal pages)
→ Rep shares referral link
→ Buyer purchases via referral → attribution tracked
→ Rep earns points
→ Rep completes quests (uploads proof)
→ Rep claims rewards
→ Leaderboard shows only Tenant B's reps
```
Key questions: Are rep referral links scoped to the correct org? Could a rep from Tenant A appear on Tenant B's leaderboard? Are quest submissions and point logs isolated?

### Journey 4: Cron jobs and background processes
```
Abandoned cart cron fires (POST /api/cron/abandoned-carts)
→ Should process ALL tenants' abandoned carts
→ Each email uses the correct tenant's branding
→ Unsubscribe links work per-tenant
```
Key questions: Does the cron iterate over all orgs or just one? Are there other cron jobs with the same issue?

### Journey 5: Edge cases and cross-cutting concerns
- Two tenants create a discount code with the same code string (e.g., "SUMMER10") — do they collide?
- Two tenants upload an image with the same key — do they overwrite each other?
- Tenant A's admin tries to access Tenant B's event by ID via API — is it blocked?
- A user is both an admin for Tenant A and a rep for Tenant B — does auth work correctly?
- Rate limiting — is it per-tenant or global? Could Tenant A's traffic lock out Tenant B?
- Realtime subscriptions (Supabase) — are they filtered by org_id?
- Guest list entries — scoped by org_id?

## Output format

For each journey, report:
1. **Flow traced**: Brief description of what you verified
2. **Status**: PASS / FAIL
3. **Issues found**: If FAIL, list each issue with severity, file:line, and specific description
4. **Fix**: For each issue, provide the exact code change

Group all fixes at the end with a summary count: X CRITICAL, Y HIGH, Z MEDIUM.

If you find zero issues in a journey, say PASS and move on. Do not manufacture problems. The previous audit was thorough — it's entirely possible some journeys are already clean. That's a good outcome, not a failure of your audit.

## Important constraints

- **Read before judging.** Don't flag something as a bug until you've read the actual code. Many things that look wrong from a grep hit are actually correct in context.
- **Understand the architecture.** org_id resolution happens in middleware and is passed via headers. `requireAuth()` returns `auth.orgId`. `requireRepAuth()` returns `rep.org_id`. `getOrgId()` reads from headers. These are the correct patterns.
- **Don't fix what isn't broken.** If a query correctly filters by org_id, don't suggest adding redundant filters.
- **Don't refactor.** This is an audit, not a cleanup. Only flag functional multi-tenancy issues.
- **Do fix what you find.** If you find a real bug, fix it — don't just report it. Use the MCP tools for any database changes.
