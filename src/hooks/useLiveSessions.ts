"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useOrgId } from "@/components/OrgProvider";

/* ── Types ── */

export type SessionStage = "landing" | "tickets" | "add_to_cart" | "checkout" | "purchase";

export interface LiveSession {
  sessionId: string;
  stage: SessionStage;
  eventName?: string;
  productName?: string;
  journeyPath: string[];
  enteredAt: number;
  lastSeenAt: number;
  stageChangedAt: number;
  isPurchaseNew: boolean;
}

/* ── Constants ── */

const STAGE_ORDER: SessionStage[] = ["landing", "tickets", "add_to_cart", "checkout", "purchase"];
const STAGE_SET = new Set<string>(STAGE_ORDER);
const MAX_SESSIONS = 50;
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 min
const CLEANUP_INTERVAL_MS = 5_000;
const POLL_INTERVAL_MS = 30_000;
const PURCHASE_FLASH_MS = 3_000;

function stageIndex(s: string): number {
  return STAGE_ORDER.indexOf(s as SessionStage);
}

/* ── Hook ── */

export function useLiveSessions() {
  const orgId = useOrgId();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const sessionMapRef = useRef(new Map<string, LiveSession>());
  const purchaseTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Emit current state from map
  const emitSessions = useCallback(() => {
    const arr = [...sessionMapRef.current.values()]
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .slice(0, MAX_SESSIONS);
    setSessions(arr);
  }, []);

  // Upsert a session (stage promotion only)
  const upsertSession = useCallback(
    (
      sessionId: string,
      eventType: string,
      eventName?: string,
      productName?: string,
      timestamp?: number
    ) => {
      if (!STAGE_SET.has(eventType)) return;
      const now = timestamp || Date.now();
      const stage = eventType as SessionStage;
      const map = sessionMapRef.current;
      const existing = map.get(sessionId);

      if (!existing) {
        map.set(sessionId, {
          sessionId,
          stage,
          eventName,
          productName,
          journeyPath: [stage],
          enteredAt: now,
          lastSeenAt: now,
          stageChangedAt: now,
          isPurchaseNew: stage === "purchase",
        });
      } else {
        existing.lastSeenAt = now;
        if (eventName && !existing.eventName) existing.eventName = eventName;
        if (productName) existing.productName = productName;

        // Only promote
        if (stageIndex(stage) > stageIndex(existing.stage)) {
          existing.stage = stage;
          existing.stageChangedAt = now;
          if (!existing.journeyPath.includes(stage)) {
            existing.journeyPath.push(stage);
          }
        }

        // Flash purchase
        if (stage === "purchase" && !existing.isPurchaseNew) {
          existing.isPurchaseNew = true;
        }
      }

      // Auto-clear purchase flash after 3s
      if (stage === "purchase") {
        const prevTimer = purchaseTimersRef.current.get(sessionId);
        if (prevTimer) clearTimeout(prevTimer);
        purchaseTimersRef.current.set(
          sessionId,
          setTimeout(() => {
            const s = sessionMapRef.current.get(sessionId);
            if (s) s.isPurchaseNew = false;
            purchaseTimersRef.current.delete(sessionId);
            emitSessions();
          }, PURCHASE_FLASH_MS)
        );
      }

      emitSessions();
    },
    [emitSessions]
  );

  // Seed from API
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/live-sessions");
      if (!res.ok) return;
      const json = await res.json();
      const incoming: LiveSession[] = json.sessions || [];

      const map = sessionMapRef.current;
      for (const s of incoming) {
        const existing = map.get(s.sessionId);
        if (!existing) {
          map.set(s.sessionId, { ...s });
        } else {
          // Merge: only promote stage
          if (stageIndex(s.stage) > stageIndex(existing.stage)) {
            existing.stage = s.stage;
            existing.stageChangedAt = s.stageChangedAt;
            existing.journeyPath = s.journeyPath;
          }
          existing.lastSeenAt = Math.max(existing.lastSeenAt, s.lastSeenAt);
          if (s.eventName && !existing.eventName) existing.eventName = s.eventName;
        }
      }
      emitSessions();
    } catch {
      /* fail silently */
    }
  }, [emitSessions]);

  useEffect(() => {
    // Initial fetch
    fetchSessions();

    // Safety net poll
    const pollInterval = setInterval(fetchSessions, POLL_INTERVAL_MS);

    // Cleanup stale sessions
    const cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - SESSION_TTL_MS;
      const map = sessionMapRef.current;
      let changed = false;
      for (const [id, s] of map) {
        if (s.lastSeenAt < cutoff) {
          map.delete(id);
          changed = true;
        }
      }
      if (changed) emitSessions();
    }, CLEANUP_INTERVAL_MS);

    return () => {
      clearInterval(pollInterval);
      clearInterval(cleanupInterval);
    };
  }, [fetchSessions, emitSessions]);

  // Realtime subscription
  useEffect(() => {
    if (!orgId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel("live-sessions")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "traffic_events",
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const row = payload.new as {
            session_id?: string;
            event_type?: string;
            event_name?: string;
            product_name?: string;
            timestamp?: string;
          };
          if (!row.session_id || !row.event_type) return;
          const ts = row.timestamp ? new Date(row.timestamp).getTime() : Date.now();
          upsertSession(row.session_id, row.event_type, row.event_name, row.product_name, ts);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, upsertSession]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of purchaseTimersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return sessions;
}
