import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/constants";
import { createRateLimiter } from "@/lib/rate-limit";
import { slugify, validateSlug, provisionOrg } from "@/lib/signup";

const limiter = createRateLimiter("signup", { limit: 5, windowSeconds: 3600 });

/**
 * Get a Supabase admin client for public signup routes.
 */
function getSignupClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey && SUPABASE_URL) {
    return createClient(SUPABASE_URL, serviceRoleKey);
  }
  return null;
}

/**
 * POST /api/auth/signup — Self-service signup (email + password).
 *
 * When org_name is provided: creates auth user + provisions org (backward compat).
 * When org_name is omitted: creates auth user only, returns session for onboarding flow.
 */
export async function POST(request: NextRequest) {
  const blocked = limiter(request);
  if (blocked) return blocked;

  try {
    const body = await request.json();
    const { email, password, org_name, first_name, last_name } = body;

    // Validate inputs
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    if (!password || typeof password !== "string" || password.length < 8 || password.length > 72) {
      return NextResponse.json({ error: "Password must be 8-72 characters" }, { status: 400 });
    }

    const supabase = getSignupClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // If org_name is provided, validate and provision (backward compat)
    const hasOrgName = org_name && typeof org_name === "string" && org_name.trim().length >= 2;

    let slug: string | null = null;

    if (hasOrgName) {
      if (org_name.trim().length > 50) {
        return NextResponse.json({ error: "Organization name must be 2-50 characters" }, { status: 400 });
      }

      slug = slugify(org_name.trim());
      if (slug.length < 3) {
        return NextResponse.json({ error: "Organization name must produce a valid URL slug (at least 3 characters)" }, { status: 400 });
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
          return NextResponse.json({ error: "Could not find an available slug for this organization name. Please try a different name." }, { status: 409 });
        }
      }
    }

    // Check email not already registered
    const finalEmail = email.trim().toLowerCase();
    const { data: userList } = await supabase.auth.admin.listUsers();
    const existingUser = userList?.users?.find(
      (u) => u.email?.toLowerCase() === finalEmail
    );
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please sign in instead." },
        { status: 409 }
      );
    }

    // Create auth user (auto-confirmed)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: finalEmail,
      password,
      email_confirm: true,
      app_metadata: { is_admin: true },
    });

    if (authError || !authData.user) {
      console.error("[signup] Failed to create auth user:", authError);
      return NextResponse.json(
        { error: authError?.message || "Failed to create account" },
        { status: 400 }
      );
    }

    const authUserId = authData.user.id;

    // Provision org only if org_name was provided
    if (hasOrgName && slug) {
      try {
        await provisionOrg({
          authUserId,
          email: finalEmail,
          orgSlug: slug,
          orgName: org_name.trim(),
          firstName: first_name?.trim() || undefined,
          lastName: last_name?.trim() || undefined,
        });
      } catch (provisionError) {
        console.error("[signup] Provisioning failed, cleaning up auth user:", provisionError);
        await supabase.auth.admin.deleteUser(authUserId);
        return NextResponse.json(
          { error: "Failed to create organization. Please try again." },
          { status: 500 }
        );
      }
    }

    // Sign in to get session tokens
    let session: { access_token: string; refresh_token: string } | null = null;
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: signInData } = await anonClient.auth.signInWithPassword({
        email: finalEmail,
        password,
      });
      if (signInData?.session) {
        session = {
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
        };
      }
    }

    return NextResponse.json({
      data: {
        org_id: slug || null,
        org_name: hasOrgName ? org_name.trim() : null,
        subdomain: slug ? `${slug}.entry.events` : null,
        session,
      },
    });
  } catch (err) {
    console.error("[signup] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
