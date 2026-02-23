import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getPointsHistory } from "@/lib/rep-points";

/**
 * GET /api/rep-portal/points — Points history for current rep (protected)
 *
 * Returns the rep's points ledger entries, ordered by most recent first.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;
    const orgId = auth.rep.org_id;

    const { searchParams } = request.nextUrl;
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50", 10)), 200);
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    const history = await getPointsHistory(auth.rep.id, orgId, limit, offset);

    return NextResponse.json({ data: history });
  } catch (err) {
    console.error("[rep-portal/points] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
