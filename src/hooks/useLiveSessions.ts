"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useOrgId } from "@/components/OrgProvider";

/* ── Types ── */

export type SessionStage = "landing" | "tickets" | "add_to_cart" | "checkout" | "purchase";

export interface LiveSession {
  sessionId: string;
  stage: SessionStage;
  eventSlug?: string;
  eventName?: string;
  productName?: string;
  journeyPath: string[];
  enteredAt: number;
  lastSeenAt: number;
  stageChangedAt: number;
  isPurchaseNew: boolean;
  latitude?: number;
  longitude?: number;
  country?: string;
  city?: string;
}

/* ── Constants ── */

const STAGE_ORDER: SessionStage[] = ["landing", "tickets", "add_to_cart", "checkout", "purchase"];
const STAGE_SET = new Set<string>(STAGE_ORDER);
const MAX_SESSIONS = 80;
const SESSION_TTL_MS = 15 * 60 * 1000;
const CLEANUP_MS = 5_000;
const POLL_MS = 30_000;
const FLASH_MS = 3_000;

function stageIdx(s: string): number {
  return STAGE_ORDER.indexOf(s as SessionStage);
}

/* ── Hook ── */

export function useLiveSessions() {
  const orgId = useOrgId();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const mapRef = useRef(new Map<string, LiveSession>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const emit = useCallback(() => {
    setSessions(
      [...mapRef.current.values()]
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
        .slice(0, MAX_SESSIONS)
    );
  }, []);

  const upsert = useCallback(
    (sid: string, type: string, eventName?: string, eventSlug?: string, productName?: string, ts?: number) => {
      if (!STAGE_SET.has(type)) return;
      const now = ts || Date.now();
      const stage = type as SessionStage;
      const map = mapRef.current;
      const ex = map.get(sid);

      if (!ex) {
        map.set(sid, {
          sessionId: sid, stage, eventSlug, eventName, productName,
          journeyPath: [stage],
          enteredAt: now, lastSeenAt: now, stageChangedAt: now,
          isPurchaseNew: stage === "purchase",
        });
      } else {
        ex.lastSeenAt = now;
        if (eventName && !ex.eventName) { ex.eventName = eventName; ex.eventSlug = eventSlug; }
        if (productName) ex.productName = productName;
        if (stageIdx(stage) > stageIdx(ex.stage)) {
          ex.stage = stage;
          ex.stageChangedAt = now;
          if (!ex.journeyPath.includes(stage)) ex.journeyPath.push(stage);
        }
        if (stage === "purchase" && !ex.isPurchaseNew) ex.isPurchaseNew = true;
      }

      if (stage === "purchase") {
        const prev = timersRef.current.get(sid);
        if (prev) clearTimeout(prev);
        timersRef.current.set(sid, setTimeout(() => {
          const s = mapRef.current.get(sid);
          if (s) s.isPurchaseNew = false;
          timersRef.current.delete(sid);
          emit();
        }, FLASH_MS));
      }
      emit();
    },
    [emit]
  );

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/live-sessions");
      if (!res.ok) return;
      const { sessions: incoming = [] } = await res.json();
      const map = mapRef.current;
      for (const s of incoming as LiveSession[]) {
        const ex = map.get(s.sessionId);
        if (!ex) { map.set(s.sessionId, { ...s }); }
        else {
          if (stageIdx(s.stage) > stageIdx(ex.stage)) {
            ex.stage = s.stage; ex.stageChangedAt = s.stageChangedAt; ex.journeyPath = s.journeyPath;
          }
          ex.lastSeenAt = Math.max(ex.lastSeenAt, s.lastSeenAt);
          if (s.eventName && !ex.eventName) { ex.eventName = s.eventName; ex.eventSlug = s.eventSlug; }
        }
      }
      emit();
    } catch { /* fail silently */ }
  }, [emit]);

  useEffect(() => {
    fetchAll();
    const poll = setInterval(fetchAll, POLL_MS);
    const cleanup = setInterval(() => {
      const cutoff = Date.now() - SESSION_TTL_MS;
      let changed = false;
      for (const [id, s] of mapRef.current) {
        if (s.lastSeenAt < cutoff) { mapRef.current.delete(id); changed = true; }
      }
      if (changed) emit();
    }, CLEANUP_MS);
    return () => { clearInterval(poll); clearInterval(cleanup); };
  }, [fetchAll, emit]);

  useEffect(() => {
    if (!orgId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const ch = supabase
      .channel("live-sessions")
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "traffic_events",
        filter: `org_id=eq.${orgId}`,
      }, (payload) => {
        const r = payload.new as {
          session_id?: string; event_type?: string;
          event_name?: string; product_name?: string; timestamp?: string;
        };
        if (!r.session_id || !r.event_type) return;
        upsert(r.session_id, r.event_type, r.event_name, r.event_name, r.product_name,
          r.timestamp ? new Date(r.timestamp).getTime() : Date.now());
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orgId, upsert]);

  useEffect(() => {
    return () => { for (const t of timersRef.current.values()) clearTimeout(t); };
  }, []);

  return sessions;
}
