import crypto from "crypto";

/**
 * Stripe Connect OAuth (Standard accounts) — state-token helpers.
 *
 * Standard Connect lets a tenant link their EXISTING Stripe account in ~30s
 * via OAuth, instead of going through Custom onboarding from scratch. This
 * sits alongside the Custom flow in `/api/stripe/connect/my-account` — both
 * write the same `{org_id}_stripe_account` setting, so per-event routing and
 * application_fee logic in payment-intent are unaffected.
 *
 * The state token binds the OAuth round-trip to a specific org + short window
 * so a tampered or replayed callback can't attach an account to the wrong org.
 */

const STATE_TTL_MS = 15 * 60 * 1000;

export function isOAuthConfigured(): boolean {
  return Boolean(process.env.STRIPE_CONNECT_CLIENT_ID && process.env.STRIPE_SECRET_KEY);
}

function getOAuthSecret(): Buffer {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to sign OAuth state");
  }
  return crypto.createHmac("sha256", base).update("stripe-connect-oauth-state-v1").digest();
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signOAuthState(orgId: string): string {
  const payload = { orgId, nonce: crypto.randomUUID(), ts: Date.now() };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(crypto.createHmac("sha256", getOAuthSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export type OAuthStateVerification =
  | { ok: true; orgId: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyOAuthState(state: string): OAuthStateVerification {
  const parts = state.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, sig] = parts;

  let expected: Buffer;
  let received: Buffer;
  try {
    expected = crypto.createHmac("sha256", getOAuthSecret()).update(body).digest();
    received = b64urlDecode(sig);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (expected.length !== received.length) return { ok: false, reason: "bad_signature" };
  if (!crypto.timingSafeEqual(expected, received)) return { ok: false, reason: "bad_signature" };

  let payload: { orgId?: unknown; ts?: unknown };
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const orgId = typeof payload.orgId === "string" ? payload.orgId : null;
  const ts = typeof payload.ts === "number" ? payload.ts : null;
  if (!orgId || !ts) return { ok: false, reason: "malformed" };
  if (Date.now() - ts > STATE_TTL_MS) return { ok: false, reason: "expired" };

  return { ok: true, orgId };
}

/**
 * Build the Stripe Connect OAuth authorize URL.
 * Pre-fills the signup form with the tenant's email + business name so the
 * round-trip is instant for users who already have a Stripe account.
 */
export function buildAuthorizeUrl(opts: {
  state: string;
  redirectUri: string;
  email?: string | null;
  businessName?: string | null;
  country?: string | null;
}): string {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  if (!clientId) throw new Error("STRIPE_CONNECT_CLIENT_ID is not set");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "read_write",
    state: opts.state,
    redirect_uri: opts.redirectUri,
  });
  if (opts.email) params.set("stripe_user[email]", opts.email);
  if (opts.businessName) params.set("stripe_user[business_name]", opts.businessName);
  if (opts.country) params.set("stripe_user[country]", opts.country);

  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}
