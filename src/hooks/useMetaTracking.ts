"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { SETTINGS_KEYS } from "@/lib/constants";
import type { MarketingSettings, MetaCAPIRequest } from "@/types/marketing";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    fbq: any;
    _fbq: any;
  }
}

// ─── Module-level state (shared across all hook instances per page load) ───
let _settings: MarketingSettings | null = null;
let _fetchPromise: Promise<MarketingSettings | null> | null = null;
let _pixelLoaded = false;

/** Fetch marketing settings from our API (cached for the page lifecycle).
 *  Failed fetches are NOT cached — the next call will retry. */
function getSettings(): Promise<MarketingSettings | null> {
  if (_settings) return Promise.resolve(_settings);
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = fetch(`/api/settings?key=${SETTINGS_KEYS.MARKETING}`)
    .then((res) => {
      if (!res.ok) {
        console.warn(`[Meta] Settings API returned ${res.status}`);
        return null;
      }
      return res.json();
    })
    .then((json) => {
      _settings = (json?.data as MarketingSettings) || null;
      if (!_settings) {
        console.warn(
          "[Meta] Marketing settings not found — check admin/marketing config.",
          "API response data:", json?.data
        );
        // Clear cached promise so the next call retries instead of
        // permanently returning null for the rest of the page lifecycle.
        _fetchPromise = null;
      } else {
        console.debug(
          "[Meta] Settings loaded — tracking:",
          _settings.meta_tracking_enabled ? "enabled" : "disabled",
          "| pixel:", _settings.meta_pixel_id ? "configured" : "missing"
        );
      }
      return _settings;
    })
    .catch((err) => {
      console.warn("[Meta] Failed to fetch marketing settings:", err);
      // Clear cached promise so subsequent calls retry
      _fetchPromise = null;
      return null;
    });

  return _fetchPromise;
}

/** Check if user has NOT explicitly rejected marketing cookies.
 *  Track by default — only block if user actively opted out. */
function hasMarketingConsent(): boolean {
  try {
    const raw = localStorage.getItem("feral_cookie_consent");
    if (!raw) return true; // No decision yet → allow (track by default)
    const data = JSON.parse(raw);
    return data.marketing !== false; // Only block on explicit rejection
  } catch {
    return true;
  }
}

/** Read a cookie by name */
function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : undefined;
}

/** Load Meta Pixel base code and init with pixel ID (once per page) */
function loadPixel(pixelId: string) {
  if (_pixelLoaded) return;
  _pixelLoaded = true;

  const w = window as any;

  if (!w.fbq) {
    // Create the fbq queue function
    const n: any = (w.fbq = function () {
      n.callMethod
        ? n.callMethod.apply(n, arguments)
        : n.queue.push(arguments);
    });
    if (!w._fbq) w._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];

    // Inject the fbevents.js script
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }

  // Init pixel — always call init even if fbq was loaded externally (e.g. GTM).
  // Calling init multiple times with the same ID is safe — Meta deduplicates.
  // Do NOT fire automatic PageView (components handle it with event_id).
  w.fbq("init", pixelId);
  console.debug("[Meta] Pixel loaded and initialized:", pixelId);
}

/**
 * Try to load the pixel if settings are available and consent is granted.
 * Safe to call multiple times — loadPixel itself is idempotent.
 */
function tryLoadPixel() {
  if (_pixelLoaded) return;
  if (!_settings?.meta_tracking_enabled || !_settings.meta_pixel_id) {
    if (_settings && !_settings.meta_tracking_enabled) {
      console.debug("[Meta] Tracking disabled in settings — pixel not loaded");
    }
    return;
  }
  if (!hasMarketingConsent()) {
    console.debug("[Meta] Marketing consent not granted — pixel not loaded");
    return;
  }
  loadPixel(_settings.meta_pixel_id);
}

/** Fire a pixel event (client-side) */
function firePixelEvent(
  eventName: string,
  params: Record<string, unknown>,
  eventId: string
) {
  if (!hasMarketingConsent()) return;
  if (typeof window === "undefined" || !window.fbq) {
    console.debug(`[Meta] Pixel not available — skipping client ${eventName}`);
    return;
  }
  window.fbq("track", eventName, params, { eventID: eventId });
}

