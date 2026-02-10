import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutPage } from "@/components/checkout/CheckoutPage";
import { NativeCheckout } from "@/components/checkout/NativeCheckout";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";

/** Pre-render known event pages at build time for instant navigation */
export function generateStaticParams() {
  return [
    { slug: "liverpool-27-march" },
    { slug: "kompass-klub-7-march" },
  ];
}

export const metadata: Metadata = {
  title: "Checkout — FERAL",
  description: "Complete your ticket purchase.",
};

export default async function CheckoutRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Check if event exists in events table with non-weeztix payment
  let nativeEvent = null;
  try {
    const supabase = await getSupabaseServer();
    if (supabase) {
      const { data } = await supabase
        .from(TABLES.EVENTS)
        .select("*, ticket_types(*)")
        .eq("slug", slug)
        .eq("org_id", ORG_ID)
        .single();

      if (data && data.payment_method !== "weeztix") {
        nativeEvent = data;
      }
    }
  } catch {
    // Fall through to WeeZTix
  }

  // Use native checkout for test/stripe events
  if (nativeEvent) {
    return (
      <Suspense>
        <NativeCheckout slug={slug} event={nativeEvent} />
      </Suspense>
    );
  }

  // Default: WeeZTix checkout for existing events
  return (
    <Suspense>
      <CheckoutPage slug={slug} />
    </Suspense>
  );
}
