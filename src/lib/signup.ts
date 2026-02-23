import { TABLES, planKey } from "@/lib/constants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Self-service signup: shared org provisioning logic.
 *
 * Used by both the email/password signup route and the Google OAuth callback
 * to create a new org (org_users row + subdomain + Starter plan).
 */

/** Protected slugs that cannot be used as org identifiers. */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "auth",
  "www",
  "feral",
  "entry",
  "events",
  "event",
  "stripe",
  "supabase",
  "vercel",
  "app",
  "dashboard",
  "login",
  "signup",
  "register",
  "invite",
  "settings",
  "account",
  "billing",
  "support",
  "help",
  "docs",
  "blog",
  "status",
  "mail",
  "email",
  "cdn",
  "static",
  "assets",
  "media",
  "upload",
  "dev",
  "staging",
  "test",
  "demo",
  "preview",
  "beta",
  "alpha",
  "prod",
  "production",
  "internal",
  "platform",
  "system",
  "root",
  "null",
  "undefined",
  "rep",
  "reps",
]);

/**
 * Convert a human-readable org name to a URL-safe slug.
 * Lowercase, replace non-alphanumeric with hyphens, trim, 3-40 chars.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumeric → hyphens
    .replace(/^-+|-+$/g, "")     // trim leading/trailing hyphens
    .slice(0, 40);               // max 40 chars
}

/**
 * Check if a slug is available for use as an org_id.
 * Checks reserved list + queries org_users for existing org_id.
 */
export async function validateSlug(
  slug: string
): Promise<{ available: boolean; suggestion?: string }> {
  // Must be 3-40 chars, alphanumeric + hyphens only
  if (!slug || slug.length < 3 || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    return { available: false };
  }

  // Reserved slugs
  if (RESERVED_SLUGS.has(slug)) {
    return { available: false, suggestion: `${slug}-events` };
  }

  const supabase = await getSupabaseAdmin();
  if (!supabase) return { available: false };

  // Check if any org already uses this slug as their org_id
  const { data } = await supabase
    .from(TABLES.ORG_USERS)
    .select("org_id")
    .eq("org_id", slug)
    .limit(1);

  if (data && data.length > 0) {
    return { available: false, suggestion: `${slug}-2` };
  }

  return { available: true };
}

interface ProvisionOrgParams {
  authUserId: string;
  email: string;
  orgSlug: string;
  orgName: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Provision a new org: create org_users row, subdomain domain, and Starter plan.
 * All writes use getSupabaseAdmin() (service role, bypasses RLS).
 *
 * If any step fails after a prior step succeeded, attempts cleanup.
 */
export async function provisionOrg(params: ProvisionOrgParams): Promise<{
  orgSlug: string;
  orgName: string;
}> {
  const { authUserId, email, orgSlug, orgName, firstName, lastName } = params;
  const supabase = await getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase not configured");

  const now = new Date().toISOString();

  // Step 1: Insert org_users row (owner)
  const { error: orgUserError } = await supabase.from(TABLES.ORG_USERS).insert({
    auth_user_id: authUserId,
    org_id: orgSlug,
    email: email.toLowerCase(),
    first_name: firstName || null,
    last_name: lastName || null,
    role: "owner",
    status: "active",
    perm_events: true,
    perm_orders: true,
    perm_marketing: true,
    perm_finance: true,
    created_at: now,
    updated_at: now,
  });

  if (orgUserError) {
    console.error("[signup] Failed to create org_users row:", orgUserError);
    throw new Error("Failed to create organization");
  }

  // Step 2: Insert domain row for subdomain
  const { error: domainError } = await supabase.from(TABLES.DOMAINS).insert({
    hostname: `${orgSlug}.entry.events`,
    org_id: orgSlug,
    type: "subdomain",
    status: "active",
    is_primary: true,
    created_at: now,
    updated_at: now,
  });

  if (domainError) {
    console.error("[signup] Failed to create domain row:", domainError);
    // Cleanup: remove org_users row
    await supabase
      .from(TABLES.ORG_USERS)
      .delete()
      .eq("auth_user_id", authUserId)
      .eq("org_id", orgSlug);
    throw new Error("Failed to create organization subdomain");
  }

  // Step 3: Upsert plan settings (Starter)
  const { error: planError } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .upsert(
      {
        key: planKey(orgSlug),
        data: {
          plan_id: "starter",
          assigned_by: "self-signup",
          assigned_at: now,
        },
        org_id: orgSlug,
        updated_at: now,
      },
      { onConflict: "key" }
    );

  if (planError) {
    console.error("[signup] Failed to create plan settings:", planError);
    // Cleanup: remove domain + org_users
    await supabase.from(TABLES.DOMAINS).delete().eq("org_id", orgSlug).eq("type", "subdomain");
    await supabase.from(TABLES.ORG_USERS).delete().eq("auth_user_id", authUserId).eq("org_id", orgSlug);
    throw new Error("Failed to initialize organization plan");
  }

  return { orgSlug, orgName };
}
