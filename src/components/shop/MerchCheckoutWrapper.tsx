"use client";

import { useState, useEffect } from "react";
import { useShopCart } from "@/hooks/useShopCart";
import { NativeCheckout } from "@/components/checkout/NativeCheckout";
import type { MerchCheckoutData } from "@/components/checkout/NativeCheckout";
import type { Event } from "@/types/events";
import type { MerchCollection } from "@/types/merch-store";

interface MerchCheckoutWrapperProps {
  collection: MerchCollection;
  event: Event & { ticket_types: never[] };
}

export function MerchCheckoutWrapper({ collection, event }: MerchCheckoutWrapperProps) {
  const cart = useShopCart(event.currency || "GBP");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // Don't render until sessionStorage is hydrated
  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[var(--bg-dark,#0e0e0e)] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/[0.08] border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const merchData: MerchCheckoutData = {
    collectionSlug: collection.slug,
    collectionTitle: collection.title,
    pickupInstructions: collection.pickup_instructions || undefined,
    cartLines: cart.items.map((item) => ({
      ticket_type_id: item.collection_item_id, // Reuse field for display
      name: item.product_name,
      qty: item.qty,
      price: item.unit_price,
      merch_size: item.merch_size,
    })),
    merchItems: cart.items.map((item) => ({
      collection_item_id: item.collection_item_id,
      qty: item.qty,
      merch_size: item.merch_size,
    })),
    currency: event.currency || "GBP",
  };

  return (
    <NativeCheckout
      slug={event.slug}
      event={event}
      merchData={merchData}
    />
  );
}
