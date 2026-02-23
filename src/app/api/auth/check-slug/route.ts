import { NextRequest, NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/rate-limit";
import { slugify, validateSlug } from "@/lib/signup";

const limiter = createRateLimiter("check-slug", { limit: 20, windowSeconds: 60 });

/**
 * GET /api/auth/check-slug?slug=my-brand — Check slug availability.
 *
 * Lightweight public endpoint for real-time slug availability as user types.
 */
export async function GET(request: NextRequest) {
  const blocked = limiter(request);
  if (blocked) return blocked;

  try {
    const rawSlug = request.nextUrl.searchParams.get("slug") || "";
    const slug = slugify(rawSlug);

    if (slug.length < 3) {
      return NextResponse.json({ available: false, slug });
    }

    const result = await validateSlug(slug);
    return NextResponse.json({ ...result, slug });
  } catch (err) {
    console.error("[check-slug] Error:", err);
    return NextResponse.json({ available: false }, { status: 500 });
  }
}
