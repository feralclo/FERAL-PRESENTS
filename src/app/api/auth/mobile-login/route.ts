import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";
import { getRepSettings, getPlatformXPConfig } from "@/lib/rep-points";
import { generateLevelTable, DEFAULT_LEVELING, DEFAULT_TIERS } from "@/lib/xp-levels";
import type { LevelingConfig, TierDefinition } from "@/lib/xp-levels";
import { createRateLimiter } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

// 5 login attempts per 15 minutes per IP — matches /api/auth/login brute-force protection
const loginLimiter = createRateLimiter("auth-mobile-login", {
  limit: 5,
  windowSeconds: 15 * 60,
});

/**
 * POST /api/auth/mobile-login
 *
 * Password login for native clients (iOS) that can't use cookie-based
 * Supabase sessions. Returns the JWT access/refresh tokens so the client
 * can store them in Keychain and send `Authorization: Bearer <token>` on
 * subsequent requests.
 *
 * Body: { email, password } — org_id is resolved from the request host.
 *
 * Response (200):
 *   {
 *     access_token, refresh_token, expires_at,
 *     rep:      (same shape as GET /api/rep-portal/me → full rep row),
 *     org_id:   string,
 *     settings: (same shape as GET /api/rep-portal/settings → data field)
 *   }
 */
export async function POST(request: NextRequest) {
  try {
    const blocked = loginLimiter(request);
    if (blocked) return blocked;

    const orgId = getOrgIdFromRequest(request);
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // 1. Authenticate with Supabase Auth (email + password)
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });

    if (authError || !authData?.user || !authData?.session) {
      return NextResponse.json(
        { error: "invalid credentials" },
        { status: 401 }
      );
    }

    const adminDb = await getSupabaseAdmin();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // 2. Verify the auth user has an active rep row for this tenant.
    // Matches the me/login routes: try auth_user_id first, then fall back
    // to a one-time email link if auth_user_id wasn't persisted.
    let { data: rep } = await adminDb
      .from(TABLES.REPS)
      .select("*")
      .eq("auth_user_id", authData.user.id)
      .eq("org_id", orgId)
      .single();

    if (!rep) {
      const userEmail = authData.user.email?.toLowerCase();
      if (userEmail) {
        const { data: repByEmail } = await adminDb
          .from(TABLES.REPS)
          .select("*")
          .eq("email", userEmail)
          .eq("org_id", orgId)
          .is("auth_user_id", null)
          .single();

        if (repByEmail) {
          console.warn("[auth/mobile-login] Auto-linking rep by email:", {
            repId: repByEmail.id,
            authUserId: authData.user.id,
            email: userEmail,
          });
          await adminDb
            .from(TABLES.REPS)
            .update({
              auth_user_id: authData.user.id,
              updated_at: new Date().toISOString(),
            })
            .eq("id", repByEmail.id)
            .eq("org_id", orgId);
          repByEmail.auth_user_id = authData.user.id;
          rep = repByEmail;
        }
      }
    }

    if (!rep || rep.status !== "active") {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "not a rep for this tenant" },
        { status: 403 }
      );
    }

    // 3. Fetch tenant rep-portal settings — same payload as GET /api/rep-portal/settings.
    const [settings, platformConfig, domainResult] = await Promise.all([
      getRepSettings(orgId),
      getPlatformXPConfig(),
      adminDb
        .from(TABLES.DOMAINS)
        .select("hostname")
        .eq("org_id", orgId)
        .eq("is_primary", true)
        .eq("status", "active")
        .single(),
    ]);

    const leveling: LevelingConfig = platformConfig.leveling || DEFAULT_LEVELING;
    const tiers: TierDefinition[] =
      (platformConfig.tiers || DEFAULT_TIERS) as TierDefinition[];

    const fullTable = generateLevelTable(leveling, tiers);
    const levelTable = fullTable.slice(0, 20).map((row) => ({
      level: row.level,
      totalXp: row.totalXp,
      xpToNext: row.xpToNext,
      tier: row.tierName,
      color: row.tierColor,
    }));

    const settingsPayload = {
      currency_name: settings.currency_name,
      currency_per_sale: settings.currency_per_sale,
      points_per_sale: platformConfig.xp_per_sale,
      xp_per_quest_type: platformConfig.xp_per_quest_type,
      tiers,
      level_table: levelTable,
      max_level: leveling.max_level,
      public_url: domainResult.data?.hostname
        ? `https://${domainResult.data.hostname}`
        : null,
      // Backward compat (matches /api/rep-portal/settings)
      level_names: platformConfig.level_names,
      level_thresholds: platformConfig.level_thresholds,
    };

    return NextResponse.json({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_at: authData.session.expires_at,
      rep,
      org_id: orgId,
      settings: settingsPayload,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[auth/mobile-login] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
