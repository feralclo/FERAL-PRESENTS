import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getPointsHistory, awardPoints } from "@/lib/rep-points";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/reps/[id]/points — Get points history for a rep
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { id } = await params;
    const { searchParams } = request.nextUrl;
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50", 10)), 200);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const offset = (page - 1) * limit;

    const data = await getPointsHistory(id, orgId, limit, offset);

    return NextResponse.json({ data });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/reps/[id]/points — Manual award/revoke currency (FRL)
 *
 * Tenants award currency (spendable in the reward shop), not XP.
 * XP is earned organically through sales, quests, etc.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { id } = await params;
    const body = await request.json();
    const { points, description } = body;

    if (typeof points !== "number" || points === 0) {
      return NextResponse.json(
        { error: "points must be a non-zero number" },
        { status: 400 }
      );
    }

    if (!description || typeof description !== "string") {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 }
      );
    }

    // Award currency (FRL), not XP — tenants can't grant XP directly
    const result = await awardPoints({
      repId: id,
      orgId,
      points: 0,
      currency: points,
      sourceType: "manual",
      description: description.trim(),
      createdBy: auth.user!.id,
    });

    if (result === null) {
      return NextResponse.json(
        { error: "Failed to award currency — rep may not exist" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: {
        currency_awarded: points,
        new_currency_balance: result.newCurrencyBalance,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
