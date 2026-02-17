"use client";

import { useCallback, useMemo } from "react";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { useTraffic } from "@/hooks/useTraffic";
import { useDataLayer } from "@/hooks/useDataLayer";

/**
 * Unified event tracking facade.
 * Consolidates Meta Pixel + CAPI, Supabase traffic, and GTM dataLayer
 * into a single API. Each method fires all three systems internally.
 *
 * Returns a referentially-stable object (safe for useEffect deps).
 */
export function useEventTracking() {
  const {
    trackPageView: metaPageView,
    trackViewContent: metaViewContent,
    trackAddToCart: metaAddToCart,
    trackInitiateCheckout: metaInitiateCheckout,
  } = useMetaTracking();
  const { trackEngagement, trackAddToCart: supaAddToCart } = useTraffic();
  const {
    trackViewContent: gtmViewContent,
    trackAddToCart: gtmAddToCart,
    trackRemoveFromCart: gtmRemoveFromCart,
    trackInitiateCheckout: gtmInitiateCheckout,
  } = useDataLayer();

  const trackPageView = useCallback(() => {
    metaPageView();
  }, [metaPageView]);

  const trackViewContent = useCallback(
    (params: {
      content_name: string;
      content_ids: string[];
      value: number;
      currency: string;
    }) => {
      metaViewContent({
        content_name: params.content_name,
        content_ids: params.content_ids,
        content_type: "product",
        value: params.value,
        currency: params.currency,
      });
      gtmViewContent(params.content_name, params.content_ids, params.value);
    },
    [metaViewContent, gtmViewContent]
  );

  const trackAddToCart = useCallback(
    (name: string, ids: string[], price: number, qty: number, currency: string) => {
      metaAddToCart({
        content_name: name,
        content_ids: ids,
        content_type: "product",
        value: price,
        currency,
        num_items: qty,
      });
      supaAddToCart(name, price, qty);
      gtmAddToCart(name, ids, price, qty);
    },
    [metaAddToCart, supaAddToCart, gtmAddToCart]
  );

  const trackRemoveFromCart = useCallback(
    (name: string, ids: string[]) => {
      trackEngagement("remove_from_cart");
      gtmRemoveFromCart(name, ids);
    },
    [trackEngagement, gtmRemoveFromCart]
  );

  const trackInitiateCheckout = useCallback(
    (ids: string[], totalPrice: number, totalQty: number, currency: string) => {
      metaInitiateCheckout({
        content_ids: ids,
        content_type: "product",
        value: totalPrice,
        currency,
        num_items: totalQty,
      });
      trackEngagement("checkout_start");
      gtmInitiateCheckout(ids, totalPrice, totalQty);
    },
    [metaInitiateCheckout, trackEngagement, gtmInitiateCheckout]
  );

  return useMemo(
    () => ({
      trackPageView,
      trackViewContent,
      trackAddToCart,
      trackRemoveFromCart,
      trackInitiateCheckout,
      trackEngagement,
    }),
    [
      trackPageView,
      trackViewContent,
      trackAddToCart,
      trackRemoveFromCart,
      trackInitiateCheckout,
      trackEngagement,
    ]
  );
}
