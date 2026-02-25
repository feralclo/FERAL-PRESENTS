import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getLatestPlatformDigest, generatePlatformDigest } from "@/lib/platform-digest";

export const dynamic = "force-dynamic";

/**
 * GET — Fetch the latest stored platform health digest.
 */
export async function GET() {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const digest = await getLatestPlatformDigest();
  return NextResponse.json({ digest });
}

/**
 * POST — Generate a new platform health digest on-demand.
 * Body: { period_hours?: number } (default 6, max 72)
 */
export async function POST(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  let periodHours = 6;
  try {
    const body = await request.json();
    if (body.period_hours && typeof body.period_hours === "number") {
      periodHours = Math.max(1, Math.min(72, body.period_hours));
    }
  } catch {
    // Use default
  }

  const digest = await generatePlatformDigest(periodHours);
  if (!digest) {
    return NextResponse.json({ error: "Failed to generate digest" }, { status: 500 });
  }

  return NextResponse.json({ digest });
}
