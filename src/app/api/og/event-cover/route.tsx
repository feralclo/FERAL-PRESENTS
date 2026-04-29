import { ImageResponse } from "next/og";

export const runtime = "edge";

/**
 * GET /api/og/event-cover — Deterministic generated cover image.
 *
 * Phase 2.4 of EVENT-BUILDER-PLAN. The Start moment routes through here when
 * a host hasn't uploaded their own cover yet, so a brand-new event never
 * shows a grey placeholder. The URL is content-addressed by query params so
 * it works as a cache key all by itself — `cover_image_url` stores the URL,
 * not a Storage path. When the host uploads a real cover later, we just
 * replace the URL.
 *
 * Query params:
 *   ?name=…       (required)  — event name; truncated for layout
 *   ?venue=…                  — venue line, optional
 *   ?date=ISO                 — start date, formatted "Sat 14 Jun · 21:00"
 *   ?accent=#HEX              — brand accent; defaults to Electric Violet
 *   ?variant=square|portrait|landscape — output aspect; defaults to square
 *
 * Sizes:
 *   square    — 1080×1080  (in-app cards, dashboards)
 *   portrait  — 1080×1350  (Story share, IG portrait)
 *   landscape — 1200×630   (OG / link unfurls)
 *
 * Visual:
 *   Radial gradient seeded from the accent in the top-left, fading to a
 *   near-black void in the bottom-right. Event name dominates in white
 *   display type, venue + date sit in mono below. Small "ENTRY" wordmark
 *   bottom-right keeps the platform signature visible.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get("name") || "Untitled event").slice(0, 80);
  const venue = (searchParams.get("venue") || "").slice(0, 60);
  const dateRaw = searchParams.get("date") || "";
  const accent = normaliseHex(searchParams.get("accent")) || "#8B5CF6";
  const variant = pickVariant(searchParams.get("variant"));

  const dateLine = formatDateLine(dateRaw);
  const metaLine = [venue, dateLine].filter(Boolean).join("  ·  ").toUpperCase();

  const headlineSize = headlineSizeFor(name, variant.width);
  const accentRgb = hexToRgb(accent);
  const accentSoft = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.55)`;
  const accentEdge = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.18)`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: variant.padding,
          color: "#FFFFFF",
          fontFamily: "Helvetica, Arial, sans-serif",
          background: `radial-gradient(120% 90% at 0% 0%, ${accentSoft} 0%, ${accentEdge} 35%, rgba(8,8,12,1) 70%, rgba(8,8,12,1) 100%)`,
        }}
      >
        {/* Top: tiny accent eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontFamily: "ui-monospace, Menlo, Monaco, monospace",
            fontSize: 22,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.78)",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: accent,
              boxShadow: `0 0 18px ${accent}`,
            }}
          />
          New event
        </div>

        {/* Headline + meta */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              fontWeight: 700,
              fontSize: headlineSize,
              lineHeight: 1.02,
              letterSpacing: -2,
              color: "#FFFFFF",
              textShadow: "0 8px 30px rgba(0,0,0,0.45)",
            }}
          >
            {name}
          </div>
          {metaLine && (
            <div
              style={{
                display: "flex",
                fontFamily: "ui-monospace, Menlo, Monaco, monospace",
                fontSize: 26,
                letterSpacing: 2,
                color: "rgba(255,255,255,0.78)",
              }}
            >
              {metaLine}
            </div>
          )}
        </div>

        {/* Bottom: ENTRY wordmark */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            fontFamily: "Helvetica, Arial, sans-serif",
            fontWeight: 700,
            fontSize: 28,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.6)",
          }}
        >
          Entry
        </div>
      </div>
    ),
    {
      width: variant.width,
      height: variant.height,
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}

function pickVariant(v: string | null): { width: number; height: number; padding: number } {
  switch (v) {
    case "portrait":
      return { width: 1080, height: 1350, padding: 80 };
    case "landscape":
      return { width: 1200, height: 630, padding: 64 };
    case "square":
    default:
      return { width: 1080, height: 1080, padding: 80 };
  }
}

/**
 * Pick a headline size that doesn't clip on narrow widths or feel timid on
 * short names. The overhead vs. measuring real glyph widths in edge runtime
 * isn't worth it; this heuristic ships a balanced render across the typical
 * range.
 */
function headlineSizeFor(name: string, width: number): number {
  const len = name.length;
  // Width ~1080 fits ~13 chars at 130px without wrapping.
  const charWidthCap = (width - 160) / Math.max(8, len);
  const lineCountCap = len > 26 ? 0.18 : 0.28;
  const sized = Math.min(charWidthCap * 1.35, width * lineCountCap);
  return Math.max(64, Math.min(160, Math.round(sized)));
}

function formatDateLine(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Format: "Sat 14 Jun · 21:00" — UTC to keep the OG render deterministic.
  // The buyer-facing event page does locale-aware formatting; this is just
  // the placeholder cover, not the source of truth.
  const day = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const dm = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const hm = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${day} ${dm} · ${hm}`;
}

function normaliseHex(input: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(trimmed)) return null;
  if (trimmed.length === 3) {
    return (
      "#" +
      trimmed
        .split("")
        .map((c) => c + c)
        .join("")
        .toUpperCase()
    );
  }
  return `#${trimmed.toUpperCase()}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace(/^#/, "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
