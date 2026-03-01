import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, generalKey } from "@/lib/constants";

/**
 * Get the base currency for an org.
 * Reads from {org_id}_general settings; falls back to "GBP".
 */
export async function getOrgBaseCurrency(orgId: string): Promise<string> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return "GBP";

  const { data } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("data")
    .eq("key", generalKey(orgId))
    .single();

  if (data?.data && typeof data.data === "object") {
    const settings = data.data as { base_currency?: string };
    if (settings.base_currency) {
      return settings.base_currency.toUpperCase();
    }
  }

  return "GBP";
}
