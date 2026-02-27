"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { getCurrencySymbol } from "@/lib/stripe/config";
import type { MerchCollectionItem } from "@/types/merch-store";

const STORAGE_KEY = "entry_shop_cart";

export interface ShopCartItem {
  collection_item_id: string;
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  merch_size?: string;
  max_per_order: number | null;
  price_overrides?: Record<string, number> | null;
}

export interface UseShopCartResult {
  items: ShopCartItem[];
  totalQty: number;
  totalPrice: number;
  currSymbol: string;
  addItem: (collectionItem: MerchCollectionItem, size?: string) => void;
  removeItem: (collectionItemId: string, size?: string) => void;
  clearCart: () => void;
  hasItems: boolean;
}

/** Load cart from sessionStorage (returns empty array on failure). */
function loadCart(): ShopCartItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ShopCartItem[];
  } catch {
    return [];
  }
}

/** Persist cart to sessionStorage. */
function saveCart(items: ShopCartItem[]) {
  try {
    if (items.length === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  } catch {
    // sessionStorage not available
  }
}

export function useShopCart(currency: string = "GBP"): UseShopCartResult {
  const [items, setItems] = useState<ShopCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const currSymbol = getCurrencySymbol(currency);

  // Hydrate from sessionStorage on mount
  useEffect(() => {
    setItems(loadCart());
    setHydrated(true);
  }, []);

  // Persist to sessionStorage on change (skip initial hydration)
  useEffect(() => {
    if (hydrated) {
      saveCart(items);
    }
  }, [items, hydrated]);

  const addItem = useCallback((collectionItem: MerchCollectionItem, size?: string) => {
    const product = collectionItem.product;
    if (!product) return;

    const price = collectionItem.custom_price ?? product.price ?? 0;

    setItems((prev) => {
      const existing = prev.find(
        (i) => i.collection_item_id === collectionItem.id && i.merch_size === size
      );

      if (existing) {
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
          price_overrides: product.price_overrides || null,
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
