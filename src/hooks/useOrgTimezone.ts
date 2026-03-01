"use client";

import { useState, useEffect } from "react";
import { useOrgId } from "@/components/OrgProvider";
import { generalKey } from "@/lib/constants";
import { detectBrowserTimezone } from "@/lib/timezone";

/**
 * Fetches the org's configured timezone from {org_id}_general settings.
 * Falls back to browser timezone → "Europe/London".
 */
export function useOrgTimezone(): { timezone: string; loading: boolean } {
  const orgId = useOrgId();
  const [timezone, setTimezone] = useState<string>(() => detectBrowserTimezone());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/settings?key=${generalKey(orgId)}`);
        if (!res.ok) throw new Error();
        const { data } = await res.json();
        if (!cancelled && data?.timezone) {
          setTimezone(data.timezone);
        }
      } catch {
        // Keep browser timezone as fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return { timezone, loading };
}
