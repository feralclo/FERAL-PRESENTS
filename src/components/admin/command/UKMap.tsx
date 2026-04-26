"use client";

import React, { useRef, useEffect, useMemo } from "react";
import L from "leaflet";
import type { LiveSession, SessionStage } from "@/hooks/useLiveSessions";

/* ════════════════════════════════════════════════════════
   UK MAP — Leaflet with dark CartoDB tiles
   ════════════════════════════════════════════════════════ */

// No external tiles — pure dark background with city nodes

const STAGE_COLORS: Record<SessionStage, string> = {
  landing: "#8888a0",
  tickets: "#38BDF8",
  add_to_cart: "#FBBF24",
  checkout: "#8B5CF6",
  purchase: "#34D399",
};

const UK_CITIES: Record<string, { lat: number; lng: number; label: string }> = {
  liverpool:  { lat: 53.41, lng: -2.99, label: "Liverpool" },
  manchester: { lat: 53.48, lng: -2.24, label: "Manchester" },
  london:     { lat: 51.51, lng: -0.13, label: "London" },
  birmingham: { lat: 52.49, lng: -1.89, label: "Birmingham" },
  leeds:      { lat: 53.80, lng: -1.55, label: "Leeds" },
  edinburgh:  { lat: 55.95, lng: -3.19, label: "Edinburgh" },
  glasgow:    { lat: 55.86, lng: -4.25, label: "Glasgow" },
  bristol:    { lat: 51.45, lng: -2.59, label: "Bristol" },
  newcastle:  { lat: 54.98, lng: -1.62, label: "Newcastle" },
  cardiff:    { lat: 51.48, lng: -3.18, label: "Cardiff" },
  nottingham: { lat: 52.95, lng: -1.15, label: "Nottingham" },
  sheffield:  { lat: 53.38, lng: -1.47, label: "Sheffield" },
  brighton:   { lat: 50.82, lng: -0.14, label: "Brighton" },
  belfast:    { lat: 54.60, lng: -5.93, label: "Belfast" },
  aberdeen:   { lat: 57.15, lng: -2.09, label: "Aberdeen" },
};

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function matchCity(city: string): string | null {
  const norm = city.toLowerCase().trim();
  if (UK_CITIES[norm]) return norm;
  for (const [key, val] of Object.entries(UK_CITIES)) {
    if (norm.includes(key) || key.includes(norm) || val.label.toLowerCase() === norm) return key;
  }
  return null;
}

interface UKEvent {
  id: string; slug: string; name: string; city: string;
  venue_name?: string; status: string;
}

interface UKMapProps {
  sessions: LiveSession[];
  events: UKEvent[];
  funnel: { landing: number; tickets: number; add_to_cart: number; checkout: number; purchase: number };
}

