/**
 * Pure readiness scoring for an event in the canvas editor.
 *
 * The canvas surfaces a sticky "Readiness" rail that climbs from 0% to 100%
 * as the host fills the event in. Required rules gate the Publish action;
 * recommended/nice-to-have rules nudge but never block.
 *
 * Pure function on purpose — runs every keystroke, deterministic, easy to
 * unit-test, mirrors the server-side gates in PUT /api/events/[id]
 * (live_gate_past_date / no_tickets / no_stripe / stripe_unverified).
 */
import type { Event, TicketTypeRow } from "@/types/events";
import type { EventArtist } from "@/types/artists";

export type ReadinessSeverity = "required" | "recommended" | "nice_to_have";

export type ReadinessStatus = "ok" | "warn" | "fail";

export interface ReadinessRule {
  id:
    | "date_in_future"
    | "ticket_on_sale"
    | "payment_ready"
    | "cover_image"
    | "description"
    | "lineup"
    | "seo_title"
    | "doors_time"
    | "banner_image";
  label: string;
  severity: ReadinessSeverity;
  weight: number;
  status: ReadinessStatus;
  /** Human reason shown when status is fail/warn. */
  reason?: string;
  /** Section anchor for click-to-scroll-sync (matches CanvasSection ids). */
  anchor: "identity" | "story" | "look" | "tickets" | "money" | "publish";
}

export interface ReadinessReport {
  /** 0-100 score. Sum of weights of "ok" rules. */
  score: number;
  /** Whether the event passes every required rule — gates Publish. */
  canPublish: boolean;
  /** All rules ordered required → recommended → nice. */
  rules: ReadinessRule[];
  /** Required rules that are failing — used for inline Publish gating copy. */
  blockers: ReadinessRule[];
}

export interface OrgReadinessState {
  /** Whether this org's Stripe Connect account has charges_enabled. */
  stripeConnected: boolean | null;
  /** Whether the current user is the platform owner (bypasses Stripe gate). */
  isPlatformOwner?: boolean;
}

/** Default org state — missing values mean the gate triggers. */
const DEFAULT_ORG: OrgReadinessState = { stripeConnected: null };

/**
 * Lineup is "expected" for show-style events (concerts/clubs/festivals).
 * We don't have an event_type column, so we infer from venue context:
 * if there's a venue or the description mentions performers, treat lineup
 * as recommended. For private events / conferences without a venue,
 * lineup is nice-to-have. The scoring weight stays the same — only the
 * label copy differs to read more naturally.
 */
function lineupExpected(event: Event): boolean {
  // Heuristic: if a venue is set, the host is running a public show — a
  // lineup helps conversion. Conferences and private events typically
  // don't need one.
  return !!event.venue_name;
}

