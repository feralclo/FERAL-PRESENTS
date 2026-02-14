import type { Metadata } from "next";
import { Suspense } from "react";
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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  // Editor preview: ?template= overrides which checkout component renders
  const editorTemplate = sp.editor === "1" && typeof sp.template === "string"
    ? sp.template
    : undefined;

  // Fetch event from DB
  let event = null;
  try {
    const supabase = await getSupabaseServer();
    if (supabase) {
      const { data } = await supabase
        .from(TABLES.EVENTS)
        .select("*, ticket_types(*)")
        .eq("slug", slug)
        .eq("org_id", ORG_ID)
        .single();

      if (data) {
        event = data;
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

  const activeTemplate = await getActiveTemplate();
  const template = editorTemplate || activeTemplate;

  if (template === "aura") {
    return (
      <Suspense>
        <AuraCheckout slug={slug} event={event} />
      </Suspense>
    );
  }

  return (
    <Suspense>
      <NativeCheckout slug={slug} event={event} />
    </Suspense>
  );
}
