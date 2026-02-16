import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getOrderRepAttribution } from "@/lib/rep-attribution";

/**
 * GET /api/orders/[id]/rep-info — Get rep attribution info for an order (admin)
 *
 * Returns the rep name and points awarded if the order was attributed to a rep.
 * Used by the refund dialog to show a warning before refunding.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const attribution = await getOrderRepAttribution(id);

    return NextResponse.json({ data: attribution });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