export function assessEvent(
  event: Event,
  ticketTypes: TicketTypeRow[],
  eventArtists: EventArtist[] = [],
  orgState: OrgReadinessState = DEFAULT_ORG
): ReadinessReport {
  const rules: ReadinessRule[] = [];

  /* ─── Required (must pass to publish) ──────────────────────────── */

  // 1. date_start in future — mirrors server gate `live_gate_past_date`.
  const dateStart = event.date_start ? new Date(event.date_start) : null;
  const dateValid =
    dateStart instanceof Date && !isNaN(dateStart.getTime()) && dateStart.getTime() > Date.now();
  rules.push({
    id: "date_in_future",
    label: "Date and time set in the future",
    severity: "required",
    weight: 20,
    status: dateValid ? "ok" : "fail",
    reason: dateValid
      ? undefined
      : !event.date_start
        ? "Add an event date"
        : "Event date is in the past — set a future date",
    anchor: "identity",
  });

  // 2. At least one sellable ticket — mirrors server gate `no_tickets`.
  // "Sellable" = active + (capacity > 0 OR capacity null/unlimited) AND not a system ticket.
  const sellable = ticketTypes.some((tt) => {
    const isActive = (tt.status ?? "active") === "active";
    const hasCapacity = tt.capacity == null || tt.capacity > 0;
    const isSystemTicket = tt.status === "hidden" && Number(tt.price) === 0 && !tt.capacity;
    return isActive && hasCapacity && !isSystemTicket;
  });
  rules.push({
    id: "ticket_on_sale",
    label: "At least one ticket on sale",
    severity: "required",
    weight: 20,
    status: sellable ? "ok" : "fail",
    reason: sellable ? undefined : "Add an active ticket with capacity",
    anchor: "tickets",
  });

  // 3. Payment ready — Stripe verified for stripe events; trivially true for
  // external/test payment methods. Platform owner bypasses (parity with the
  // server-side bypass in PUT /api/events/[id]).
  const stripeRequired = event.payment_method === "stripe";
  const paymentReady =
    !stripeRequired ||
    orgState.isPlatformOwner === true ||
    orgState.stripeConnected === true;
  rules.push({
    id: "payment_ready",
    label: stripeRequired ? "Payments connected" : "Payment method set",
    severity: "required",
    weight: 20,
    status: paymentReady ? "ok" : orgState.stripeConnected === null ? "warn" : "fail",
    reason: paymentReady
      ? undefined
      : orgState.stripeConnected === null
        ? "Checking your Stripe connection…"
        : "Connect Stripe before going live",
    anchor: "money",
  });

  /* ─── Required-ish: cover image ────────────────────────────────── */

  // Cover image — required because every event card on the platform needs
  // one. Phase 2.4 auto-generates a cover so a fresh event always passes
  // this rule; the host can replace the generated cover with a real one.
  const hasCover = !!(event.cover_image_url || event.cover_image);
  rules.push({
    id: "cover_image",
    label: "Cover image",
    severity: "required",
    weight: 10,
    status: hasCover ? "ok" : "fail",
    reason: hasCover ? undefined : "Upload artwork — buyers see this everywhere",
    anchor: "look",
  });

  /* ─── Recommended (boost score, don't block) ───────────────────── */

  // Description — buyers convert lower without one. 80 chars is roughly
  // "one full sentence", below which it reads as a placeholder.
  const aboutText = (event.about_text || event.description || "").trim();
  const descLen = aboutText.length;
  rules.push({
    id: "description",
    label: "Description",
    severity: "recommended",
    weight: 10,
    status: descLen >= 80 ? "ok" : descLen > 0 ? "warn" : "fail",
    reason:
      descLen >= 80
        ? undefined
        : descLen > 0
          ? `${descLen} chars — aim for 80+ for higher conversion`
          : "Tell buyers what makes this event worth coming to",
    anchor: "story",
  });

  // Lineup — recommended when there's a venue (gig-shaped events benefit
  // from named acts), nice-to-have otherwise.
  const lineupCount = (eventArtists?.length || 0) + (event.lineup?.length || 0);
  const lineupSeverity: ReadinessSeverity = lineupExpected(event)
    ? "recommended"
    : "nice_to_have";
  rules.push({
    id: "lineup",
    label: "Lineup added",
    severity: lineupSeverity,
    weight: 5,
    status: lineupCount > 0 ? "ok" : "warn",
    reason: lineupCount > 0 ? undefined : "Add at least one act or speaker",
    anchor: "story",
  });

  // SEO title — a one-line custom share title. Falls back to event name on
  // /event/[slug] if absent, but a hand-tuned title outperforms the auto.
  const hasSeoTitle = !!(event.seo_title && event.seo_title.trim().length > 0);
  rules.push({
    id: "seo_title",
    label: "Share title",
    severity: "recommended",
    weight: 5,
    status: hasSeoTitle ? "ok" : "warn",
    reason: hasSeoTitle ? undefined : "Set a share title for social previews",
    anchor: "publish",
  });

  // Doors time — show-shaped events should tell buyers when to arrive.
  const hasDoors = !!(event.doors_open || (event.doors_time && event.doors_time.trim().length > 0));
  rules.push({
    id: "doors_time",
    label: "Doors time",
    severity: "recommended",
    weight: 5,
    status: hasDoors ? "ok" : "warn",
    reason: hasDoors ? undefined : "Tell buyers when to arrive",
    anchor: "story",
  });

  /* ─── Nice-to-have ─────────────────────────────────────────────── */

  // Banner image — used as the wide hero on /event/[slug] and as card
  // headers in feed surfaces. Without it the cover composes alone.
  const hasBanner = !!(event.banner_image_url || event.hero_image);
  rules.push({
    id: "banner_image",
    label: "Wide banner image",
    severity: "nice_to_have",
    weight: 5,
    status: hasBanner ? "ok" : "warn",
    reason: hasBanner ? undefined : "Add a wide 16:9 banner for richer hero imagery",
    anchor: "look",
  });

  /* ─── Aggregate ────────────────────────────────────────────────── */

  // Score = sum of weights for "ok" rules. Weights sum to 100 by construction.
  const score = Math.round(
    rules.filter((r) => r.status === "ok").reduce((acc, r) => acc + r.weight, 0)
  );

  const blockers = rules.filter((r) => r.severity === "required" && r.status !== "ok");
  const canPublish = blockers.length === 0;

  // Order: required → recommended → nice. Stable within group.
  const orderRank: Record<ReadinessSeverity, number> = {
    required: 0,
    recommended: 1,
    nice_to_have: 2,
  };
  rules.sort((a, b) => orderRank[a.severity] - orderRank[b.severity]);

  return { score, canPublish, rules, blockers };
}
