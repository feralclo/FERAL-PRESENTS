import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/rep-portal/verify-email — Email verification callback (public)
 *
 * Not yet implemented. Returns 501 until email verification flow is wired up.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: "Email verification is not yet implemented" },
    { status: 501 }
  );
}
