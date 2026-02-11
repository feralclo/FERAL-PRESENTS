import { NextResponse } from "next/server";

/**
 * GET /api/stripe/apple-pay-verify
 *
 * Serves the Apple Pay domain verification file.
 * Rewrites from /.well-known/apple-developer-merchantid-domain-association
 * point here (see next.config.ts).
 *
 * Apple checks this file to verify domain ownership before enabling Apple Pay.
 * The file is the same for all Stripe accounts — it's Stripe's merchant ID
 * certificate, not account-specific.
 */

const STRIPE_APPLE_PAY_URL =
  "https://stripe.com/files/apple-pay/apple-developer-merchantid-domain-association";

// Cache the file content in memory after first fetch
let cachedContent: string | null = null;

export async function GET() {
  try {
    // Return cached content if available
    if (cachedContent) {
      return new NextResponse(cachedContent, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      });
    }

    // Fetch from Stripe's CDN (server-side, no CORS issues)
    const res = await fetch(STRIPE_APPLE_PAY_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FeralPresents/1.0)",
      },
    });

    if (!res.ok) {
      console.error(
        `Failed to fetch Apple Pay verification file: ${res.status}`
      );
      return new NextResponse("Verification file unavailable", {
        status: 502,
      });
    }

    const text = await res.text();
    cachedContent = text;

    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (err) {
    console.error("Apple Pay verification file error:", err);
    return new NextResponse("Internal error", { status: 500 });
  }
}
