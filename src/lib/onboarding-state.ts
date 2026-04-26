/**
 * Onboarding wizard state — read/write/migrate helpers.
 *
 * State lives in `site_settings` under one of two keys:
 *   - `wizard_state_{auth_user_id}` (platform key, before org provisioning)
 *   - `{org_id}_onboarding`         (org key, after provisioning)
 *
 * The wizard runs sections like identity/country/branding BEFORE the slug is locked,
 * so the user has no org_id yet — hence the platform-level temp key. When `provisionOrg`
 * runs, `migrateWizardStateToOrg` copies the platform row into the org row and deletes
 * the temp row.
 */

import { TABLES, onboardingKey, wizardStateKey } from "@/lib/constants";
import type {
  OnboardingWizardState,
  WizardSection,
  WizardSectionState,
} from "@/types/settings";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const EMPTY_STATE: OnboardingWizardState = {
  sections: {},
};

/**
 * Decide which settings key to use. Pre-org → wizardStateKey, post-org → onboardingKey.
 * If `orgId` is provided, the org key wins (a user with an org has finished provisioning).
 */
export function resolveStateKey(opts: {
  authUserId: string;
  orgId?: string | null;
}): { key: string; isOrgScoped: boolean } {
  if (opts.orgId) {
    return { key: onboardingKey(opts.orgId), isOrgScoped: true };
  }
  return { key: wizardStateKey(opts.authUserId), isOrgScoped: false };
}

/** Read wizard state. Returns EMPTY_STATE if nothing exists yet. */
export async function readWizardState(opts: {
  authUserId: string;
  orgId?: string | null;
}): Promise<OnboardingWizardState> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return EMPTY_STATE;

  const { key } = resolveStateKey(opts);
  const { data } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("data")
    .eq("key", key)
    .maybeSingle();

  if (!data?.data) return EMPTY_STATE;

  // Defensive: spread defaults so missing fields don't crash callers.
  const loaded = data.data as Partial<OnboardingWizardState>;
  return {
    ...EMPTY_STATE,
    ...loaded,
    sections: loaded.sections ?? {},
  };
}

/**
 * Merge a section update into wizard state. Returns the new full state.
 *
 * - Sets `last_section` to the section being patched.
 * - Sets `visited_at` on first touch, `completed_at` if `complete: true`.
 * - Marks `skipped: true` if `skip: true` (and clears `completed_at`).
 * - Initialises `started_at` on first ever write.
 */
export async function patchWizardSection(opts: {
  authUserId: string;
  orgId?: string | null;
  section: WizardSection;
  data?: Record<string, unknown>;
  complete?: boolean;
  skip?: boolean;
  /** Top-level state fields callers can update (event_types, experience_level). */
  extras?: Partial<Pick<OnboardingWizardState, "event_types" | "experience_level" | "completed_at">>;
}): Promise<OnboardingWizardState> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase admin client unavailable");
  }

  const { key, isOrgScoped } = resolveStateKey(opts);
  const current = await readWizardState(opts);
  const now = new Date().toISOString();

  const existingSection: WizardSectionState = current.sections[opts.section] ?? {};
  const nextSection: WizardSectionState = {
    ...existingSection,
    visited_at: existingSection.visited_at ?? now,
    ...(opts.data !== undefined ? { data: { ...(existingSection.data ?? {}), ...opts.data } } : {}),
    ...(opts.skip ? { skipped: true, completed_at: undefined } : {}),
    ...(opts.complete ? { completed_at: now, skipped: false } : {}),
  };

  const next: OnboardingWizardState = {
    ...current,
    started_at: current.started_at ?? now,
    last_section: opts.section,
    sections: {
      ...current.sections,
      [opts.section]: nextSection,
    },
    ...(opts.extras ?? {}),
  };

  // site_settings has only (key, data, updated_at) — multi-tenancy is via key prefix
  void isOrgScoped;
  const row: Record<string, unknown> = {
    key,
    data: next,
    updated_at: now,
  };

  const { error } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .upsert(row, { onConflict: "key" });

  if (error) throw error;
  return next;
}

/**
 * Migrate wizard state from the pre-org platform key to the org-scoped key.
 * Called from `provisionOrg` once the slug is locked. Idempotent (safe to call twice).
 */
export async function migrateWizardStateToOrg(opts: {
  authUserId: string;
  orgId: string;
}): Promise<void> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return;

  const platformKey = wizardStateKey(opts.authUserId);
  const orgKey = onboardingKey(opts.orgId);
  const now = new Date().toISOString();

  // Read platform-scoped state (might not exist if user skipped the wizard)
  const { data: platformRow } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("data")
    .eq("key", platformKey)
    .maybeSingle();

  if (!platformRow?.data) return;

  // Read existing org row in case the user re-ran provisioning
  const { data: orgRow } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("data")
    .eq("key", orgKey)
    .maybeSingle();

  const merged: OnboardingWizardState = {
    ...(orgRow?.data as Partial<OnboardingWizardState> | null ?? {}),
    ...(platformRow.data as Partial<OnboardingWizardState>),
    sections: {
      ...((orgRow?.data as OnboardingWizardState | null)?.sections ?? {}),
      ...((platformRow.data as OnboardingWizardState).sections ?? {}),
    },
  };

  await supabase.from(TABLES.SITE_SETTINGS).upsert(
    {
      key: orgKey,
      data: merged,
      updated_at: now,
    },
    { onConflict: "key" }
  );

  // Best-effort cleanup of the temp row (failure is non-fatal — leftover row is harmless)
  await supabase.from(TABLES.SITE_SETTINGS).delete().eq("key", platformKey);
}
