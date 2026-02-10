import type { Metadata } from "next";
import { CheckoutPage } from "@/components/checkout/CheckoutPage";

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
  return <CheckoutPage slug={slug} />;
}
