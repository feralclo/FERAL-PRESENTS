import { NextRequest, NextResponse } from "next/server";
import { TABLES } from "@/lib/constants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkDomainVerification } from "@/lib/vercel-domains";
import { sendDomainVerifiedEmail } from "@/lib/email-onboarding";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PER_RUN_CAP = 50;

interface PendingDomain {
  id: string;
  org_id: string;
  hostname: string;
}

interface OrgOwner {
  email: string;
  first_name: string | null;
}

/**
 * GET /api/cron/domain-verify-poll
 *
 * Polls Vercel for any custom domain in `pending` status and flips them to
 * `active` once DNS resolves. Sends a single notification email to the org
 * owner per domain on transition. Idempotent: a domain that's already active
 * won't be touched, and the email is only sent on the pending → active edge.
 *
 * Capped at 50 domains per run to keep cron under the 60s budget. Subsequent
 * runs pick up the rest.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { data: pending, error: listErr } = await supabase
      .from(TABLES.DOMAINS)
      .select("id, org_id, hostname")
      .eq("status", "pending")
      .eq("type", "custom")
      .order("created_at", { ascending: true })
      .limit(PER_RUN_CAP);

    if (listErr) {
      Sentry.captureException(listErr);
      return NextResponse.json({ error: listErr.message }, { status: 500 });
    }

    const rows = (pending ?? []) as PendingDomain[];
    const checked = rows.length;
    let flipped = 0;
    let stillPending = 0;
    let failed = 0;
    const emails: string[] = [];

    for (const row of rows) {
      try {
        const verification = await checkDomainVerification(row.hostname);
        // Vercel returns `verified: true` once DNS has fully resolved AND been issued
        // a TLS cert. `verification` array empty means there are no outstanding
        // challenges; both conditions imply it's safe to flip to active.
        const isActive =
          verification?.verified === true ||
          (Array.isArray(verification?.verification) && verification.verification.length === 0);

        if (!isActive) {
          stillPending += 1;
          continue;
        }

        // Flip status
        const { error: updateErr } = await supabase
          .from(TABLES.DOMAINS)
          .update({
            status: "active",
            updated_at: new Date().toISOString(),
            verification_reason: null,
          })
          .eq("id", row.id);

        if (updateErr) {
          failed += 1;
          Sentry.captureException(updateErr, { extra: { hostname: row.hostname } });
          continue;
        }

        flipped += 1;

        // Email the org owner — non-fatal if it fails
        try {
          const { data: owner } = await supabase
            .from(TABLES.ORG_USERS)
            .select("email, first_name")
            .eq("org_id", row.org_id)
            .eq("role", "owner")
            .eq("status", "active")
            .limit(1)
            .maybeSingle();

          const ownerRow = owner as OrgOwner | null;
          if (ownerRow?.email) {
            const result = await sendDomainVerifiedEmail({
              orgId: row.org_id,
              toEmail: ownerRow.email,
              hostname: row.hostname,
            });
            if (result.sent) emails.push(row.hostname);
            else
              console.warn(
                `[cron/domain-verify-poll] Email skipped for ${row.hostname}: ${result.reason}`
              );
          }
        } catch (mailErr) {
          console.error(
            `[cron/domain-verify-poll] Email error for ${row.hostname}:`,
            mailErr
          );
        }
      } catch (verifyErr) {
        // Vercel API failure for this hostname — log + continue. Most likely
        // transient; next run will retry. Don't mark `failed` because no DB write
        // attempted; this isn't a verification flip failure.
        console.warn(
          `[cron/domain-verify-poll] verify failed for ${row.hostname}:`,
          verifyErr instanceof Error ? verifyErr.message : verifyErr
        );
      }
    }

    return NextResponse.json({
      ok: true,
      checked,
      flipped,
      still_pending: stillPending,
      failed,
      emailed: emails.length,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[cron/domain-verify-poll] Fatal error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
