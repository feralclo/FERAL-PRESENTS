import type { Metadata } from "next";
import { Suspense } from "react";
import { NativeCheckout } from "@/components/checkout/NativeCheckout";
import { AuraCheckout } from "@/components/aura/AuraCheckout";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getActiveTemplate } from "@/lib/themes";
import { TABLES, brandingKey } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import { isRestrictedCheckoutEmail } from "@/lib/checkout-guards";
import type { BrandingSettings } from "@/types/settings";

/** Always fetch fresh data — admin changes must appear immediately */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  let orgName = "Entry";
  let faviconUrl: string | undefined;
  try {
    const orgId = await getOrgId();
    const supabase = await getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", brandingKey(orgId))
        .single();
      if (data?.data) {
        const branding = data.data as BrandingSettings;
        if (branding.org_name) orgName = branding.org_name;
        if (branding.favicon_url) faviconUrl = branding.favicon_url;
      }
    }
  } catch { /* Fall through with default */ }
  return {
    title: `Checkout — ${orgName}`,
    description: `Complete your ticket purchase with ${orgName}. Secure checkout powered by Stripe.`,
    ...(faviconUrl ? { icons: { icon: faviconUrl, apple: faviconUrl } } : {}),
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutRoute({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const orgId = await getOrgId();

  // Editor preview: ?template= overrides which checkout component renders
  const editorTemplate = sp.editor === "1" && typeof sp.template === "string"
    ? sp.template
    : undefined;

  // Cart restoration: ?restore= token from abandoned cart recovery email
  const restoreToken = typeof sp.restore === "string" ? sp.restore : undefined;
  // Discount code from recovery email link: ?discount=CODE
  const discountCode = typeof sp.discount === "string" ? sp.discount : undefined;

  // Fetch event from DB
  let event = null;
  let restoreData: {
    email: string;
    firstName: string;
    lastName: string;
    cartParam: string;
    discountCode?: string;
  } | null = null;

  try {
    const supabase = await getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from(TABLES.EVENTS)
        .select("*, ticket_types(*, product:products(*))")
        .eq("slug", slug)
        .eq("org_id", orgId)
        .single();

      if (data) {
        event = data;
      }

      // Fetch abandoned cart by restore token (recovery email click)
      if (restoreToken && event) {
        const { data: cart } = await supabase
          .from(TABLES.ABANDONED_CARTS)
          .select("email, first_name, last_name, items")
          .eq("cart_token", restoreToken)
          .eq("event_id", event.id)
          .eq("org_id", orgId)
          .eq("status", "abandoned")
          .single();

        if (cart && !isRestrictedCheckoutEmail(cart.email)) {
          // Reconstruct cart param string from items
          // Format matches existing: ticketTypeId:qty:size,ticketTypeId:qty
          const cartParam = (cart.items as { ticket_type_id: string; qty: number; merch_size?: string }[])
            .map((item) => {
              const base = `${item.ticket_type_id}:${item.qty}`;
              return item.merch_size ? `${base}:${item.merch_size}` : base;
            })
            .join(",");

          restoreData = {
            email: cart.email,
            firstName: cart.first_name || "",
            lastName: cart.last_name || "",
            cartParam,
            ...(discountCode ? { discountCode } : {}),
          };
        }
      }
    }
  } catch {
    // Fall through to error state
  }

  if (!event) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#fff" }}>
        <p>Event not found.</p>
      </div>
    );
  }

  // External ticketing events have no checkout — redirect to external link
  if (event.payment_method === "external") {
    const { redirect } = await import("next/navigation");
    redirect(event.external_link || `/event/${slug}`);
  }

  const activeTemplate = await getActiveTemplate();
  const template = editorTemplate || activeTemplate;

  /* Preconnect hints — browser starts DNS + TCP/TLS handshake before
     any JS loads, shaving ~100-300ms off Express Checkout readiness.
     Stripe domains for payment processing, Google domains for Google Pay. */
  const preconnectHints = (
    <>
      <link rel="preconnect" href="https://js.stripe.com" />
      <link rel="preconnect" href="https://api.stripe.com" />
      <link rel="preconnect" href="https://pay.google.com" />
      <link rel="dns-prefetch" href="https://pay.google.com" />
      <link rel="dns-prefetch" href="https://www.googleapis.com" />
    </>
  );

  if (template === "aura") {
    return (
      <>
        {preconnectHints}
        <Suspense>
          <AuraCheckout slug={slug} event={event} restoreData={restoreData} />
        </Suspense>
      </>
    );
  }

  return (
    <>
      {preconnectHints}
      <Suspense>
        <NativeCheckout slug={slug} event={event} restoreData={restoreData} />
      </Suspense>
    </>
  );
}
