import { getOrgId } from "@/lib/org";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, brandingKey, merchStoreKey } from "@/lib/constants";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import type { BrandingSettings } from "@/types/settings";
import { ProductPage } from "@/components/shop/ProductPage";
import { DEFAULT_MERCH_STORE_SETTINGS } from "@/types/merch-store";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; itemId: string }>;
}): Promise<Metadata> {
  const { slug, itemId } = await params;
  const orgId = await getOrgId();
  const supabase = await getSupabaseAdmin();
  let orgName = "Entry";
  let productName = "Product";

  if (supabase) {
    try {
      const [brandingRes, itemRes] = await Promise.all([
        supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", brandingKey(orgId))
          .single(),
        supabase
          .from(TABLES.MERCH_COLLECTION_ITEMS)
          .select("product:products(name)")
          .eq("id", itemId)
          .eq("org_id", orgId)
          .single(),
      ]);
      const branding = brandingRes.data?.data as BrandingSettings | undefined;
      if (branding?.org_name) orgName = branding.org_name;
      const product = (itemRes.data?.product as { name?: string }) || {};
      if (product.name) productName = product.name;
    } catch {
      // Use defaults
    }
  }

  return {
    title: `${productName} | ${orgName}`,
    description: `Pre-order ${productName}. Collect at the event.`,
  };
}

export default async function ShopProductPage({
  params,
}: {
  params: Promise<{ slug: string; itemId: string }>;
}) {
  const { slug, itemId } = await params;
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

  // Fetch the collection item with product + collection + event
  const { data: collectionItem } = await supabase
    .from(TABLES.MERCH_COLLECTION_ITEMS)
    .select("*, product:products(*)")
    .eq("id", itemId)
    .eq("org_id", orgId)
    .single();

  if (!collectionItem) {
    notFound();
  }

  // Fetch the parent collection with event
  const { data: collection } = await supabase
    .from(TABLES.MERCH_COLLECTIONS)
    .select(`
      *,
      event:events!merch_collections_event_id_fkey(
        id, slug, name, date_start, date_end, venue_name, venue_address,
        city, country, cover_image, hero_image, status, currency,
        doors_time, about_text, tag_line, payment_method, stripe_account_id
      ),
      items:merch_collection_items(
        *,
        product:products(*)
      )
    `)
    .eq("id", collectionItem.collection_id)
    .eq("org_id", orgId)
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (!collection) {
    notFound();
  }

  // Sort items
  const sortedCollection = {
    ...collection,
    items: (collection.items || []).sort(
      (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
    ),
  };

  return <ProductPage item={collectionItem} collection={sortedCollection} />;
}
