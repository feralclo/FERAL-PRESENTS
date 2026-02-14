import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutPage } from "@/components/checkout/CheckoutPage";
import { NativeCheckout } from "@/components/checkout/NativeCheckout";
import { AuraCheckout } from "@/components/aura/AuraCheckout";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getActiveTemplate } from "@/lib/themes";
import { TABLES, ORG_ID } from "@/lib/constants";

/** Always fetch fresh data — admin changes must appear immediately */
export const dynamic = "force-dynamic";

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

  // Check if event exists in events table and uses native (non-WeeZTix) payment
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

      // WeeZTix events still use the WeeZTix checkout embed (CheckoutPage)
      if (data && data.payment_method !== "weeztix") {
        nativeEvent = data;
      }
    }
  } catch {
    // Fall through to WeeZTix
  }

  // Use native checkout for test/stripe events
  if (nativeEvent) {
    // Check active template for Aurora routing
    const activeTemplate = await getActiveTemplate();

    if (activeTemplate === "aura") {
      return (
        <Suspense>
          <AuraCheckout slug={slug} event={nativeEvent} />
        </Suspense>
      );
    }

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
