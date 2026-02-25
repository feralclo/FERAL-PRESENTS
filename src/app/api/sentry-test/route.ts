import { NextResponse } from "next/server";

/**
 * TEMPORARY — delete after verifying Sentry works.
 * GET /api/sentry-test → throws an error that Sentry should capture.
 */
export async function GET() {
  throw new Error("Sentry integration test — if you see this in Sentry, it's working!");
  return NextResponse.json({ ok: true });
}
