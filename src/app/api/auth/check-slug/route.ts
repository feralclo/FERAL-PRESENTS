import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY, TABLES } from "@/lib/constants";
import { createRateLimiter } from "@/lib/rate-limit";
import { slugify, validateSlug } from "@/lib/signup";
import * as Sentry from "@sentry/nextjs";

const limiter = createRateLimiter("check-slug", { limit: 20, windowSeconds: 60 });

/**
 * GET /api/auth/check-slug?slug=my-brand — Check slug availability.
 *
 * Lightweight endpoint for real-time slug availability as user types.
 *
 * Auth-aware: if the requester is logged in and the slug matches *their own*
 * existing org, returns `available: true` so the wizard's resume flow doesn't
 * flag the user's own brand as a collision when they go back to the Identity
 * section after provisioning has run.
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

    // If the slug is taken, check whether it's *this user's* own org —
    // they're allowed to "claim" it (because they already do).
    if (!result.available && SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        const cookieStore = await cookies();
        const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          cookies: {
            getAll: () => cookieStore.getAll(),
            setAll: () => {},
          },
        });
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (serviceKey) {
            const admin = createClient(SUPABASE_URL, serviceKey);
            const { data: ownOrg } = await admin
              .from(TABLES.ORG_USERS)
              .select("org_id")
              .eq("auth_user_id", user.id)
              .eq("status", "active")
              .limit(1)
              .maybeSingle();
            if (ownOrg?.org_id === slug) {
              return NextResponse.json({ available: true, slug, owned: true });
            }
          }
        }
      } catch {
        // Auth lookup failed — fall through to the original "taken" answer.
      }
    }

    return NextResponse.json({ ...result, slug });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[check-slug] Error:", err);
    return NextResponse.json({ available: false }, { status: 500 });
  }
}