/** Send a CAPI event via our server route (fire-and-forget) */
function sendCAPI(
  eventName: string,
  eventId: string,
  customData?: Record<string, unknown>
) {
  const payload: MetaCAPIRequest = {
    event_name: eventName,
    event_id: eventId,
    event_source_url: window.location.href,
    user_data: {
      fbp: getCookie("_fbp"),
      fbc: getCookie("_fbc"),
    },
    custom_data: customData,
  };

  fetch("/api/meta/capi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true, // Survive page navigations
  }).catch(() => {}); // Fire and forget
}

/**
 * Unified Meta tracking hook.
 * Loads the pixel once, then provides functions that fire both
 * client-side pixel events and server-side CAPI events with
 * matching event_id for deduplication.
 *
 * IMPORTANT: Returns a referentially-stable object so it can safely
 * be used in useEffect / useCallback dependency arrays without
 * causing re-fires on every render.
 */
export function useMetaTracking() {
  const initialised = useRef(false);

  // Fetch settings and load pixel immediately (track by default)
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    getSettings().then(() => {
      // Load pixel immediately — hasMarketingConsent() defaults to true
      tryLoadPixel();
    });

    // Listen for consent changes — if user explicitly rejects via cookie
    // banner, future firePixelEvent calls will be blocked. If they later
    // re-accept, pixel will load if it wasn't already.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "feral_cookie_consent") return;
      tryLoadPixel();
    };
    window.addEventListener("storage", onStorage);

    const onConsentUpdate = () => tryLoadPixel();
    window.addEventListener("feral_consent_update", onConsentUpdate);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("feral_consent_update", onConsentUpdate);
    };
  }, []);

  const trackPageView = useCallback(() => {
    getSettings().then((s) => {
      if (!s?.meta_tracking_enabled || !s.meta_pixel_id) return;
      const eventId = crypto.randomUUID();
      firePixelEvent("PageView", {}, eventId);
      sendCAPI("PageView", eventId);
      console.debug("[Meta] PageView fired:", eventId);
    });
  }, []);

  const trackViewContent = useCallback(
    (params: {
      content_name?: string;
      content_ids?: string[];
      content_type?: string;
      value?: number;
      currency?: string;
    }) => {
      getSettings().then((s) => {
        if (!s?.meta_tracking_enabled || !s.meta_pixel_id) return;
        const eventId = crypto.randomUUID();
        firePixelEvent("ViewContent", params, eventId);
        sendCAPI("ViewContent", eventId, params);
        console.debug("[Meta] ViewContent fired:", params.content_name, eventId);
      });
    },
    []
  );

  const trackAddToCart = useCallback(
    (params: {
      content_name?: string;
      content_ids?: string[];
      content_type?: string;
      value?: number;
      currency?: string;
      num_items?: number;
    }) => {
      getSettings().then((s) => {
        if (!s?.meta_tracking_enabled || !s.meta_pixel_id) return;
        const eventId = crypto.randomUUID();
        firePixelEvent("AddToCart", params, eventId);
        sendCAPI("AddToCart", eventId, params);
        console.debug("[Meta] AddToCart fired:", params.value, params.currency, eventId);
      });
    },
    []
  );

  const trackInitiateCheckout = useCallback(
    (params: {
      content_ids?: string[];
      content_type?: string;
      value?: number;
      currency?: string;
      num_items?: number;
    }) => {
      getSettings().then((s) => {
        if (!s?.meta_tracking_enabled || !s.meta_pixel_id) return;
        const eventId = crypto.randomUUID();
        firePixelEvent("InitiateCheckout", params, eventId);
        sendCAPI("InitiateCheckout", eventId, params);
        console.debug("[Meta] InitiateCheckout fired:", eventId);
      });
    },
    []
  );

  const trackPurchase = useCallback(
    (params: {
      content_ids?: string[];
      content_type?: string;
      value?: number;
      currency?: string;
      num_items?: number;
      order_id?: string;
    }) => {
      getSettings().then((s) => {
        if (!s?.meta_tracking_enabled || !s.meta_pixel_id) return;
        const eventId = crypto.randomUUID();
        firePixelEvent("Purchase", params, eventId);
        sendCAPI("Purchase", eventId, params);
        console.debug("[Meta] Purchase fired:", params.order_id, eventId);
      });
    },
    []
  );

  // Return a stable object — all callbacks have [] deps so they never change,
  // meaning this useMemo value is created once and reused forever.
  return useMemo(
    () => ({
      trackPageView,
      trackViewContent,
      trackAddToCart,
      trackInitiateCheckout,
      trackPurchase,
    }),
    [trackPageView, trackViewContent, trackAddToCart, trackInitiateCheckout, trackPurchase]
  );
}
