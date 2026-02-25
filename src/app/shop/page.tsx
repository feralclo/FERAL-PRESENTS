import { getOrgId } from "@/lib/org";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, brandingKey, merchStoreKey } from "@/lib/constants";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { BrandingSettings } from "@/types/settings";
import { ShopLandingPage } from "@/components/shop/ShopLandingPage";
import { DEFAULT_MERCH_STORE_SETTINGS } from "@/types/merch-store";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const orgId = await getOrgId();
  const supabase = await getSupabaseAdmin();
  let orgName = "Entry";

  if (supabase) {
    try {
      const { data } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", brandingKey(orgId))
        .single();
      const branding = data?.data as BrandingSettings | undefined;
      if (branding?.org_name) orgName = branding.org_name;
    } catch {
      // Use default
    }
  }

  return {
    title: `Shop | ${orgName}`,
    description: `Pre-order exclusive merch for ${orgName} events.`,
  };
}

export default async function ShopPage() {
  const orgId = await getOrgId();
  const supabase = await getSupabaseAdmin();
  if (!supabase) redirect("/");

  // Fetch store settings — if disabled, redirect to home
  const { data: settingsRow } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("data")
    .eq("key", merchStoreKey(orgId))
    .single();

  const storeSettings = {
    ...DEFAULT_MERCH_STORE_SETTINGS,
    ...((settingsRow?.data as Record<string, unknown>) || {}),
  };

  if (!storeSettings.enabled) {
    redirect("/");
  }

  // Fetch active collections with events and items
  const { data: collections } = await supabase
    .from(TABLES.MERCH_COLLECTIONS)
    .select(`
      *,
      event:events!merch_collections_event_id_fkey(
        id, slug, name, date_start, venue_name, city, cover_image, hero_image, status
      ),
      items:merch_collection_items(
        id,
        product:products(id, name, images, price, type, sizes)
      )
    `)
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("sort_order", { ascending: true });

  return (
    <ShopLandingPage
      collections={collections || []}
      storeSettings={storeSettings}
    />
  );
}
