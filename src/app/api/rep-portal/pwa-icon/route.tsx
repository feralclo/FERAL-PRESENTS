import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/rep-portal/pwa-icon?size=192|512 — PWA icon redirect
 *
 * Redirects to the static mascot icon files. Kept for backward compatibility
 * with cached manifests that reference this dynamic route.
 *
 * Public route (no auth) — referenced by the PWA manifest.
 */
export async function GET(request: NextRequest) {
  const sizeParam = request.nextUrl.searchParams.get("size");
  const file = sizeParam === "512" ? "/pwa-icon-512.png" : "/pwa-icon-192.png";
  return NextResponse.redirect(new URL(file, request.url), 301);
}
