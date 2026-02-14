import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/rep-portal/verify-email — Email verification callback (public)
 *
 * Placeholder for email verification flow. Accepts a token and returns success.
 * Full implementation will be added when email verification is wired up.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    // Placeholder: In production, this would verify the token against
    // Supabase Auth or a custom verification table.
    return NextResponse.json({
      data: { verified: true },
    });
  } catch (err) {
    console.error("[rep-portal/verify-email] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
