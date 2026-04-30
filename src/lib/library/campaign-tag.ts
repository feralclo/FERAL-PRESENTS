/**
 * Campaign tag — a stable slug stored as `tenant_media.tags[0]` to group
 * a tenant's assets into a named campaign (e.g. "Only Numbers — Spring 26"
 * → `only-numbers-spring-26`).
 *
 * Display labels are kept in admin app state (passed alongside the slug
 * when listing campaigns); the slug is the canonical join key referenced
 * by `rep_quests.asset_campaign_tag`.
 *
 * Slug rules — keep this list short and predictable; don't add new
 * normalisation steps without thinking about the rename path. Renaming a
 * campaign rewrites every `tags[0]` row + every `rep_quests.asset_campaign_tag`
 * in a transaction (see /api/admin/media/campaigns/[tag] PATCH).
 */

const MAX_LEN = 80;

/**
 * Convert a human-readable campaign label into a stable URL-safe slug.
 *
 * - Lowercases.
 * - Strips diacritics (`é` → `e`).
 * - Replaces any non-alphanumeric run with a single hyphen.
 * - Trims leading / trailing hyphens.
 * - Caps at 80 chars (matches a sensible URL component length; we don't
 *   need longer for any human-readable campaign name).
 */
export function slugifyCampaignLabel(label: string): string {
  if (!label) return "";

  // NFD splits combining marks off, then \p{M} drops every combining
  // mark category — covers diacriticals + extended marks across scripts.
  const normalised = label.normalize("NFD").replace(/\p{M}/gu, "");

  return normalised
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LEN)
    .replace(/-+$/g, ""); // re-trim in case the slice landed on a hyphen
}

/**
 * Validate a slug as the right shape for use in the `tags[]` column or as
 * a URL parameter. Returns true only if the value round-trips through
 * `slugifyCampaignLabel` unchanged.
 */
export function isValidCampaignTag(value: string): boolean {
  if (!value) return false;
  if (value.length > MAX_LEN) return false;
  return slugifyCampaignLabel(value) === value;
}

/**
 * The reserved slug never written to the DB — represents "All assets" in
 * the UI, surfacing every row regardless of campaign membership.
 */
export const ALL_CAMPAIGNS_TAG = "__all__";

export function isAllCampaignsTag(value: string | null | undefined): boolean {
  return value === ALL_CAMPAIGNS_TAG;
}
