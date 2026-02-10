import type { Metadata } from "next";
import { TicketsPage } from "@/components/event/TicketsPage";

/** Pre-render known event pages at build time for instant navigation */
export function generateStaticParams() {
  return [
    { slug: "liverpool-27-march" },
    { slug: "kompass-klub-7-march" },
  ];
}

export const metadata: Metadata = {
  title: "Get Tickets — FERAL Liverpool | 27 March 2026",
  description:
    "Get your tickets for FERAL Liverpool at Invisible Wind Factory. General Release, VIP, and VIP Black + Tee available.",
};

export default async function TicketsRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <TicketsPage slug={slug} />;
}
