import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

/**
 * GET /api/rep-portal/pwa-icon?size=192|512 — Dynamic PWA icon
 *
 * Generates the Entry "E" icon matching the favicon design:
 * dark background with purple gradient inner square and centered "E".
 *
 * Public route (no auth) — referenced by the PWA manifest.
 */
export async function GET(request: NextRequest) {
  const sizeParam = request.nextUrl.searchParams.get("size");
  const size = sizeParam === "512" ? 512 : 192;

  // Scale all dimensions proportionally
  const scale = size / 192;
  const outerRadius = Math.round(42 * scale);
  const innerSize = Math.round(144 * scale);
  const innerRadius = Math.round(32 * scale);
  const fontSize = Math.round(96 * scale);

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a0a12 0%, #12101f 100%)",
          borderRadius: outerRadius,
        }}
      >
        <div
          style={{
            width: innerSize,
            height: innerSize,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #A78BFA 0%, #8B5CF6 50%, #7C3AED 100%)",
            borderRadius: innerRadius,
          }}
        >
          <span
            style={{
              fontSize,
              fontWeight: 800,
              color: "white",
              lineHeight: 1,
              letterSpacing: "-2px",
            }}
          >
            E
          </span>
        </div>
      </div>
    ),
    { width: size, height: size }
  );
}
