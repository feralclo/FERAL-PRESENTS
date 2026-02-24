import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getLatestDigest, generatePaymentDigest } from "@/lib/payment-digest";

export const dynamic = "force-dynamic";

/**
 * GET /api/platform/payment-digest
 *
 * Returns the most recent AI payment digest.
 * Platform owner only.
 */
export async function GET() {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const digest = await getLatestDigest();

  if (!digest) {
    return NextResponse.json({ digest: null, message: "No digest generated yet" });
  }

  return NextResponse.json({ digest });
}

/**
 * POST /api/platform/payment-digest
 *
 * Generate a new digest on-demand.
 * Body: { period_hours?: number } (default 6)
 */
export async function POST(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  let periodHours = 6;
  try {
    const body = await request.json();
    if (body.period_hours && typeof body.period_hours === "number") {
      periodHours = Math.min(Math.max(body.period_hours, 1), 72);
    }
  } catch {
    // Use default
  }

  const digest = await generatePaymentDigest(periodHours);

  if (!digest) {
    return NextResponse.json(
      { error: "Failed to generate digest. Check ANTHROPIC_API_KEY configuration." },
      { status: 500 }
    );
  }

  return NextResponse.json({ digest });
}
