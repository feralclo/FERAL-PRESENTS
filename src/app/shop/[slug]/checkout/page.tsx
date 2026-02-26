import type { Metadata } from "next";
import { Suspense } from "react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, brandingKey } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import { redirect, notFound } from "next/navigation";
import type { BrandingSettings } from "@/types/settings";
import { MerchCheckoutWrapper } from "@/components/shop/MerchCheckoutWrapper";
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

  if (supabase) {
    try {
      const { data } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", brandingKey(orgId))
        .single();
      if (data?.data) {
        const branding = data.data as BrandingSettings;
        if (branding.org_name) orgName = branding.org_name;
      }
    } catch {}
  }

  return {
    title: `Checkout — ${orgName}`,
    description: `Complete your merch pre-order with ${orgName}. Secure checkout powered by Stripe.`,
    robots: { index: false, follow: false },
  };
}

export default async function MerchCheckoutRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const orgId = await getOrgId();
  const supabase = await getSupabaseAdmin();
  if (!supabase) redirect("/");

  // Check store is enabled
  const merchStoreKey = `${orgId}_merch_store`;
  const { data: settingsRow } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("data")
    .eq("key", merchStoreKey)
    .single();

  const storeSettings = {
    ...DEFAULT_MERCH_STORE_SETTINGS,
    ...((settingsRow?.data as Record<string, unknown>) || {}),
  };

  if (!storeSettings.enabled) {
    redirect("/");
  }

  // Fetch collection with event
  const { data: collection } = await supabase
    .from(TABLES.MERCH_COLLECTIONS)
    .select(`
      *,
      event:events!merch_collections_event_id_fkey(
        *, ticket_types(*, product:products(*))
      )
    `)
    .eq("org_id", orgId)
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (!collection) {
    notFound();
  }

  const event = collection.event;
  if (!event) {
    notFound();
  }

  // Preconnect hints for Stripe
  const preconnectHints = (
    <>
      <link rel="preconnect" href="https://js.stripe.com" />
      <link rel="preconnect" href="https://api.stripe.com" />
      <link rel="preconnect" href="https://pay.google.com" />
      <link rel="dns-prefetch" href="https://pay.google.com" />
    </>
  );

  return (
    <>
      {preconnectHints}
      <Suspense>
        <MerchCheckoutWrapper
          collection={collection}
          event={event}
        />
      </Suspense>
    </>
  );
}
