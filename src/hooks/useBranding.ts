"use client";

import { useState, useEffect, useMemo } from "react";
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

/**
 * Hook to access org branding settings.
 * Returns stable reference. Fetches once and caches at module level.
 */
export function useBranding(): BrandingSettings {
  const [branding, setBranding] = useState<BrandingSettings>(
    _cachedBranding || DEFAULT_BRANDING
  );

  useEffect(() => {
    if (_cachedBranding) {
      setBranding(_cachedBranding);
      return;
    }
    fetchBranding().then(setBranding);
  }, []);

  return useMemo(() => branding, [branding]);
}
