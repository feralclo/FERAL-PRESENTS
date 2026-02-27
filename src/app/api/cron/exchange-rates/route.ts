import { NextRequest, NextResponse } from "next/server";
import { refreshExchangeRates } from "@/lib/currency/exchange-rates";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/cron/exchange-rates
 *
 * Runs every 6 hours via Vercel cron.
 * Fetches fresh exchange rates and caches them in site_settings.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rates = await refreshExchangeRates();

    if (!rates) {
      return NextResponse.json(
        { error: "Failed to fetch exchange rates" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      currencies: Object.keys(rates.rates).length,
      fetched_at: rates.fetched_at,
    });
  } catch (err) {
    console.error("[cron/exchange-rates] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
