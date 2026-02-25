import { getOrgId } from "@/lib/org";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, brandingKey, merchStoreKey } from "@/lib/constants";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import type { BrandingSettings } from "@/types/settings";
import { CollectionPage } from "@/components/shop/CollectionPage";
import { DEFAULT_MERCH_STORE_SETTINGS } from "@/types/merch-store";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const orgId = await getOrgId();
  const supabase = await getSupabaseAdmin();
  let orgName = "Entry";
  let collectionTitle = "Shop";

  if (supabase) {
    try {
      const [brandingRes, collectionRes] = await Promise.all([
        supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", brandingKey(orgId))
          .single(),
        supabase
          .from(TABLES.MERCH_COLLECTIONS)
          .select("title")
          .eq("org_id", orgId)
          .eq("slug", slug)
          .eq("status", "active")
          .single(),
      ]);
      const branding = brandingRes.data?.data as BrandingSettings | undefined;
      if (branding?.org_name) orgName = branding.org_name;
      if (collectionRes.data?.title) collectionTitle = collectionRes.data.title;
    } catch {
      // Use defaults
    }
  }

  return {
    title: `${collectionTitle} | ${orgName}`,
    description: `Pre-order merch for ${collectionTitle}. Collect at the event.`,
  };
}

export default async function ShopCollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const orgId = await getOrgId();
  const supabase = await getSupabaseAdmin();
  if (!supabase) redirect("/");

  // Check store is enabled
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

  // Fetch collection with full event details and product data
  const { data: collection } = await supabase
    .from(TABLES.MERCH_COLLECTIONS)
    .select(`
      *,
      event:events!merch_collections_event_id_fkey(
        id, slug, name, date_start, date_end, venue_name, venue_address,
        city, country, cover_image, hero_image, status, currency,
        doors_time, about_text, tag_line
      ),
      items:merch_collection_items(
        *,
        product:products(*)
      )
    `)
    .eq("org_id", orgId)
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (!collection) {
    notFound();
  }

  // Sort items by sort_order
  const sortedCollection = {
    ...collection,
    items: (collection.items || []).sort(
      (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
    ),
  };

  return <CollectionPage collection={sortedCollection} />;
}
