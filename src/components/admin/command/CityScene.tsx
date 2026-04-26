"use client";

import React, { useRef, useEffect } from "react";
import createGlobe from "cobe";
import type { LiveSession, SessionStage } from "@/hooks/useLiveSessions";

/* ════════════════════════════════════════════════════════
   COBE GLOBE — Activity-reactive dot-matrix earth
   ════════════════════════════════════════════════════════ */

const STAGE_MARKER_SIZE: Record<SessionStage, number> = {
  landing: 0.03,
  tickets: 0.05,
  add_to_cart: 0.07,
  checkout: 0.10,
  purchase: 0.15,
};

const WORLD_CITIES = [
  { lat: 51.51, lng: -0.13 }, { lat: 53.48, lng: -2.24 }, { lat: 55.95, lng: -3.19 },
  { lat: 51.45, lng: -2.59 }, { lat: 52.49, lng: -1.89 }, { lat: 53.41, lng: -2.99 },
  { lat: 40.71, lng: -74.01 }, { lat: 34.05, lng: -118.24 }, { lat: 41.88, lng: -87.63 },
  { lat: 48.86, lng: 2.35 }, { lat: 52.52, lng: 13.40 }, { lat: 40.42, lng: -3.70 },
  { lat: 41.39, lng: 2.17 }, { lat: 45.46, lng: 9.19 }, { lat: 59.33, lng: 18.07 },
  { lat: 55.68, lng: 12.57 }, { lat: 52.37, lng: 4.90 }, { lat: 50.85, lng: 4.35 },
  { lat: 35.68, lng: 139.69 }, { lat: 37.57, lng: 126.98 }, { lat: -33.87, lng: 151.21 },
  { lat: -37.81, lng: 144.96 }, { lat: 1.35, lng: 103.82 }, { lat: 25.20, lng: 55.27 },
  { lat: 19.08, lng: 72.88 }, { lat: -23.55, lng: -46.63 }, { lat: 49.28, lng: -123.12 },
  { lat: 43.65, lng: -79.38 }, { lat: 22.32, lng: 114.17 }, { lat: 47.37, lng: 8.54 },
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getSessionGeo(s: LiveSession): [number, number] {
  if (s.latitude && s.longitude) return [s.latitude, s.longitude];
  const idx = hashStr(s.sessionId) % WORLD_CITIES.length;
  const city = WORLD_CITIES[idx];
  const j = (hashStr(s.sessionId + "j") % 100 - 50) / 50;
  return [city.lat + j * 2, city.lng + j * 3];
}

export interface CitySceneProps {
  sessions: LiveSession[];
  topEvents: { eventName: string; eventSlug: string; views: number; sales: number; revenue: number }[];
  eventCapacity: Record<string, { sold: number; capacity: number }>;
  purchaseFlash: boolean;
  selectedEvent: string | null;
  onSelectEvent: (slug: string | null) => void;
}

export function CityScene({ sessions, purchaseFlash }: CitySceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);
  const phiRef = useRef(0);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const flashRef = useRef(false);
  flashRef.current = purchaseFlash;

  useEffect(() => {
    if (!canvasRef.current) return;
    let width = 0;

    const onResize = () => {
      if (canvasRef.current) width = canvasRef.current.offsetWidth;
    };
    window.addEventListener("resize", onResize);
    onResize();

    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.3,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 20000,
      mapBrightness: 2.5,
      baseColor: [0.15, 0.12, 0.25],
      markerColor: [0.55, 0.36, 0.96],
      glowColor: [0.28, 0.18, 0.55],
      markers: [],
      onRender: (state) => {
        const currentSessions = sessionsRef.current;
        const sessionCount = currentSessions.length;

        // ── Activity-reactive mood ──
        // More sessions = brighter, faster, more energetic
        const activity = Math.min(sessionCount / 30, 1); // 0-1 scale

        // Rotation speed scales with activity
        const baseSpeed = 0.001 + activity * 0.003;
        if (pointerInteracting.current === null) {
          phiRef.current += baseSpeed;
        }
        state.phi = phiRef.current + pointerInteractionMovement.current;
        state.width = width * 2;
        state.height = width * 2;

        // Glow intensity scales with activity
        const baseGlow: [number, number, number] = [
          0.22 + activity * 0.12,
          0.14 + activity * 0.08,
          0.45 + activity * 0.15,
        ];
        const baseBrightness = 2 + activity * 3;

        // Purchase flash overrides
        if (flashRef.current) {
          state.glowColor = [0.2, 0.85, 0.6];
          state.mapBrightness = 8;
        } else {
          state.glowColor = baseGlow;
          state.mapBrightness = baseBrightness;
        }

        // ── Markers with pulse effect ──
        const now = Date.now();
        state.markers = currentSessions.map((s) => {
          const location = getSessionGeo(s);
          let size = STAGE_MARKER_SIZE[s.stage];

          // Pulse effect: recently changed sessions pulse larger
          const recency = now - s.stageChangedAt;
          if (recency < 5000) {
            const pulse = 1 + Math.sin(recency / 200) * 0.5 * (1 - recency / 5000);
            size *= pulse;
          }

          // Purchase dots are extra bright
          if (s.isPurchaseNew) size *= 2;

          return { location, size };
        });
      },
    });

    return () => {
      globe.destroy();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative",
    }}>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%", maxWidth: 800, aspectRatio: "1",
          cursor: "grab", contain: "layout paint size",
        }}
        onPointerDown={(e) => {
          pointerInteracting.current = e.clientX - pointerInteractionMovement.current;
          if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
        }}
        onPointerUp={() => {
          pointerInteracting.current = null;
          if (canvasRef.current) canvasRef.current.style.cursor = "grab";
        }}
        onPointerOut={() => {
          pointerInteracting.current = null;
          if (canvasRef.current) canvasRef.current.style.cursor = "grab";
        }}
        onMouseMove={(e) => {
          if (pointerInteracting.current !== null) {
            pointerInteractionMovement.current = (e.clientX - pointerInteracting.current) / 200;
          }
        }}
        onTouchMove={(e) => {
          if (pointerInteracting.current !== null && e.touches[0]) {
            pointerInteractionMovement.current = (e.touches[0].clientX - pointerInteracting.current) / 100;
          }
        }}
      />
    </div>
  );
}
