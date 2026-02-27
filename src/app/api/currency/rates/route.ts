import { NextResponse } from "next/server";
import { getExchangeRates } from "@/lib/currency/exchange-rates";

export const dynamic = "force-dynamic";

/**
 * GET /api/currency/rates
 *
 * Returns cached exchange rates for client-side currency conversion.
 * Public endpoint — no auth required.
 * Browser-cached for 1h to minimize requests.
 */
export async function GET() {
  try {
    const rates = await getExchangeRates();

    if (!rates) {
      return NextResponse.json(
        { error: "Exchange rates unavailable" },
        { status: 503 }
      );
    }

    return NextResponse.json(rates, {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
      },
    });
  } catch (err) {
    console.error("[currency/rates] Error:", err);
    return NextResponse.json(
      { error: "Failed to load exchange rates" },
      { status: 500 }
    );
  }
}
