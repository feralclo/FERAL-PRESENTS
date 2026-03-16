"use client";

import { useEffect, useCallback, useRef } from "react";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
import type { TrafficEventType } from "@/types/analytics";

/** Common bot/crawler user-agent patterns */
const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|Mediapartners|Googlebot|AdsBot|Baiduspider|bingbot|DuckDuckBot|YandexBot|Sogou|exabot|facebot|ia_archiver|MJ12bot|SemrushBot|AhrefsBot|DotBot|PetalBot|HeadlessChrome|PhantomJS|Puppeteer|Lighthouse/i;

function isBot(): boolean {
  if (typeof navigator === "undefined") return false;
  return BOT_UA.test(navigator.userAgent);
}

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = sessionStorage.getItem("feral_session_id");
  if (!sid) {
    sid =
      "sess_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem("feral_session_id", sid);
  }
  return sid;
}

function getUtmParams() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source") || undefined,
    utm_medium: params.get("utm_medium") || undefined,
    utm_campaign: params.get("utm_campaign") || undefined,
  };
}

import { isTestOrder } from "@/lib/test-order";

function isDevMode(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("devmode") === "1") {
    localStorage.setItem("feral_devmode", "1");
    return true;
  }
  if (params.get("devmode") === "0") {
    localStorage.removeItem("feral_devmode");
    return false;
  }
  return localStorage.getItem("feral_devmode") === "1";
}

async function sendTrafficEvent(data: Record<string, unknown>, orgId: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return; // Env vars not configured
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/traffic_events`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ ...data, org_id: orgId }),
      cache: "no-store",
    });
  } catch {
    // Fire-and-forget — don't break the page if tracking fails
  }
}

/**
 * Detect event type from URL path (matches existing feral-traffic.js logic).
 */
function detectEventType(path: string): TrafficEventType {
  if (/\/event\/[^/]+\/checkout\/?/.test(path)) return "checkout";
  if (/\/event\/[^/]+\/tickets\/?/.test(path)) return "tickets";
  if (/\/event\/[^/]+\/?$/.test(path)) return "landing";
  // NOTE: purchase events are tracked explicitly via trackEngagement("purchase")
  // in handleOrderComplete AND server-side in confirm-order routes.
  // Do NOT auto-detect from ?purchase=success — causes ghost events on page refresh.
  return "page_view";
}

function extractEventName(path: string): string | undefined {
  const match = path.match(/\/event\/([^/]+)/);
  return match ? match[1] : undefined;
}

/**
 * Track page views and engagement events.
 * Matches the behavior of feral-traffic.js exactly.
 */
export function useTraffic(pagePath?: string) {
  const orgId = useOrgId();
  // Guard: prevent duplicate page-view fires for the same path
  const lastFiredPath = useRef<string>("");

  // Track page view on mount
  useEffect(() => {
    if (isDevMode() || isTestOrder() || isBot()) return;

    const path = pagePath || window.location.pathname;
    if (lastFiredPath.current === path) return;
    lastFiredPath.current = path;

    const eventType = detectEventType(path);
    const eventName = extractEventName(path);
    const utm = getUtmParams();

    sendTrafficEvent({
      event_type: eventType,
      page_path: path,
      event_name: eventName,
      session_id: getSessionId(),
      referrer: document.referrer || undefined,
      user_agent: navigator.userAgent,
      ...utm,
    }, orgId);
  }, [pagePath, orgId]);

  const trackEngagement = useCallback((type: TrafficEventType) => {
    if (isDevMode() || isTestOrder() || isBot()) return;
    sendTrafficEvent({
      event_type: type,
      page_path: window.location.pathname,
      event_name: extractEventName(window.location.pathname),
      session_id: getSessionId(),
      user_agent: navigator.userAgent,
    }, orgId);
  }, [orgId]);

  const trackAddToCart = useCallback(
    (productName: string, price: number, qty: number) => {
      if (isDevMode() || isTestOrder() || isBot()) return;
      sendTrafficEvent({
        event_type: "add_to_cart",
        page_path: window.location.pathname,
        event_name: extractEventName(window.location.pathname),
        session_id: getSessionId(),
        user_agent: navigator.userAgent,
        product_name: productName,
        product_price: price,
        product_qty: qty,
      }, orgId);
    },
    [orgId]
  );

  return { trackEngagement, trackAddToCart };
}
