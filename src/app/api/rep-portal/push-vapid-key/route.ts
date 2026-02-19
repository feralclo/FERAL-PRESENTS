import { NextResponse } from "next/server";
import { getVapidPublicKey, isPushConfigured } from "@/lib/web-push";

export async function GET() {
  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "Push notifications not configured" },
      { status: 503 }
    );
  }

  return NextResponse.json({ publicKey: getVapidPublicKey() });
}
