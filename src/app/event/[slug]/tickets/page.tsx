import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TicketsPage } from "@/components/event/TicketsPage";
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
  title: "Get Tickets — FERAL",
  description: "Get your tickets for the event.",
};

export default async function TicketsRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // For dynamic (non-WeeZTix) events, redirect to main event page
  // which has the ticket widget built in
  try {
    const supabase = await getSupabaseServer();
    if (supabase) {
      const { data } = await supabase
        .from(TABLES.EVENTS)
        .select("payment_method")
        .eq("slug", slug)
        .eq("org_id", ORG_ID)
        .single();

      if (data && data.payment_method !== "weeztix") {
        redirect(`/event/${slug}/`);
      }
    }
  } catch (e) {
    // redirect() throws a special Next.js error — rethrow it
    if (e && typeof e === "object" && "digest" in e) throw e;
  }

  // WeeZTix events: use existing tickets page
  return <TicketsPage slug={slug} />;
}
