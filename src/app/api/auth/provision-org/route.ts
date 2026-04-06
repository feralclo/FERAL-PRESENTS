import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY, TABLES, onboardingKey, generalKey } from "@/lib/constants";
import { getDefaultCurrency } from "@/lib/country-currency-map";
import { createRateLimiter } from "@/lib/rate-limit";
import { slugify, validateSlug, provisionOrg } from "@/lib/signup";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

const limiter = createRateLimiter("provision-org", { limit: 5, windowSeconds: 3600 });

/** Map country code to a sensible default timezone */
function getTimezoneForCountry(country: string): string {
  const map: Record<string, string> = {
    GB: "Europe/London", IE: "Europe/Dublin",
    US: "America/New_York", CA: "America/Toronto",
    AU: "Australia/Sydney", NZ: "Pacific/Auckland",
    DE: "Europe/Berlin", FR: "Europe/Paris", ES: "Europe/Madrid",
    IT: "Europe/Rome", NL: "Europe/Amsterdam", BE: "Europe/Brussels",
    PT: "Europe/Lisbon", AT: "Europe/Vienna", CH: "Europe/Zurich",
    SE: "Europe/Stockholm", NO: "Europe/Oslo", DK: "Europe/Copenhagen",
    FI: "Europe/Helsinki", PL: "Europe/Warsaw", CZ: "Europe/Prague",
    GR: "Europe/Athens", TR: "Europe/Istanbul", RU: "Europe/Moscow",
    IN: "Asia/Kolkata", JP: "Asia/Tokyo", KR: "Asia/Seoul",
    CN: "Asia/Shanghai", SG: "Asia/Singapore", HK: "Asia/Hong_Kong",
    AE: "Asia/Dubai", SA: "Asia/Riyadh", IL: "Asia/Jerusalem",
    ZA: "Africa/Johannesburg", NG: "Africa/Lagos", KE: "Africa/Nairobi",
    BR: "America/Sao_Paulo", MX: "America/Mexico_City", AR: "America/Argentina/Buenos_Aires",
    CO: "America/Bogota", CL: "America/Santiago",
  };
  return map[country] || "Europe/London";
}

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

  // Parse body first (before any async ops that might interfere)
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { org_name, event_types, experience_level, country: rawCountry } = body;

  // Validate org_name upfront
  if (!org_name || typeof org_name !== "string" || (org_name as string).trim().length < 2 || (org_name as string).trim().length > 50) {
    return NextResponse.json({ error: "Brand name must be 2-50 characters" }, { status: 400 });
  }

  const trimmedName = (org_name as string).trim();

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json({ error: "Service role key not configured" }, { status: 503 });
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
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Not authenticated", detail: userError?.message || "No user session" },
        { status: 401 }
      );
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
    let slug = slugify(trimmedName);
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
    try {
      await provisionOrg({
        authUserId: user.id,
        email: user.email || "",
        orgSlug: slug,
        orgName: trimmedName,
        firstName: user.user_metadata?.full_name?.split(" ")[0] || undefined,
        lastName: user.user_metadata?.full_name?.split(" ").slice(1).join(" ") || undefined,
      });
    } catch (provisionErr) {
      console.error("[provision-org] provisionOrg() failed:", provisionErr);
      const msg = provisionErr instanceof Error ? provisionErr.message : "Unknown provisioning error";
      return NextResponse.json({ error: `Provisioning failed: ${msg}` }, { status: 500 });
    }

    // Save onboarding data + general settings to site_settings
    try {
      const supabaseAdmin = await getSupabaseAdmin();
      if (supabaseAdmin) {
        const countryCode = typeof rawCountry === "string" && rawCountry.trim().length === 2
          ? rawCountry.trim().toUpperCase()
          : "GB";
        const baseCurrency = getDefaultCurrency(countryCode);

        // Save general settings (country + base_currency)
        await supabaseAdmin.from(TABLES.SITE_SETTINGS).upsert(
          {
            key: generalKey(slug),
            data: {
              org_name: trimmedName,
              timezone: getTimezoneForCountry(countryCode),
              support_email: "",
              country: countryCode,
              base_currency: baseCurrency,
            },
            org_id: slug,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

        // Save onboarding data
        if (event_types || experience_level) {
          await supabaseAdmin.from(TABLES.SITE_SETTINGS).upsert(
            {
              key: onboardingKey(slug),
              data: {
                event_types: event_types || [],
                experience_level: experience_level || null,
                completed_at: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            },
            { onConflict: "key" }
          );
        }
      }
    } catch (settingsErr) {
      // Non-fatal — org was provisioned, just log
      console.error("[provision-org] Failed to save settings:", settingsErr);
    }

    return NextResponse.json({
      data: {
        org_id: slug,
        org_name: trimmedName,
        subdomain: `${slug}.entry.events`,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[provision-org] POST error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Internal error: ${msg}` }, { status: 500 });
  }
}
