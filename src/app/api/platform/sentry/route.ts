import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET — Fetch unresolved Sentry issues.
 * Query: ?period=1h|6h|24h|7d (default 24h), ?limit=25
 *
 * Used by AI sessions to read platform errors without needing the dashboard UI.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const authToken = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;

  if (!authToken || !org || !project) {
    return NextResponse.json({ error: "Sentry not configured" }, { status: 503 });
  }

  const periodMap: Record<string, number> = {
    "1h": 1, "6h": 6, "24h": 24, "7d": 168,
  };
  const period = request.nextUrl.searchParams.get("period") || "24h";
  const hours = periodMap[period] || 24;
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "25", 10), 100);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  try {
    const res = await fetch(
      `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=is:unresolved firstSeen:>${since}&sort=freq&limit=${limit}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Sentry API returned ${res.status}` },
        { status: 502 }
      );
    }

    const issues = await res.json();

    // Return a simplified, readable format
    const formatted = issues.map((issue: {
      id: string;
      shortId: string;
      title: string;
      culprit: string;
      count: string;
      userCount: number;
      level: string;
      firstSeen: string;
      lastSeen: string;
      metadata: { type?: string; value?: string; filename?: string; function?: string };
      permalink: string;
    }) => ({
      id: issue.id,
      short_id: issue.shortId,
      title: issue.title,
      culprit: issue.culprit,
      count: parseInt(issue.count, 10) || 0,
      users_affected: issue.userCount || 0,
      level: issue.level,
      first_seen: issue.firstSeen,
      last_seen: issue.lastSeen,
      error_type: issue.metadata?.type || null,
      error_value: issue.metadata?.value || null,
      file: issue.metadata?.filename || null,
      function: issue.metadata?.function || null,
      sentry_url: issue.permalink,
    }));

    return NextResponse.json({
      total: formatted.length,
      period,
      issues: formatted,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sentry fetch failed" },
      { status: 502 }
    );
  }
}

/**
 * POST — Resolve or update Sentry issues.
 * Body: { issue_id: string, action: "resolve" | "ignore", comment?: string }
 *
 * Used by AI sessions to mark issues as resolved after investigation/fix.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const authToken = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;

  if (!authToken || !org) {
    return NextResponse.json({ error: "Sentry not configured" }, { status: 503 });
  }

  let body: { issue_id?: string; action?: string; comment?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { issue_id, action, comment } = body;

  if (!issue_id) {
    return NextResponse.json({ error: "issue_id is required" }, { status: 400 });
  }

  if (action !== "resolve" && action !== "ignore") {
    return NextResponse.json(
      { error: 'action must be "resolve" or "ignore"' },
      { status: 400 }
    );
  }

  try {
    // Update issue status
    const statusMap = { resolve: "resolved", ignore: "ignored" };
    const updateRes = await fetch(
      `https://sentry.io/api/0/issues/${issue_id}/`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: statusMap[action] }),
      }
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      return NextResponse.json(
        { error: `Sentry API returned ${updateRes.status}: ${errText.slice(0, 200)}` },
        { status: 502 }
      );
    }

    // Add a comment if provided (useful for AI to leave audit trail)
    if (comment) {
      await fetch(
        `https://sentry.io/api/0/issues/${issue_id}/comments/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: comment }),
        }
      ).catch(() => {
        // Non-fatal — comment is nice-to-have
      });
    }

    return NextResponse.json({
      ok: true,
      issue_id,
      action,
      comment: comment || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update issue" },
      { status: 502 }
    );
  }
}
