"use client";

import { useEffect, useState } from "react";
import type { SalesBucket } from "@/lib/sales-velocity";

/**
 * Fetch the sales-timeline payload for one event. Used by the admin
 * Release Strategy panel + the Sales Timeline card. Phase 4 of
 * EVENT-BUILDER-PLAN.
 *
 * Re-fetches on `eventId` change. No realtime — the panel is a snapshot
 * the host opens, scans, and closes; live polling would only flicker the
 * UI without changing the host's decisions.
 */

export interface SalesTimelinePayload {
  buckets: SalesBucket[];
  ticketTypes: {
    id: string;
    name: string;
    sold: number;
    capacity: number | null;
    sort_order: number;
  }[];
  currency: string;
  generatedAt: string;
}

export interface UseEventSalesTimelineResult {
  data: SalesTimelinePayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useEventSalesTimeline(
  eventId: string | undefined | null
): UseEventSalesTimelineResult {
  const [data, setData] = useState<SalesTimelinePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    if (!eventId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/events/${eventId}/sales-timeline`)
      .then(async (res) => {
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(json.error || `Failed: ${res.status}`);
        }
        return res.json() as Promise<SalesTimelinePayload>;
      })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [eventId, bump]);

  return {
    data,
    loading,
    error,
    refresh: () => setBump((n) => n + 1),
  };
}
