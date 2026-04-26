import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sendWelcomeEmail } from "@/lib/email-onboarding";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, onboardingKey, stripeAccountKey } from "@/lib/constants";
import type { OnboardingWizardState } from "@/types/settings";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

interface DomainRow {
  status: string;
  type: string;
}

/**
 * POST /api/onboarding/complete
 *
 * Wraps up the wizard: marks onboarding complete, computes outstanding setup
 * items (Stripe / domain), and fires the branded welcome email exactly once.
 * Idempotent — relying on `onboarding_email_sent` flag in state extras.
 */
export async function POST() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Read existing state — bail if we've already sent the email
    const { data: stateRow } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", onboardingKey(auth.orgId))
      .maybeSingle();

    const state = (stateRow?.data ?? {
      sections: {},
    }) as OnboardingWizardState & { onboarding_email_sent?: boolean };

    if (state.onboarding_email_sent) {
      return NextResponse.json({ already_sent: true });
    }

    // Resolve owner email + first name from org_users
    const { data: ownerRow } = await supabase
      .from(TABLES.ORG_USERS)
      .select("email, first_name")
      .eq("org_id", auth.orgId)
      .eq("auth_user_id", auth.user.id)
      .limit(1)
      .maybeSingle();

    const ownerEmail = (ownerRow?.email as string | undefined) || auth.user.email;
    if (!ownerEmail) {
      return NextResponse.json(
        { error: "No email on record for owner" },
        { status: 400 }
      );
    }

    // Outstanding items — derive from live system state
    const [{ data: stripeRow }, { data: domains }] = await Promise.all([
      supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", stripeAccountKey(auth.orgId))
        .maybeSingle(),
      supabase.from(TABLES.DOMAINS).select("type, status").eq("org_id", auth.orgId),
    ]);

    const stripeAccountId = (stripeRow?.data as { account_id?: string } | undefined)?.account_id;
    const stripeOutstanding = !stripeAccountId; // simplest signal — full health check requires a Stripe API call
    const domainOutstanding = Array.isArray(domains)
      ? (domains as DomainRow[]).some((d) => d.type === "custom" && d.status === "pending")
      : false;

    const result = await sendWelcomeEmail({
      orgId: auth.orgId,
      toEmail: ownerEmail,
      firstName: (ownerRow?.first_name as string | undefined) || undefined,
      outstanding: {
        stripe: stripeOutstanding,
        domain: domainOutstanding,
      },
    });

    // Mark complete + email sent — idempotent
    const next = {
      ...state,
      completed_at: state.completed_at ?? new Date().toISOString(),
      onboarding_email_sent: true,
    };
    await supabase.from(TABLES.SITE_SETTINGS).upsert(
      {
        key: onboardingKey(auth.orgId),
        data: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    return NextResponse.json({
      ok: true,
      email_sent: result.sent,
      reason: result.reason,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[onboarding/complete] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
