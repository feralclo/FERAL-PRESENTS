"use client";

import { useCallback } from "react";

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

/**
 * Hook for pushing events to GTM dataLayer.
 * Matches existing GTM event format used in event pages.
 */
export function useDataLayer() {
  const push = useCallback((event: Record<string, unknown>) => {
    if (typeof window === "undefined") return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(event);
  }, []);

  const trackViewContent = useCallback(
    (contentName: string, contentIds: string[], value: number) => {
      push({
        event: "view_content",
        content_name: contentName,
        content_ids: contentIds,
        content_type: "product",
        value,
        currency: "GBP",
      });
    },
    [push]
  );

  const trackAddToCart = useCallback(
    (
      contentName: string,
      contentIds: string[],
      value: number,
      numItems: number
    ) => {
      push({
        event: "add_to_cart",
        content_name: contentName,
        content_ids: contentIds,
        content_type: "product",
        value,
        currency: "GBP",
        num_items: numItems,
      });
    },
    [push]
  );

  const trackRemoveFromCart = useCallback(
    (contentName: string, contentIds: string[]) => {
      push({
        event: "remove_from_cart",
        content_name: contentName,
        content_ids: contentIds,
      });
    },
    [push]
  );

  const trackInitiateCheckout = useCallback(
    (contentIds: string[], value: number, numItems: number) => {
      push({
        event: "initiate_checkout",
        content_ids: contentIds,
        content_type: "product",
        value,
        currency: "GBP",
        num_items: numItems,
      });
    },
    [push]
  );

  return {
    push,
    trackViewContent,
    trackAddToCart,
    trackRemoveFromCart,
    trackInitiateCheckout,
  };
}
