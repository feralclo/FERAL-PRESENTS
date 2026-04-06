"use client";

import { useState, useEffect, useMemo, createContext, useContext, type ReactNode } from "react";
import type { BrandingSettings } from "@/types/settings";

/** Platform-neutral default branding — tenants override via {org_id}_branding settings */
const DEFAULT_BRANDING: BrandingSettings = {
  org_name: "Entry",
  logo_url: "",
  accent_color: "#8B5CF6",
  background_color: "#0e0e0e",
  card_color: "#1a1a1a",
  text_color: "#ffffff",
  heading_font: "Space Mono",
  body_font: "Inter",
  copyright_text: "",
};

/** Module-level cache to avoid re-fetching on every mount */
let _cachedBranding: BrandingSettings | null = null;
let _fetchPromise: Promise<BrandingSettings> | null = null;

/**
 * Hydrate branding from server-side data embedded in the page.
 * Called once on module load — if the server injected __BRANDING__ into
 * the DOM, we use it immediately so the first render has correct data.
 */
if (typeof window !== "undefined" && !_cachedBranding) {
  try {
    const el = document.getElementById("__BRANDING_DATA__");
    if (el?.textContent) {
      const parsed = JSON.parse(el.textContent);
      if (parsed && typeof parsed === "object" && parsed.org_name) {
        _cachedBranding = { ...DEFAULT_BRANDING, ...parsed };
      }
    }
  } catch {
    // Ignore — will fetch client-side as usual
  }
}

function fetchBranding(): Promise<BrandingSettings> {
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = fetch("/api/branding")
    .then((res) => res.json())
    .then((json) => {
      const branding = json.data || DEFAULT_BRANDING;
      _cachedBranding = branding;
      return branding;
    })
    .catch(() => {
      _cachedBranding = DEFAULT_BRANDING;
      return DEFAULT_BRANDING;
    });

  return _fetchPromise;
}

/* ── Server-side branding context ── */

const BrandingContext = createContext<BrandingSettings | null>(null);

/**
 * Wraps children with server-fetched branding to prevent FOUC.
 * Used by event layout to pass branding from server → client components.
 */
export function BrandingProvider({
  children,
  initialBranding,
}: {
  children: ReactNode;
  initialBranding: BrandingSettings | null;
}) {
  const value = initialBranding
    ? { ...DEFAULT_BRANDING, ...initialBranding }
    : null;

  // Also populate the module cache so non-context consumers stay in sync
  if (value && !_cachedBranding) {
    _cachedBranding = value;
  }

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

/**
 * Hook to access org branding settings.
 * Returns stable reference. Checks context first (SSR-safe), then module cache, then fetches.
 */
export function useBranding(): BrandingSettings {
  const contextBranding = useContext(BrandingContext);
  const initial = contextBranding || _cachedBranding || DEFAULT_BRANDING;

  const [branding, setBranding] = useState<BrandingSettings>(initial);

  useEffect(() => {
    // Context or cache already has correct branding — skip fetch
    if (contextBranding || _cachedBranding) {
      setBranding(contextBranding || _cachedBranding!);
      return;
    }
    fetchBranding().then(setBranding);
  }, [contextBranding]);

  return useMemo(() => branding, [branding]);
}
