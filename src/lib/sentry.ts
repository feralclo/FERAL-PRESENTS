import * as Sentry from "@sentry/nextjs";

/**
 * Sentry utilities for the Entry platform.
 *
 * Provides helpers for enriching errors with multi-tenant context
 * so you can filter errors by org, event, user role in the Sentry dashboard.
 */

/**
 * Set the org context on Sentry scope.
 * Call this in API routes and server components after resolving org_id.
 */
export function setSentryOrgContext(orgId: string) {
  Sentry.setTag("org_id", orgId);
}

/**
 * Set user context on Sentry scope.
 * Call this after authentication to enrich error reports.
 */
export function setSentryUserContext(user: {
  id: string;
  email?: string;
  role?: string;
  orgId?: string;
}) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
  });
  if (user.role) {
    Sentry.setTag("user_role", user.role);
  }
  if (user.orgId) {
    Sentry.setTag("org_id", user.orgId);
  }
}

/**
 * Set event page context (for public event pages).
 * Enriches errors that happen during ticket browsing/purchase.
 */
export function setSentryEventContext(event: {
  id?: string;
  slug?: string;
  orgId?: string;
}) {
  Sentry.setContext("event", {
    event_id: event.id,
    event_slug: event.slug,
  });
  if (event.orgId) {
    Sentry.setTag("org_id", event.orgId);
  }
  if (event.slug) {
    Sentry.setTag("event_slug", event.slug);
  }
}

/**
 * Set checkout context for payment-related errors.
 * Critical for debugging payment failures.
 */
export function setSentryCheckoutContext(checkout: {
  eventSlug?: string;
  ticketCount?: number;
  total?: number;
  currency?: string;
  paymentIntentId?: string;
  stripeAccountId?: string;
}) {
  Sentry.setContext("checkout", checkout);
  if (checkout.paymentIntentId) {
    Sentry.setTag("stripe_pi", checkout.paymentIntentId);
  }
}

/**
 * Capture an error with payment context — used alongside the existing
 * payment monitoring system (logPaymentEvent).
 *
 * This sends to Sentry while the existing system logs to payment_events table.
 * Both are complementary: Sentry for stack traces + session replay,
 * payment_events for domain-specific analysis + AI digest.
 */
export function capturePaymentError(
  error: Error | string,
  context: {
    orgId?: string;
    eventId?: string;
    paymentIntentId?: string;
    customerEmail?: string;
    type?: string;
  }
) {
  Sentry.withScope((scope) => {
    scope.setLevel("error");
    scope.setTag("category", "payment");
    if (context.orgId) scope.setTag("org_id", context.orgId);
    if (context.eventId) scope.setTag("event_id", context.eventId);
    if (context.type) scope.setTag("payment_event_type", context.type);
    scope.setContext("payment", {
      payment_intent_id: context.paymentIntentId,
      customer_email: context.customerEmail,
    });

    if (typeof error === "string") {
      Sentry.captureMessage(error, "error");
    } else {
      Sentry.captureException(error);
    }
  });
}

/**
 * Fetch recent error data from Sentry API for the AI digest.
 *
 * Returns a summary of platform errors (not just payment-specific ones)
 * that the AI can use to give a more complete health picture.
 *
 * Requires SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT env vars.
 */
export async function fetchSentryErrorSummary(periodHours: number = 6): Promise<{
  total_errors: number;
  unresolved_issues: number;
  top_issues: Array<{
    title: string;
    count: number;
    level: string;
    first_seen: string;
    last_seen: string;
  }>;
  errors_by_tag: Record<string, number>;
} | null> {
  const authToken = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;

  if (!authToken || !org || !project) {
    return null;
  }

  try {
    const since = new Date(Date.now() - periodHours * 60 * 60 * 1000).toISOString();

    // Fetch top unresolved issues from the period
    const issuesRes = await fetch(
      `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=is:unresolved firstSeen:>${since}&sort=freq&limit=10`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        cache: "no-store",
      }
    );

    if (!issuesRes.ok) {
      console.error(`[sentry] Issues API ${issuesRes.status}`);
      return null;
    }

    const issues = await issuesRes.json();

    const topIssues = issues.map((issue: {
      title: string;
      count: string;
      level: string;
      firstSeen: string;
      lastSeen: string;
    }) => ({
      title: issue.title,
      count: parseInt(issue.count, 10) || 0,
      level: issue.level,
      first_seen: issue.firstSeen,
      last_seen: issue.lastSeen,
    }));

    const totalErrors = topIssues.reduce(
      (sum: number, i: { count: number }) => sum + i.count,
      0
    );

    // Count errors by level
    const errorsByLevel: Record<string, number> = {};
    for (const issue of topIssues) {
      const level = issue.level as string;
      errorsByLevel[level] = (errorsByLevel[level] || 0) + (issue.count as number);
    }

    return {
      total_errors: totalErrors,
      unresolved_issues: issues.length,
      top_issues: topIssues,
      errors_by_tag: errorsByLevel,
    };
  } catch (err) {
    console.error("[sentry] Failed to fetch error summary:", err);
    return null;
  }
}
