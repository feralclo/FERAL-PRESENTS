import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY, TABLES } from "@/lib/constants";
import {
  patchWizardSection,
  readWizardState,
} from "@/lib/onboarding-state";
import type { OnboardingWizardState, WizardSection } from "@/types/settings";
import * as Sentry from "@sentry/nextjs";

const VALID_SECTIONS: ReadonlySet<WizardSection> = new Set([
  "identity",
  "branding",
  "finish",
]);

const VALID_EXPERIENCE = new Set(["first-event", "experienced", "switching"]);

/**
 * Resolve the authenticated user + their org_id (if provisioned). Returns
 * null on auth failure (with a NextResponse to return).
 */
async function resolveAuth(): Promise<
  | { user: { id: string; email: string }; orgId: string | null; error: null }
  | { user: null; orgId: null; error: NextResponse }
> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      user: null,
      orgId: null,
      error: NextResponse.json({ error: "Service unavailable" }, { status: 503 }),
    };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // read-only
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      orgId: null,
      error: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return {
      user: null,
      orgId: null,
      error: NextResponse.json({ error: "Service unavailable" }, { status: 503 }),
    };
  }

  const adminClient = createClient(SUPABASE_URL, serviceRoleKey);
  const { data: orgUser } = await adminClient
    .from(TABLES.ORG_USERS)
    .select("org_id")
    .eq("auth_user_id", user.id)
    .in("status", ["active"])
    .limit(1)
    .single();

  return {
    user: { id: user.id, email: user.email ?? "" },
    orgId: orgUser?.org_id ?? null,
    error: null,
  };
}

/**
 * GET /api/onboarding/state — fetch the current wizard state for resuming.
 * Returns shape: { state: OnboardingWizardState, has_org: boolean, org_id?: string }.
 */
export async function GET() {
  try {
    const auth = await resolveAuth();
    if (auth.error) return auth.error;

    const state = await readWizardState({ authUserId: auth.user.id, orgId: auth.orgId });
    return NextResponse.json({
      state,
      has_org: !!auth.orgId,
      org_id: auth.orgId ?? undefined,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[onboarding/state] GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PATCH /api/onboarding/state — merge a section update into wizard state.
 *
 * Body: {
 *   section: WizardSection,
 *   data?: Record<string, unknown>,
 *   complete?: boolean,
 *   skip?: boolean,
 *   extras?: { event_types?, experience_level?, completed_at? }
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (auth.error) return auth.error;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { section, data, complete, skip, extras } = body as {
      section?: string;
      data?: Record<string, unknown>;
      complete?: boolean;
      skip?: boolean;
      extras?: Partial<Pick<OnboardingWizardState, "event_types" | "experience_level" | "completed_at">>;
    };

    if (!section || !VALID_SECTIONS.has(section as WizardSection)) {
      return NextResponse.json(
        { error: "Invalid section", valid: Array.from(VALID_SECTIONS) },
        { status: 400 }
      );
    }

    if (data !== undefined && (typeof data !== "object" || data === null || Array.isArray(data))) {
      return NextResponse.json({ error: "data must be an object" }, { status: 400 });
    }

    // Validate extras shape (defensive — only known fields)
    const safeExtras: typeof extras = {};
    if (extras?.event_types && Array.isArray(extras.event_types)) {
      safeExtras.event_types = extras.event_types
        .filter((e): e is string => typeof e === "string")
        .slice(0, 20);
    }
    if (extras?.experience_level !== undefined) {
      safeExtras.experience_level =
        extras.experience_level === null
          ? null
          : VALID_EXPERIENCE.has(extras.experience_level as string)
          ? (extras.experience_level as OnboardingWizardState["experience_level"])
          : undefined;
    }
    if (extras?.completed_at && typeof extras.completed_at === "string") {
      safeExtras.completed_at = extras.completed_at;
    }

    const next = await patchWizardSection({
      authUserId: auth.user.id,
      orgId: auth.orgId,
      section: section as WizardSection,
      data,
      complete: !!complete,
      skip: !!skip,
      extras: safeExtras,
    });

    return NextResponse.json({ state: next });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[onboarding/state] PATCH error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
