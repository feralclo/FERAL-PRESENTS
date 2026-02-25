import { NextRequest, NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/rate-limit";

/**
 * Valid beta invite codes.
 *
 * Add or remove codes here. Share them with promoters you want
 * to let in immediately (they skip the application queue).
 *
 * Codes are case-insensitive.
 */
const VALID_CODES = new Set(
  [
    "ENTRY-FOUNDING",
    "ENTRY-VIP-2026",
    "PROMOTER-001",
  ].map((c) => c.toUpperCase())
);

const limiter = createRateLimiter("beta-verify-code", {
  limit: 10,
  windowSeconds: 300, // 10 attempts per 5 minutes
});

export async function POST(request: NextRequest) {
  const blocked = limiter(request);
  if (blocked) return blocked;

  try {
    const { code } = await request.json();

    if (!code || typeof code !== "string") {
      return NextResponse.json({ valid: false });
    }

    const normalised = code.trim().toUpperCase();
    const valid = VALID_CODES.has(normalised);

    // Small delay to prevent timing attacks / brute force
    await new Promise((r) => setTimeout(r, 300));

    return NextResponse.json({ valid });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
