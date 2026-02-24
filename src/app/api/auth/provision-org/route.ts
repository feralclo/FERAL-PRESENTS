import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY, TABLES, onboardingKey } from "@/lib/constants";
import { createRateLimiter } from "@/lib/rate-limit";
import { slugify, validateSlug, provisionOrg } from "@/lib/signup";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const limiter = createRateLimiter("provision-org", { limit: 5, windowSeconds: 3600 });

/**
 * POST /api/auth/provision-org — Provision an org for an authenticated user.
 *
 * Decoupled from signup: user must already have a session (email/password or Google OAuth).
 * Called from the onboarding wizard's final step.
 *
 * Body: { org_name: string, event_types?: string[], experience_level?: string }
 */
export async function POST(request: NextRequest) {
  const blocked = limiter(request);
  if (blocked) return blocked;

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Read session from cookies
    const cookieStore = await cookies();
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Read-only
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { org_name, event_types, experience_level } = body;

    // Validate org_name
    if (!org_name || typeof org_name !== "string" || org_name.trim().length < 2 || org_name.trim().length > 50) {
      return NextResponse.json({ error: "Brand name must be 2-50 characters" }, { status: 400 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const adminClient = createClient(SUPABASE_URL, serviceRoleKey);

    // Check user doesn't already have an org
    const { data: existingOrg } = await adminClient
      .from(TABLES.ORG_USERS)
      .select("org_id")
      .eq("auth_user_id", user.id)
      .in("status", ["active"])
      .limit(1)
      .single();

    if (existingOrg?.org_id) {
      return NextResponse.json(
        { error: "You already have an organization", org_id: existingOrg.org_id },
        { status: 409 }
      );
    }

    // Slugify and validate
    let slug = slugify(org_name.trim());
    if (slug.length < 3) {
      return NextResponse.json(
        { error: "Brand name must produce a valid URL slug (at least 3 characters)" },
        { status: 400 }
      );
    }

    // Check availability, auto-suffix on collision
    const validation = await validateSlug(slug);
    if (!validation.available) {
      let found = false;
      for (let i = 2; i <= 99; i++) {
        const candidate = `${slug}-${i}`;
        const check = await validateSlug(candidate);
        if (check.available) {
          slug = candidate;
          found = true;
          break;
        }
      }
      if (!found) {
        return NextResponse.json(
          { error: "Could not find an available slug. Please try a different name." },
          { status: 409 }
        );
      }
    }

    // Provision org
    await provisionOrg({
      authUserId: user.id,
      email: user.email!,
      orgSlug: slug,
      orgName: org_name.trim(),
      firstName: user.user_metadata?.full_name?.split(" ")[0] || undefined,
      lastName: user.user_metadata?.full_name?.split(" ").slice(1).join(" ") || undefined,
    });

    // Save onboarding data to site_settings
    if (event_types || experience_level) {
      const supabaseAdmin = await getSupabaseAdmin();
      if (supabaseAdmin) {
        await supabaseAdmin.from(TABLES.SITE_SETTINGS).upsert(
          {
            key: onboardingKey(slug),
            data: {
              event_types: event_types || [],
              experience_level: experience_level || null,
              completed_at: new Date().toISOString(),
            },
            org_id: slug,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
      }
    }

    return NextResponse.json({
      data: {
        org_id: slug,
        org_name: org_name.trim(),
        subdomain: `${slug}.entry.events`,
      },
    });
  } catch (err) {
    console.error("[provision-org] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
