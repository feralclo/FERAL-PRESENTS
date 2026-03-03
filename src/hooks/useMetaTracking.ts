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
let _advancedMatchingApplied = false;

/** localStorage key for stored customer match data (persists across sessions) */
const META_MATCH_KEY = "feral_meta_match";

// ─── Pixel availability (synchronous check) ─────────────────────────────────
// The root layout renders the pixel inline in <head> when tracking is enabled.
// If window.fbq exists, we know the pixel is initialized and can fire events
// immediately — no need to wait for the async settings fetch.

/**
 * Check if the Meta Pixel is available on the page.
 * The pixel is loaded by the inline script in layout.tsx <head> — if it
 * exists, tracking is enabled and we can fire events synchronously.
 */
function isPixelReady(): boolean {
  return typeof window !== "undefined" && typeof window.fbq === "function";
}

/**
 * Get the pixel ID from the server-rendered global (set by layout.tsx).
 * This avoids needing the async settings fetch to know the pixel ID.
 */
function getHtmlPixelId(): string | null {
  if (typeof window === "undefined") return null;
  return (window as any).__META_PIXEL_ID || null;
}

/** Fetch marketing settings from our API (cached for the page lifecycle).
 *  Only needed for CAPI (server route needs the token).
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
          "[Meta] Marketing settings not found — CAPI events will be skipped.",
          "Pixel events still fire via HTML snippet."
        );
        _fetchPromise = null;
      } else {
        console.debug(
          "[Meta] Settings loaded — CAPI:",
          _settings.meta_capi_token ? "configured" : "no token (CAPI disabled)"
        );
      }
      return _settings;
    })
    .catch((err) => {
      console.warn("[Meta] Failed to fetch marketing settings:", err);
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

/**
 * Mark Advanced Matching as ready (data exists in localStorage).
 * We do NOT call fbq('init') again — re-initializing the pixel causes
 * a phantom PageView without an event ID, leading to duplicate/ghost
 * events in Meta Test Events. Instead, stored match data is sent
 * via CAPI on every event (merged in sendCAPI), which provides the
 * same match quality without the client-side re-init side effects.
 */
function markAdvancedMatchingReady() {
  if (_advancedMatchingApplied) return;
  _advancedMatchingApplied = true;

  const matchData = getStoredMatchData();
  const fields = Object.keys(matchData).filter(k => matchData[k as keyof StoredMatchData]);
  if (fields.length > 0) {
    console.debug("[Meta] Advanced Matching data available for CAPI:", fields.join(", "));
  }
}

/**
 * Load Meta Pixel base code (only needed for SPA paths without HTML snippet).
 * If the HTML already loaded the pixel (standard path), this is a no-op.
 */
function loadPixelIfNeeded(pixelId: string) {
  if (_pixelLoaded) return;
  _pixelLoaded = true;

  const w = window as any;

  if (w.fbq) {
    // Pixel was already loaded from server-rendered HTML — no need to inject again.
    console.debug("[Meta] Pixel already loaded from HTML — _fbp:", getCookie("_fbp") ? "set" : "not set");
    return;
  }

  // SPA path: create the fbq queue function and inject fbevents.js
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

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  script.onerror = () => console.warn("[Meta] Pixel script failed to load");
  document.head.appendChild(script);

  w.fbq("init", pixelId);
  console.debug("[Meta] Pixel loaded and initialized (SPA path):", pixelId);
}

