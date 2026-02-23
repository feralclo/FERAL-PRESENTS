"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { marketingKey } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
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
let _fbclidCaptured = false;

// Pixel script load tracking — resolves when fbevents.js has loaded and
// set the _fbp cookie, so CAPI events can include it for matching.
let _pixelScriptReady = false;
let _resolvePixelReady: (() => void) | null = null;
const _pixelReadyPromise = new Promise<void>((resolve) => {
  _resolvePixelReady = resolve;
});

/** localStorage key for stored customer match data (persists across sessions) */
const META_MATCH_KEY = "feral_meta_match";

/** Fetch marketing settings from our API (cached for the page lifecycle).
 *  Failed fetches are NOT cached — the next call will retry. */
function getSettings(orgId: string): Promise<MarketingSettings | null> {
  if (_settings) return Promise.resolve(_settings);
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = fetch(`/api/settings?key=${marketingKey(orgId)}`)
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

// ─── fbclid capture ─────────────────────────────────────────────────────────
// Meta's pixel sets _fbc from the fbclid URL parameter, but if the pixel
// loads late (after settings fetch + consent check), the fbclid may be lost.
// We capture it ourselves immediately on first mount to ensure coverage.

/**
 * Capture fbclid from the URL and set the _fbc cookie if not already present.
 * Format: fb.1.{creation_timestamp_ms}.{fbclid}
 * Runs once per page load, before settings or pixel are loaded.
 */
function captureFbclid() {
  if (_fbclidCaptured) return;
  _fbclidCaptured = true;

  try {
    // Don't overwrite an existing _fbc cookie
    if (getCookie("_fbc")) return;

    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get("fbclid");
    if (!fbclid) return;

    // Meta _fbc format: fb.{subdomainIndex}.{creationTime}.{fbclid}
    const fbc = `fb.1.${Date.now()}.${fbclid}`;
    const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `_fbc=${encodeURIComponent(fbc)}; expires=${expires}; path=/; SameSite=Lax`;
    console.debug("[Meta] Captured fbclid → _fbc cookie set:", fbc);
  } catch {
    // Silent — cookie write failures shouldn't break anything
  }
}

// ─── Advanced Matching (stored customer data) ───────────────────────────────
// Stores customer PII in localStorage so returning visitors and subsequent
// events get better match quality. Data is raw (unhashed) — the pixel JS
// hashes it during init, and the CAPI route hashes it server-side.

interface StoredMatchData {
  em?: string;
  fn?: string;
  ln?: string;
  ph?: string;
  external_id?: string;
}

/** Read stored customer match data from localStorage */
function getStoredMatchData(): StoredMatchData {
  try {
    const raw = localStorage.getItem(META_MATCH_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Store customer data for Meta Advanced Matching.
 * Persists in localStorage so returning visitors get better EMQ scores.
 * Merges with existing data (never overwrites with empty values).
 * Call this from checkout components when customer PII becomes available.
 */
export function storeMetaMatchData(data: StoredMatchData) {
  try {
    const existing = getStoredMatchData();
    const merged = { ...existing };

    // Only overwrite with non-empty values
    if (data.em) merged.em = data.em.toLowerCase().trim();
    if (data.fn) merged.fn = data.fn.trim();
    if (data.ln) merged.ln = data.ln.trim();
    if (data.ph) merged.ph = data.ph.trim();
    if (data.external_id) merged.external_id = data.external_id;

    // Only store if we have at least one value
    const hasValues = Object.values(merged).some(Boolean);
    if (hasValues) {
      localStorage.setItem(META_MATCH_KEY, JSON.stringify(merged));
    }
  } catch {
    // Silent — localStorage write failures shouldn't break anything
  }
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

    // Signal when the pixel script has loaded — CAPI events wait for this
    // so they can include the _fbp cookie that the pixel sets on load.
    script.onload = () => {
      // Small delay to ensure fbevents.js has finished initializing and
      // set the _fbp cookie (init runs synchronously after script load).
      setTimeout(() => {
        _pixelScriptReady = true;
        _resolvePixelReady?.();
        console.debug("[Meta] Pixel script loaded — _fbp:", getCookie("_fbp") ? "set" : "not set");
      }, 100);
    };
    script.onerror = () => {
      // Don't block CAPI events forever if the pixel script fails to load
      _pixelScriptReady = true;
      _resolvePixelReady?.();
      console.warn("[Meta] Pixel script failed to load");
    };

    document.head.appendChild(script);
  } else {
    // Pixel was already loaded from server-rendered HTML (standard snippet in layout).
    // Mark as ready immediately so CAPI events don't wait for a script load that already happened.
    _pixelScriptReady = true;
    _resolvePixelReady?.();
    console.debug("[Meta] Pixel already loaded from HTML — _fbp:", getCookie("_fbp") ? "set" : "not set");
  }

  // Advanced Matching: pass any stored customer data during init.
  // The pixel JS hashes raw PII automatically before sending to Meta.
  const matchData = getStoredMatchData();
  const hasMatchData = matchData.em || matchData.fn || matchData.ln || matchData.ph || matchData.external_id;

  if (hasMatchData) {
    w.fbq("init", pixelId, {
      em: matchData.em || undefined,
      fn: matchData.fn || undefined,
      ln: matchData.ln || undefined,
      ph: matchData.ph || undefined,
      external_id: matchData.external_id || undefined,
    });
    console.debug("[Meta] Pixel initialized with Advanced Matching:", Object.keys(matchData).filter(k => matchData[k as keyof StoredMatchData]).join(", "));
  } else {
    w.fbq("init", pixelId);
    console.debug("[Meta] Pixel loaded and initialized:", pixelId);
  }
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

/** Optional PII to send along with CAPI events for better matching */
interface CAPIUserData {
  fbp?: string;
  fbc?: string;
  external_id?: string;
  em?: string;  // raw email — will be hashed server-side
  fn?: string;  // raw first name — will be hashed server-side
  ln?: string;  // raw last name — will be hashed server-side
  ph?: string;  // raw phone — will be hashed server-side
}

/**
 * Wait for the _fbp cookie to exist (set by fbevents.js after it loads).
 * Polls every 50ms, max wait 3 seconds — then sends without _fbp.
 *
 * This is more reliable than tracking script-load state because the HTML
 * inline snippet creates `window.fbq` as a stub before fbevents.js actually
 * loads.  Checking `_pixelScriptReady` would resolve immediately (stub exists)
 * but the cookie wouldn't be set yet.  Polling the cookie directly avoids that.
 */
function waitForFbpCookie(): Promise<void> {
  if (getCookie("_fbp")) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const start = Date.now();
    const check = () => {
      if (getCookie("_fbp") || Date.now() - start > 3000) {
        resolve();
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

/**
 * Send a CAPI event via our server route (fire-and-forget).
 * Waits for the _fbp cookie to be set by fbevents.js for matching.
 * Max wait: 3 seconds — after that, sends without _fbp rather than blocking.
 */
function sendCAPI(
  eventName: string,
  eventId: string,
  customData?: Record<string, unknown>,
  userData?: CAPIUserData
) {
  const eventSourceUrl = window.location.href;

  waitForFbpCookie().then(() => {
    // Layer 1: Browser cookies (_fbp, _fbc)
    const browserUserData: CAPIUserData = {
      fbp: getCookie("_fbp"),
      fbc: getCookie("_fbc"),
    };

    // Layer 2: Stored match data from localStorage (returning visitors)
    const storedMatch = getStoredMatchData();

    // Merge: browser cookies → stored match data → explicit PII (explicit wins)
    const mergedUserData = { ...browserUserData, ...storedMatch, ...userData };

    const payload: MetaCAPIRequest = {
      event_name: eventName,
      event_id: eventId,
      event_source_url: eventSourceUrl,
      user_data: mergedUserData,
      custom_data: customData,
    };

    fetch("/api/meta/capi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true, // Survive page navigations
    }).catch(() => {}); // Fire and forget
  });
}

/**
 * Unified Meta tracking hook.
 * Loads the pixel once, then provides functions that fire both
 * client-side pixel events and server-side CAPI events with
 * matching event_id for deduplication.
 *
 * Full funnel coverage:
 *   PageView → ViewContent → AddToCart → InitiateCheckout → AddPaymentInfo → Purchase
 *
 * Advanced Matching:
 *   - Captures fbclid from URL → _fbc cookie (before pixel loads)
 *   - Passes stored customer data to fbq('init') for pixel-side matching
 *   - Merges stored customer data into all CAPI events for server-side matching
 *   - Components call storeMetaMatchData() to persist customer PII
 *
 * IMPORTANT: Returns a referentially-stable object so it can safely
 * be used in useEffect / useCallback dependency arrays without
 * causing re-fires on every render.
 */
export function useMetaTracking() {
  const orgId = useOrgId();
  const initialised = useRef(false);

  // Fetch settings and load pixel immediately (track by default)
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    // Capture fbclid IMMEDIATELY — before settings fetch or pixel load.
    // This ensures we never lose the click ID even if the pixel loads late.
    captureFbclid();

    getSettings(orgId).then(() => {
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
    getSettings(orgId).then((s) => {
      if (!s?.meta_tracking_enabled || !s.meta_pixel_id) return;

      // Check if the server-rendered HTML already fired a PageView (from layout.tsx).
      // If so, reuse its event_id for CAPI deduplication and skip the pixel call.
      const w = window as any;
      const htmlPageViewId = w.__META_HTML_PAGEVIEW_ID;

      if (htmlPageViewId) {
        // HTML already fired pixel PageView — only fire CAPI with the same event_id
        delete w.__META_HTML_PAGEVIEW_ID; // Consume it so SPA navigations fire fresh
        sendCAPI("PageView", htmlPageViewId);
        console.debug("[Meta] PageView CAPI (dedup with HTML):", htmlPageViewId);
      } else {
        // No HTML PageView (e.g., SPA navigation) — fire both pixel and CAPI
        const eventId = crypto.randomUUID();
        firePixelEvent("PageView", {}, eventId);
        sendCAPI("PageView", eventId);
        console.debug("[Meta] PageView fired:", eventId);
      }
    });
  }, []);

  const trackViewContent = useCallback(
    (params: {
      content_name?: string;
      content_ids?: string[];
      content_type?: string;
      content_category?: string;
      value?: number;
      currency?: string;
    }) => {
      getSettings(orgId).then((s) => {
        if (!s?.meta_tracking_enabled || !s.meta_pixel_id) return;
        const eventId = crypto.randomUUID();
        const enriched = { content_category: "Events", ...params };
        firePixelEvent("ViewContent", enriched, eventId);
        sendCAPI("ViewContent", eventId, enriched);
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
      content_category?: string;
      value?: number;
      currency?: string;
      num_items?: number;
    }) => {
      getSettings(orgId).then((s) => {
        if (!s?.meta_tracking_enabled || !s.meta_pixel_id) return;
        const eventId = crypto.randomUUID();
        const enriched = { content_category: "Events", ...params };
        firePixelEvent("AddToCart", enriched, eventId);
        sendCAPI("AddToCart", eventId, enriched);
        console.debug("[Meta] AddToCart fired:", params.value, params.currency, eventId);
      });
    },
    []
  );

  const trackInitiateCheckout = useCallback(
    (params: {
      content_ids?: string[];
      content_type?: string;
      content_category?: string;
      value?: number;
      currency?: string;
      num_items?: number;
    }) => {
      getSettings(orgId).then((s) => {
        if (!s?.meta_tracking_enabled || !s.meta_pixel_id) return;
        const eventId = crypto.randomUUID();
        const enriched = { content_category: "Events", ...params };
        firePixelEvent("InitiateCheckout", enriched, eventId);
        sendCAPI("InitiateCheckout", eventId, enriched);
        console.debug("[Meta] InitiateCheckout fired:", eventId);
      });
    },
    []
  );

  const trackAddPaymentInfo = useCallback(
    (params: {
      content_ids?: string[];
      content_type?: string;
      content_category?: string;
      value?: number;
      currency?: string;
      num_items?: number;
    }, userData?: { em?: string; fn?: string; ln?: string }) => {
      getSettings(orgId).then((s) => {
        if (!s?.meta_tracking_enabled || !s.meta_pixel_id) return;
        const eventId = crypto.randomUUID();
        const enriched = { content_category: "Events", ...params };
        firePixelEvent("AddPaymentInfo", enriched, eventId);
        sendCAPI("AddPaymentInfo", eventId, enriched, userData);
        console.debug("[Meta] AddPaymentInfo fired:", eventId);
      });
    },
    []
  );

  const trackPurchase = useCallback(
    (params: {
      content_ids?: string[];
      content_type?: string;
      content_category?: string;
      value?: number;
      currency?: string;
      num_items?: number;
      order_id?: string;
    }, userData?: { em?: string; fn?: string; ln?: string; ph?: string; external_id?: string }) => {
      getSettings(orgId).then((s) => {
        if (!s?.meta_tracking_enabled || !s.meta_pixel_id) return;
        // Use deterministic event_id based on order_id so server-side CAPI
        // and client-side pixel fire the same ID for deduplication.
        const eventId = params.order_id
          ? `purchase-${params.order_id}`
          : crypto.randomUUID();
        const enriched = { content_category: "Events", ...params };
        firePixelEvent("Purchase", enriched, eventId);
        sendCAPI("Purchase", eventId, enriched, userData);
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
      trackAddPaymentInfo,
      trackPurchase,
    }),
    [trackPageView, trackViewContent, trackAddToCart, trackInitiateCheckout, trackAddPaymentInfo, trackPurchase]
  );
}
