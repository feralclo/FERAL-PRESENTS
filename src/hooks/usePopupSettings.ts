"use client";

import { useState, useEffect, useMemo } from "react";
import type { PopupSettings } from "@/types/settings";
import { popupKey } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";

/** Default popup config — matches the hardcoded values from the original DiscountPopup */
export const DEFAULT_POPUP_SETTINGS: PopupSettings = {
  enabled: true,
  discount_code: "FERALRAVER10",
  headline: "Unlock Feral Raver Discount",
  subheadline: "Save it before it's gone",
  cta_text: "Save My Discount",
  dismiss_text: "Nah, I'll Pay Full Price",
  email_subheadline: "We\u2019ll send your exclusive code",
  email_cta_text: "Get My Discount",
  cta_color: "#ff0033",
  mobile_delay: 6000,
  desktop_delay: 12000,
  dismiss_days: 30,
  countdown_seconds: 299,
  exit_intent: true,
  klaviyo_enabled: true,
};

/** Module-level cache to avoid re-fetching on every mount */
let _cachedSettings: PopupSettings | null = null;
let _fetchPromise: Promise<PopupSettings> | null = null;

function fetchPopupSettings(orgId: string): Promise<PopupSettings> {
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = fetch(`/api/settings?key=${popupKey(orgId)}`)
    .then((res) => res.json())
    .then((json) => {
      const settings = json?.data
        ? { ...DEFAULT_POPUP_SETTINGS, ...json.data }
        : DEFAULT_POPUP_SETTINGS;
      _cachedSettings = settings;
      return settings;
    })
    .catch(() => {
      _cachedSettings = DEFAULT_POPUP_SETTINGS;
      return DEFAULT_POPUP_SETTINGS;
    });

  return _fetchPromise;
}

/**
 * Hook to access popup settings.
 * Returns stable reference. Fetches once and caches at module level.
 * Falls back to hardcoded defaults if no admin config exists.
 */
export function usePopupSettings(): PopupSettings {
  const orgId = useOrgId();
  const [settings, setSettings] = useState<PopupSettings>(
    _cachedSettings || DEFAULT_POPUP_SETTINGS
  );

  useEffect(() => {
    if (_cachedSettings) {
      setSettings(_cachedSettings);
      return;
    }
    fetchPopupSettings(orgId).then(setSettings);
  }, [orgId]);

  return useMemo(() => settings, [settings]);
}