/** Fire a pixel event (client-side, synchronous). */
function firePixelEvent(
  eventName: string,
  params: Record<string, unknown>,
  eventId: string
) {
  if (!hasMarketingConsent()) {
    console.debug(`[Meta] Consent blocked — skipping pixel ${eventName}`);
    return false;
  }
  if (!isPixelReady()) {
    console.debug(`[Meta] Pixel not available — skipping pixel ${eventName}`);
    return false;
  }
  window.fbq("track", eventName, params, { eventID: eventId });
  return true;
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
 * Waits for settings (needs the server route to have the CAPI token)
 * and for the _fbp cookie for matching.
 */
function sendCAPI(
  orgId: string,
  eventName: string,
  eventId: string,
  customData?: Record<string, unknown>,
  userData?: CAPIUserData
) {
  const eventSourceUrl = window.location.href;

  // Fire CAPI async — needs settings for the server route to have the token.
  // This is fine because CAPI is server-side and doesn't affect Pixel Helper.
  getSettings(orgId).then((s) => {
    if (!s?.meta_tracking_enabled) return;

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
  });
}

/**
 * Unified Meta tracking hook.
 *
 * Architecture: Pixel events fire IMMEDIATELY (synchronous) when window.fbq
 * exists (loaded by the inline HTML snippet in layout.tsx). CAPI events fire
 * ASYNC after settings are fetched (the server route needs the CAPI token).
 * This separation ensures the Pixel Helper and Meta Test Events always see
 * client-side events, even if the settings fetch is slow or fails.
 *
 * Full funnel coverage:
 *   PageView → ViewContent → AddToCart → InitiateCheckout → AddPaymentInfo → Purchase
 *
 * Server-rendered events (from inline <script> tags):
 *   - PageView: fired in layout.tsx <head> → deduped via __META_HTML_PAGEVIEW_ID
 *   - ViewContent: fired in event/[slug]/page.tsx → deduped via __META_HTML_VIEWCONTENT_ID
 *
 * Advanced Matching:
 *   - Captures fbclid from URL → _fbc cookie (before pixel loads)
 *   - Passes stored customer data via fbq('init') for pixel-side matching
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

  // One-time init: capture fbclid, apply advanced matching, prefetch settings
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    // Capture fbclid IMMEDIATELY — before anything else
    captureFbclid();

    // Check for stored customer data (sent via CAPI, not client re-init)
    markAdvancedMatchingReady();

    // Prefetch settings for CAPI (fire-and-forget — pixel events don't need this)
    getSettings(orgId).then((s) => {
      // If pixel wasn't loaded from HTML (rare — SPA entry without HTML render),
      // try to load it now that we have the pixel ID from settings
      if (s?.meta_tracking_enabled && s.meta_pixel_id && !isPixelReady()) {
        if (hasMarketingConsent()) {
          loadPixelIfNeeded(s.meta_pixel_id);
        }
      }
    });

    // Listen for consent changes
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "feral_cookie_consent") return;
      // If consent is re-granted, try to load pixel from settings
      getSettings(orgId).then((s) => {
        if (s?.meta_tracking_enabled && s.meta_pixel_id && !isPixelReady() && hasMarketingConsent()) {
          loadPixelIfNeeded(s.meta_pixel_id);
        }
      });
    };
    window.addEventListener("storage", onStorage);

    const onConsentUpdate = () => {
      getSettings(orgId).then((s) => {
        if (s?.meta_tracking_enabled && s.meta_pixel_id && !isPixelReady() && hasMarketingConsent()) {
          loadPixelIfNeeded(s.meta_pixel_id);
        }
      });
    };
    window.addEventListener("feral_consent_update", onConsentUpdate);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("feral_consent_update", onConsentUpdate);
    };
  }, []);

  // ─── Tracking functions ─────────────────────────────────────────────────────
  // Each function fires the pixel event IMMEDIATELY (synchronous) and then
  // fires the CAPI event in the background (async). The pixel event doesn't
  // depend on settings — if window.fbq exists, it fires.

  const trackPageView = useCallback(() => {
    const w = window as any;
    const htmlPageViewId = w.__META_HTML_PAGEVIEW_ID;

    if (htmlPageViewId) {
      // HTML already fired pixel PageView — only fire CAPI with the same event_id
      delete w.__META_HTML_PAGEVIEW_ID; // Consume so SPA navigations fire fresh
      sendCAPI(orgId, "PageView", htmlPageViewId);
      console.debug("[Meta] PageView CAPI (dedup with HTML):", htmlPageViewId);
    } else {
      // SPA navigation — fire both pixel and CAPI
      const eventId = crypto.randomUUID();
      firePixelEvent("PageView", {}, eventId);
      sendCAPI(orgId, "PageView", eventId);
      console.debug("[Meta] PageView fired:", eventId);
    }
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
      const enriched = { content_category: "Events", ...params };
      const w = window as any;
      const htmlVcId = w.__META_HTML_VIEWCONTENT_ID;

      if (htmlVcId) {
        // HTML already fired pixel ViewContent — only fire CAPI with the same event_id
        delete w.__META_HTML_VIEWCONTENT_ID;
        sendCAPI(orgId, "ViewContent", htmlVcId, enriched);
        console.debug("[Meta] ViewContent CAPI (dedup with HTML):", params.content_name, htmlVcId);
      } else {
        // No HTML ViewContent — fire pixel immediately + CAPI async
        const eventId = crypto.randomUUID();
        firePixelEvent("ViewContent", enriched, eventId);
        sendCAPI(orgId, "ViewContent", eventId, enriched);
        console.debug("[Meta] ViewContent fired:", params.content_name, eventId);
      }
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
      const eventId = crypto.randomUUID();
      const enriched = { content_category: "Events", ...params };

      // Fire pixel immediately — no settings wait
      firePixelEvent("AddToCart", enriched, eventId);
      // Fire CAPI async
      sendCAPI(orgId, "AddToCart", eventId, enriched);

      console.debug("[Meta] AddToCart fired:", params.content_name, params.value, params.currency, eventId);
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
      const eventId = crypto.randomUUID();
      const enriched = { content_category: "Events", ...params };

      firePixelEvent("InitiateCheckout", enriched, eventId);
      sendCAPI(orgId, "InitiateCheckout", eventId, enriched);

      console.debug("[Meta] InitiateCheckout fired:", params.value, params.currency, eventId);
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
      const eventId = crypto.randomUUID();
      const enriched = { content_category: "Events", ...params };

      firePixelEvent("AddPaymentInfo", enriched, eventId);
      sendCAPI(orgId, "AddPaymentInfo", eventId, enriched, userData);

      console.debug("[Meta] AddPaymentInfo fired:", eventId);
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
      // Use deterministic event_id based on order_id for deduplication
      const eventId = params.order_id
        ? `purchase-${params.order_id}`
        : crypto.randomUUID();
      const enriched = { content_category: "Events", ...params };

      firePixelEvent("Purchase", enriched, eventId);
      sendCAPI(orgId, "Purchase", eventId, enriched, userData);

      console.debug("[Meta] Purchase fired:", params.order_id, params.value, params.currency, eventId);
    },
    []
  );

  // Return a stable object — all callbacks have [] deps so they never change
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
