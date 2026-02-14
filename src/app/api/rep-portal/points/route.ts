import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getPointsHistory } from "@/lib/rep-points";
import { ORG_ID } from "@/lib/constants";

/**
 * GET /api/rep-portal/points — Points history for current rep (protected)
 *
 * Returns the rep's points ledger entries, ordered by most recent first.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const { searchParams } = request.nextUrl;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const history = await getPointsHistory(auth.rep.id, ORG_ID, limit, offset);

    return NextResponse.json({ data: history });
  } catch (err) {
    console.error("[rep-portal/points] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
