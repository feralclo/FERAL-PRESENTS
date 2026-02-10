import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutPage } from "@/components/checkout/CheckoutPage";

/** Pre-render known event pages at build time for instant navigation */
export function generateStaticParams() {
  return [
    { slug: "liverpool-27-march" },
    { slug: "kompass-klub-7-march" },
  ];
}

export const metadata: Metadata = {
  title: "Checkout — FERAL Liverpool",
  description: "Complete your ticket purchase for FERAL Liverpool.",
};

export default async function CheckoutRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <Suspense>
      <CheckoutPage slug={slug} />
    </Suspense>
  );
}