export function UKMap({ sessions, events }: UKMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  // Build city data
  const cityData = useMemo(() => {
    const map = new Map<string, {
      city: typeof UK_CITIES[string]; events: UKEvent[];
      sessions: LiveSession[]; byStage: Record<SessionStage, number>;
    }>();

    for (const ev of events) {
      const key = matchCity(ev.city);
      if (!key || !UK_CITIES[key]) continue;
      if (!map.has(key)) {
        map.set(key, {
          city: UK_CITIES[key], events: [], sessions: [],
          byStage: { landing: 0, tickets: 0, add_to_cart: 0, checkout: 0, purchase: 0 },
        });
      }
      map.get(key)!.events.push(ev);
    }

    for (const s of sessions) {
      let key: string | null = null;
      if (s.city) key = matchCity(s.city);
      if (!key && s.eventSlug) {
        const ev = events.find((e) => e.slug === s.eventSlug);
        if (ev) key = matchCity(ev.city);
      }
      if (!key) {
        const keys = [...map.keys()];
        if (keys.length > 0) key = keys[hashStr(s.sessionId) % keys.length];
      }
      if (key && map.has(key)) {
        const d = map.get(key)!;
        d.sessions.push(s);
        d.byStage[s.stage]++;
      }
    }

    return map;
  }, [sessions, events]);

  // Load Leaflet CSS from CDN (bundler can't handle it in dynamic imports)
  useEffect(() => {
    if (document.querySelector('link[href*="leaflet"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }, []);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [54.0, -2.5],
      zoom: 6,
      zoomControl: false,
      attributionControl: false,
    });

    // No tile layer — pure dark background
    // Simplified UK coastline as a polygon overlay
    const ukOutline: [number, number][] = [
      [49.9,-5.7],[50.1,-5.0],[50.3,-4.2],[50.6,-3.5],[50.7,-2.5],[50.8,-1.3],[50.7,-0.8],
      [51.0,0.3],[51.1,1.0],[51.4,1.4],[52.0,1.7],[52.5,1.8],[52.9,1.7],[53.1,0.3],
      [53.5,0.1],[53.7,-0.1],[54.1,-0.1],[54.5,-0.8],[54.6,-1.2],[55.0,-1.4],
      [55.4,-1.6],[55.8,-2.0],[56.0,-2.5],[56.5,-3.0],[56.9,-2.2],[57.1,-2.0],
      [57.5,-1.8],[57.7,-2.0],[57.8,-3.0],[58.0,-3.4],[58.5,-5.0],[58.3,-5.1],
      [57.8,-5.5],[57.5,-5.7],[57.0,-5.8],[56.5,-6.3],[56.0,-5.7],[55.8,-5.3],
      [55.4,-4.8],[55.0,-5.0],[54.7,-5.1],[54.4,-5.5],[54.0,-4.8],[53.4,-4.4],
      [53.2,-3.1],[52.8,-4.1],[52.1,-4.5],[51.7,-5.0],[51.6,-5.2],[51.2,-3.3],
      [51.0,-4.2],[50.8,-4.5],[50.4,-5.0],[49.9,-5.7],
    ];

    L.polygon(ukOutline, {
      color: "rgba(139, 92, 246, 0.25)",
      weight: 1.5,
      fillColor: "rgba(139, 92, 246, 0.04)",
      fillOpacity: 1,
      dashArray: "4 4",
    }).addTo(map);

    // Ireland outline (simplified)
    const irelandOutline: [number, number][] = [
      [51.4,-10.0],[51.8,-9.8],[52.2,-10.3],[52.6,-9.9],[53.1,-10.1],[53.5,-10.0],
      [53.9,-9.9],[54.3,-10.0],[54.5,-8.5],[55.0,-8.0],[55.3,-7.5],[55.4,-6.2],
      [54.6,-5.5],[54.0,-6.0],[53.3,-6.1],[52.8,-6.3],[52.2,-6.9],[51.8,-8.3],
      [51.5,-9.5],[51.4,-10.0],
    ];

    L.polygon(irelandOutline, {
      color: "rgba(139, 92, 246, 0.15)",
      weight: 1,
      fillColor: "rgba(139, 92, 246, 0.02)",
      fillOpacity: 1,
      dashArray: "3 5",
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old markers
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const maxSessions = Math.max(1, ...[...cityData.values()].map((d) => d.sessions.length));

    for (const [key, data] of cityData) {
      const { city, sessions: citySessions, events: cityEvents, byStage } = data;
      const total = citySessions.length;
      const intensity = total / maxSessions;
      const hasPurchase = byStage.purchase > 0;
      const hasCheckout = byStage.checkout > 0;
      const mainColor = hasPurchase ? "#34D399" : hasCheckout ? "#8B5CF6" : total > 0 ? "#38BDF8" : "#8888a0";
      const size = 30 + intensity * 50;

      // Session dots HTML
      const sessionDots = citySessions.slice(0, 10).map((s, i) => {
        const angle = (i / Math.min(citySessions.length, 10)) * Math.PI * 2;
        const dist = size * 0.35 + (hashStr(s.sessionId) % 10);
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist;
        return `<div style="
          position:absolute; left:50%; top:50%;
          width:5px; height:5px; border-radius:50%;
          background:${STAGE_COLORS[s.stage]};
          transform:translate(calc(-50% + ${x}px), calc(-50% + ${y}px));
          opacity:0.8;
          animation: cmd-dot-float ${1.5 + (i % 3) * 0.5}s ease-in-out infinite alternate;
        "></div>`;
      }).join("");

      const html = `
        <div style="position:relative; width:${size}px; height:${size}px;">
          <!-- Pulse ring -->
          <div style="
            position:absolute; inset:-30%; border-radius:50%;
            border:1.5px solid ${mainColor};
            animation: cmd-map-pulse 2.5s ease-out infinite;
            opacity:0.4;
          "></div>
          <!-- Glow -->
          <div style="
            position:absolute; inset:-20%; border-radius:50%;
            background:radial-gradient(circle, ${mainColor}20 0%, transparent 70%);
          "></div>
          <!-- Outer ring -->
          <div style="
            position:absolute; inset:15%; border-radius:50%;
            border:1.5px solid ${mainColor};
            opacity:${total > 0 ? 0.6 : 0.15};
            animation: cmd-map-breathe 2s ease-in-out infinite;
          "></div>
          <!-- Core -->
          <div style="
            position:absolute; left:50%; top:50%;
            width:${8 + intensity * 8}px; height:${8 + intensity * 8}px;
            border-radius:50%; background:${mainColor};
            transform:translate(-50%,-50%);
            box-shadow: 0 0 ${6 + intensity * 12}px ${mainColor};
          "></div>
          <!-- Session dots -->
          ${sessionDots}
          <!-- Label -->
          <div style="
            position:absolute; bottom:100%; left:50%; transform:translateX(-50%);
            white-space:nowrap; padding-bottom:8px; text-align:center;
          ">
            ${total > 0 ? `<div style="
              font-family:'Space Mono',monospace; font-size:9px; font-weight:700;
              color:${mainColor}; letter-spacing:0.5px;
              text-shadow: 0 0 8px rgba(0,0,0,0.9);
            ">${total} live</div>` : ""}
            <div style="
              font-family:'Space Mono',monospace; font-size:10px; font-weight:700;
              color:rgba(224,232,255,${total > 0 ? 0.7 : 0.25}); letter-spacing:1.5px;
              text-transform:uppercase;
              text-shadow: 0 0 8px rgba(0,0,0,0.9);
            ">${city.label}</div>
          </div>
        </div>
      `;

      const icon = L.divIcon({
        html,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        className: "",
      });

      // Popup
      const popupHtml = `
        <div style="font-family:'Space Mono',monospace; min-width:180px;">
          <div style="font-size:12px; font-weight:700; color:#e0e8ff; letter-spacing:1.5px; text-transform:uppercase;">
            ${city.label}
          </div>
          <div style="margin-top:6px; font-size:10px; color:rgba(224,232,255,0.4);">
            <span style="color:#34D399; font-weight:700;">${total} live</span> · ${cityEvents.length} events
          </div>
          <div style="margin-top:8px; display:flex; gap:6px;">
            ${(["landing", "tickets", "add_to_cart", "checkout", "purchase"] as const).map((stage) => `
              <div style="text-align:center; flex:1;">
                <div style="font-size:13px; font-weight:700; color:${byStage[stage] > 0 ? STAGE_COLORS[stage] : "rgba(224,232,255,0.15)"};">
                  ${byStage[stage] || "—"}
                </div>
                <div style="font-size:7px; color:rgba(224,232,255,0.2); text-transform:uppercase; letter-spacing:0.5px;">
                  ${stage === "add_to_cart" ? "Cart" : stage === "landing" ? "View" : stage}
                </div>
              </div>
            `).join("")}
          </div>
          ${cityEvents.slice(0, 3).map((ev) => `
            <div style="margin-top:4px; font-size:9px; color:rgba(224,232,255,0.3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${ev.name}
            </div>
          `).join("")}
        </div>
      `;

      const marker = L.marker([city.lat, city.lng], { icon })
        .bindPopup(popupHtml, {
          className: "cmd-leaflet-popup",
          closeButton: false,
          offset: [0, -size / 2 - 10],
        })
        .addTo(map);

      markersRef.current.push(marker);
    }
  }, [cityData]);

  return (
    <>
      <div ref={containerRef} style={{ position: "fixed", inset: 0, zIndex: 0, background: "#030306" }} />
      <style>{`
        @keyframes cmd-map-pulse {
          0% { transform: scale(0.8); opacity: 0.5; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes cmd-map-breathe {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.08); }
        }
        @keyframes cmd-dot-float {
          0% { transform: translate(calc(-50% + var(--x, 0px)), calc(-50% + var(--y, 0px))); }
          100% { transform: translate(calc(-50% + var(--x, 0px)), calc(-50% + var(--y, 0px) - 3px)); }
        }
        .cmd-leaflet-popup .leaflet-popup-content-wrapper {
          background: rgba(3, 3, 6, 0.92) !important;
          border: 1px solid rgba(255, 255, 255, 0.06) !important;
          border-radius: 14px !important;
          box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6) !important;
          color: #e0e8ff;
        }
        .cmd-leaflet-popup .leaflet-popup-tip {
          background: rgba(3, 3, 6, 0.92) !important;
          border: 1px solid rgba(255, 255, 255, 0.06) !important;
          box-shadow: none !important;
        }
        .cmd-leaflet-popup .leaflet-popup-content {
          margin: 12px 14px !important;
        }
        .leaflet-control-zoom a {
          background: rgba(3, 3, 6, 0.7) !important;
          color: rgba(224, 232, 255, 0.5) !important;
          border-color: rgba(255, 255, 255, 0.06) !important;
          backdrop-filter: blur(12px);
        }
        .leaflet-control-zoom a:hover {
          background: rgba(139, 92, 246, 0.15) !important;
          color: rgba(224, 232, 255, 0.8) !important;
        }
        /* Fix admin CSS breaking Leaflet tile images */
        .leaflet-container img {
          display: block !important;
          max-width: none !important;
          max-height: none !important;
        }
        .leaflet-tile-pane,
        .leaflet-tile-container,
        .leaflet-tile {
          position: absolute !important;
        }
        /* Hide empty tile pane */
        .leaflet-tile-pane {
          display: none;
        }
      `}</style>
    </>
  );
}
