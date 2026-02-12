# Domain / URL Change Checklist

Use this checklist when changing the platform domain (e.g. from `feralpresents.com` to a new domain).

---

## 1. Vercel (Hosting)

- [ ] Add new domain in Vercel → Project Settings → Domains
- [ ] Verify DNS is pointing to Vercel (CNAME or A record)
- [ ] Remove old domain from Vercel (only after new one is live)
- [ ] Update `NEXT_PUBLIC_SITE_URL` env var in Vercel to the new domain

## 2. Stripe (Payments)

- [ ] Update webhook endpoint URL: `https://NEW-DOMAIN/api/stripe/webhook`
  - Stripe Dashboard → Developers → Webhooks → Edit endpoint
  - Listening to: `payment_intent.succeeded` + `payment_intent.payment_failed`
- [ ] Register new domain for Apple Pay: Admin → Payments → Apple Pay Domain
  - Or via API: `POST /api/stripe/apple-pay-domain` with `{ "domain": "new-domain.com" }`
- [ ] Remove old domain from Apple Pay if no longer active
- [ ] Update Stripe Connect account URL in `src/app/api/stripe/connect/route.ts` (line 50)
  - Currently hardcoded: `url: "https://feralpresents.com"`

## 3. Supabase (Database)

- [ ] No changes needed — Supabase connects via API keys, not domain
- [ ] Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are still set in Vercel

## 4. Hardcoded URLs in Code

These files have `feralpresents.com` hardcoded and need updating:

### Metadata / SEO (Open Graph, Twitter Cards)

- [ ] `src/app/page.tsx` — lines 13, 14, 21
  - Landing page OG image + URL
- [ ] `src/app/event/[slug]/page.tsx` — lines 23, 24, 30, 31
  - Liverpool + Kompass event OG image + URL (hardcoded metadata)

### API Routes

- [ ] `src/app/api/orders/export/route.ts` — line 7
  - Fallback `BASE_URL` for CSV export (uses `NEXT_PUBLIC_SITE_URL` env var with fallback)
- [ ] `src/app/api/stripe/connect/route.ts` — line 50
  - Stripe Connect account creation URL

### Components

- [ ] `src/components/checkout/OrderConfirmation.tsx` — line 31
  - Fallback base URL for order confirmation

### Admin

- [ ] `src/app/admin/events/[slug]/page.tsx` — line 880
  - Display-only event URL shown to admin (cosmetic)

## 5. Brand / Social Links

If rebranding (not just domain change), update these too:

- [ ] `src/components/layout/Header.tsx` — line 62: merch store link (`feralclo.com`)
- [ ] `src/components/landing/ContactSection.tsx` — lines 70, 79, 88: Instagram, TikTok, Facebook links

## 6. Vercel Rewrites (agencyferal.com)

If `agencyferal.com` is also changing or being removed:

- [ ] `vercel.json` — lines 21, 26, 31, 36: host matching rules for `agencyferal.com`

## 7. External Services

- [ ] **Google Tag Manager** — Update container's allowed domains if restricted
- [ ] **Meta Pixel** — Update domain in Meta Events Manager → Settings → Allowed Domains
- [ ] **Meta CAPI** — `event_source_url` uses `NEXT_PUBLIC_SITE_URL` (auto-updates with env var)
- [ ] **Klaviyo** — Update sending domain / website URL in Klaviyo settings
- [ ] **Google Search Console** — Add new domain property, submit sitemap

## 8. DNS / SSL

- [ ] SSL certificate auto-provisions on Vercel (no action if using Vercel DNS)
- [ ] If using Cloudflare or custom DNS: ensure SSL mode is correct (Full Strict)
- [ ] Update any email MX records if domain includes email

## 9. Post-Change Verification

- [ ] Homepage loads correctly on new domain
- [ ] Event pages load (click through from homepage)
- [ ] Checkout flow works (create a test order)
- [ ] Apple Pay button appears (if registered)
- [ ] Admin dashboard accessible at `/admin/`
- [ ] Webhook test: Stripe Dashboard → Webhooks → Send test event
- [ ] OG metadata correct: paste new URL into Facebook/Twitter sharing debugger

---

## Quick Reference: What Does NOT Need Changing

| Thing | Why |
|-------|-----|
| Supabase connection | Uses API keys, not domain |
| Database data | No domain stored in DB rows |
| Stripe API keys | Tied to account, not domain |
| Payment processing | PaymentIntents don't reference domain |
| All `/api/*` routes | Relative paths, work on any domain |
| CSS / styles | No domain references |
| Internal navigation | All relative (`/event/...`, `/admin/...`) |

---

*Last updated: 2026-02-12*
