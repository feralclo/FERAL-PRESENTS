"use client";

import { useEffect, useRef, useCallback } from "react";
import { ORG_ID } from "@/lib/constants";
import type { TrafficEventType } from "@/types/analytics";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

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

async function sendTrafficEvent(data: Record<string, unknown>) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return; // Env vars not configured
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/traffic_events`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ ...data, org_id: ORG_ID }),
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
  if (/[?&]purchase=success/.test(window.location.search)) return "purchase";
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
  const addToCartFired = useRef(false);

  // Track page view on mount
  useEffect(() => {
    if (isDevMode()) return;

    const path = pagePath || window.location.pathname;
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
    });
  }, [pagePath]);

  const trackEngagement = useCallback((type: TrafficEventType) => {
    if (isDevMode()) return;
    sendTrafficEvent({
      event_type: type,
      page_path: window.location.pathname,
      event_name: extractEventName(window.location.pathname),
      session_id: getSessionId(),
      user_agent: navigator.userAgent,
    });
  }, []);

  const trackAddToCart = useCallback(
    (productName: string, price: number, qty: number) => {
      if (isDevMode() || addToCartFired.current) return;
      addToCartFired.current = true;
      sendTrafficEvent({
        event_type: "add_to_cart",
        page_path: window.location.pathname,
        event_name: extractEventName(window.location.pathname),
        session_id: getSessionId(),
        user_agent: navigator.userAgent,
        product_name: productName,
        product_price: price,
        product_qty: qty,
      });
    },
    []
  );

  return { trackEngagement, trackAddToCart };
}
