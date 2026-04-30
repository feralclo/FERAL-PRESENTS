/**
 * Plain-English readiness summariser for the event editor. Sister of
 * lib/event-summary.ts — same design idea applied to "how close is
 * this event to publishable?" rather than "how is this event doing?".
 *
 * Drives the EditorHero card that replaces the old ReadinessCard +
 * PublishCard pair. One sentence + one concrete next step the host can
 * click on, instead of a percentage and a wall of bullets.
 */

import type {
  ReadinessReport,
  ReadinessRule,
  ReadinessSeverity,
} from "@/lib/event-readiness";

export type EditorSummaryMood =
  | "live" // event is published and live
  | "ready" // every required rule passing, host can hit Publish
  | "in_progress" // some required rules still failing
  | "early"; // many required rules failing — early in setup

export interface EditorSummary {
  headline: string;
  subline: string;
  mood: EditorSummaryMood;
  /** Single highest-priority next step the host should fix, or null
   *  when there's nothing left to nudge. Required-fail rules always
   *  beat recommended-warn rules. */
  nextStep: {
    rule: ReadinessRule;
    /** What to put on the action button: "Add a cover image" etc. */
    actionLabel: string;
  } | null;
  /** Plural noun-form of how many required steps remain — drives copy. */
  blockerCount: number;
  /** Score [0, 100] — kept so the hero can render a small progress bar. */
  score: number;
}

const SEVERITY_RANK: Record<ReadinessSeverity, number> = {
  required: 0,
  recommended: 1,
  nice_to_have: 2,
};

/**
 * Map a readiness rule to a plain-English action verb. The default
 * (rule.label or rule.reason) is fine but a few rules read better as
 * imperative sentences on a button.
 */
function actionLabelForRule(rule: ReadinessRule): string {
  // Prefer the bespoke imperative when we have one for this rule id.
  switch (rule.id) {
    case "date_in_future":
      return "Set the event date";
    case "ticket_on_sale":
      return "Add a ticket";
    case "payment_ready":
      return "Connect payments";
    case "cover_image":
      return "Add a cover image";
    case "description":
      return "Write a description";
    case "lineup":
      return "Add the lineup";
    case "seo_title":
      return "Add a share title";
    case "doors_time":
      return "Set doors time";
    case "banner_image":
      return "Add a wide banner";
    default:
      return rule.label;
  }
}

/** First failing rule by severity, then by rule order. */
function firstFailing(rules: ReadinessRule[]): ReadinessRule | null {
  const sorted = [...rules]
    .filter((r) => r.status !== "ok")
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return sorted[0] ?? null;
}

export function summariseEditor(
  report: ReadinessReport,
  status: string
): EditorSummary {
  const blockers = report.blockers;
  const blockerCount = blockers.length;
  const next = firstFailing(report.rules);

  // ── Already live ────────────────────────────────────────────────
  if (status === "live") {
    return {
      headline: "You're live",
      subline:
        "Visible to buyers · Stripe checkout is open. Edits save instantly.",
      mood: "live",
      nextStep: null,
      blockerCount: 0,
      score: report.score,
    };
  }

  // ── Cancelled / archived ────────────────────────────────────────
  if (status === "cancelled") {
    return {
      headline: "Event cancelled",
      subline: "No new sales — the event page tells buyers it's off.",
      mood: "in_progress",
      nextStep: null,
      blockerCount: 0,
      score: report.score,
    };
  }
  if (status === "archived") {
    return {
      headline: "Archived",
      subline: "Hidden from the dashboard, kept for records.",
      mood: "in_progress",
      nextStep: null,
      blockerCount: 0,
      score: report.score,
    };
  }

  // ── Ready to publish ────────────────────────────────────────────
  if (report.canPublish) {
    // Recommended warnings present? Mention them softly but don't
    // block. The host should feel confident hitting Publish.
    const recommendedFails = report.rules.filter(
      (r) => r.severity !== "required" && r.status !== "ok"
    );
    if (recommendedFails.length > 0) {
      return {
        headline: "Ready to publish",
        subline: `Looking great — ${recommendedFails.length} optional ${recommendedFails.length === 1 ? "tweak" : "tweaks"} you could still make.`,
        mood: "ready",
        nextStep: next
          ? { rule: next, actionLabel: actionLabelForRule(next) }
          : null,
        blockerCount: 0,
        score: report.score,
      };
    }
    return {
      headline: "Ready to publish",
      subline:
        "Going live makes this event visible to buyers and turns on Stripe checkout.",
      mood: "ready",
      nextStep: null,
      blockerCount: 0,
      score: report.score,
    };
  }

  // ── Mid-progress: 1-2 required steps left ───────────────────────
  if (blockerCount <= 2) {
    const headline =
      blockerCount === 1
        ? "1 step from going live"
        : `${blockerCount} steps from going live`;
    return {
      headline,
      subline: next
        ? `Next: ${actionLabelForRule(next).toLowerCase()}.`
        : "Almost there.",
      mood: "in_progress",
      nextStep: next
        ? { rule: next, actionLabel: actionLabelForRule(next) }
        : null,
      blockerCount,
      score: report.score,
    };
  }

  // ── Early stage: lots of required gaps ─────────────────────────
  return {
    headline: "Let's get this set up",
    subline: next
      ? `Start here: ${actionLabelForRule(next).toLowerCase()}.`
      : `${blockerCount} required steps left to publish.`,
    mood: "early",
    nextStep: next
      ? { rule: next, actionLabel: actionLabelForRule(next) }
      : null,
    blockerCount,
    score: report.score,
  };
}
