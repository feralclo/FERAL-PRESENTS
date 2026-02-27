"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useShopCart } from "@/hooks/useShopCart";
import { NativeCheckout } from "@/components/checkout/NativeCheckout";
import type { MerchCheckoutData } from "@/components/checkout/NativeCheckout";
import type { Event } from "@/types/events";
import type { MerchCollection, MerchCollectionItem } from "@/types/merch-store";
import { normalizeMerchImages } from "@/lib/merch-images";

interface MerchCheckoutWrapperProps {
  collection: MerchCollection;
  event: Event & { ticket_types: never[] };
}

export function MerchCheckoutWrapper({ collection, event }: MerchCheckoutWrapperProps) {
  const searchParams = useSearchParams();
  const currencyParam = searchParams.get("currency");
  const baseCurrency = event.currency || "GBP";
  // Use presentment currency from URL param (matches ticket checkout pattern)
  const presentmentCurrency = currencyParam?.toUpperCase() || null;
  const cart = useShopCart(presentmentCurrency || baseCurrency);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // Build a map of collection_item_id → first product image
  const imageMap = useMemo(() => {
    const map = new Map<string, string>();
    const items = (collection.items || []) as MerchCollectionItem[];
    for (const item of items) {
      if (item.product?.images) {
        const imgs = normalizeMerchImages(item.product.images);
        if (imgs[0]) map.set(item.id, imgs[0]);
      }
    }
    return map;
  }, [collection.items]);

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
      image: imageMap.get(item.collection_item_id),
      price_overrides: item.price_overrides || null,
    })),
    merchItems: cart.items.map((item) => ({
      collection_item_id: item.collection_item_id,
      qty: item.qty,
      merch_size: item.merch_size,
    })),
    currency: presentmentCurrency || baseCurrency,
  };

  return (
    <NativeCheckout
      slug={event.slug}
      event={event}
      merchData={merchData}
    />
  );
}
