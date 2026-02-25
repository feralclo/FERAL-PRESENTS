"use client";

import { useState, useCallback, useMemo } from "react";
import { getCurrencySymbol } from "@/lib/stripe/config";
import type { MerchCollectionItem } from "@/types/merch-store";

export interface ShopCartItem {
  collection_item_id: string;
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  merch_size?: string;
  max_per_order: number | null;
}

export interface UseShopCartResult {
  /** Items currently in the cart */
  items: ShopCartItem[];
  /** Total number of items */
  totalQty: number;
  /** Total price */
  totalPrice: number;
  /** Currency symbol */
  currSymbol: string;
  /** Add an item to cart */
  addItem: (collectionItem: MerchCollectionItem, size?: string) => void;
  /** Remove an item (by collection_item_id + size) */
  removeItem: (collectionItemId: string, size?: string) => void;
  /** Clear the cart */
  clearCart: () => void;
  /** Whether the cart has items */
  hasItems: boolean;
}

export function useShopCart(currency: string = "GBP"): UseShopCartResult {
  const [items, setItems] = useState<ShopCartItem[]>([]);
  const currSymbol = getCurrencySymbol(currency);

  const addItem = useCallback((collectionItem: MerchCollectionItem, size?: string) => {
    const product = collectionItem.product;
    if (!product) return;

    const price = collectionItem.custom_price ?? product.price ?? 0;
    const key = `${collectionItem.id}-${size || ""}`;

    setItems((prev) => {
      const existing = prev.find(
        (i) => i.collection_item_id === collectionItem.id && i.merch_size === size
      );

      if (existing) {
        // Check max per order
        if (collectionItem.max_per_order !== null && existing.qty >= collectionItem.max_per_order) {
          return prev;
        }
        return prev.map((i) =>
          i.collection_item_id === collectionItem.id && i.merch_size === size
            ? { ...i, qty: i.qty + 1 }
            : i
        );
      }

      return [
        ...prev,
        {
          collection_item_id: collectionItem.id,
          product_id: product.id,
          product_name: product.name,
          qty: 1,
          unit_price: price,
          merch_size: size,
          max_per_order: collectionItem.max_per_order,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((collectionItemId: string, size?: string) => {
    setItems((prev) => {
      const existing = prev.find(
        (i) => i.collection_item_id === collectionItemId && i.merch_size === size
      );

      if (!existing) return prev;

      if (existing.qty <= 1) {
        return prev.filter(
          (i) => !(i.collection_item_id === collectionItemId && i.merch_size === size)
        );
      }

      return prev.map((i) =>
        i.collection_item_id === collectionItemId && i.merch_size === size
          ? { ...i, qty: i.qty - 1 }
          : i
      );
    });
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalQty = useMemo(
    () => items.reduce((sum, i) => sum + i.qty, 0),
    [items]
  );

  const totalPrice = useMemo(
    () => items.reduce((sum, i) => sum + i.unit_price * i.qty, 0),
    [items]
  );

  return {
    items,
    totalQty,
    totalPrice,
    currSymbol,
    addItem,
    removeItem,
    clearCart,
    hasItems: items.length > 0,
  };
}
