"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  AlertTriangle,
  ClipboardList,
  UserPlus,
  ShoppingBag,
  RefreshCw,
  Activity,
  Trophy,
  Swords,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PromoterIdentityBar,
  type PromoterSummary,
} from "./PromoterIdentityBar";
import { AttentionCard } from "./AttentionCard";
import { LiveQuestRow, LiveQuestRowSkeleton, type LiveQuestRowData } from "./LiveQuestRow";
import {
  LeaderboardRow,
  LeaderboardRowSkeleton,
  type LeaderboardEntry,
} from "./LeaderboardRow";
import {
  ActivityFeedItem,
  ActivityFeedItemSkeleton,
  type ActivityItem,
  type ActivityKind,
} from "./ActivityFeedItem";
import { WeekMetrics } from "./WeekMetrics";
import type {
  RepProgramStats,
  RepQuestSubmission,
  RepRewardClaim,
} from "@/types/reps";

// ---------------------------------------------------------------------------
// Section state: each fetch owns its own {data, loading, error}
// ---------------------------------------------------------------------------

interface SectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function initial<T>(): SectionState<T> {
  return { data: null, loading: true, error: null };
}

interface BalanceData {
  float: number;
  earned: number;
  committed: number;
  float_net_of_commitments: number;
  float_pence: number;
  fiat_rate_pence: number;
  low_float_warning: boolean;
}

function formatEp(n: number): string {
  return `${n.toLocaleString("en-GB")} EP`;
}

function formatPence(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function relativeAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.floor(Math.max(0, Date.now() - then) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---------------------------------------------------------------------------

async function fetchJson<T>(
  url: string,
  unwrap: "data" | "root" = "data"
): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let body: { error?: string } = {};
    try {
      body = await res.json();
    } catch {
      /* swallow */
    }
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  const payload = await res.json();
  return (unwrap === "data" ? payload.data : payload) as T;
}

// ---------------------------------------------------------------------------

function repName(r: { display_name?: string | null; first_name?: string | null; last_name?: string | null }): string {
  if (r.display_name) return r.display_name;
  const n = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
  return n || "A rep";
}

function submissionToActivity(s: RepQuestSubmission): ActivityItem {
  const kind: ActivityKind =
    s.status === "approved"
      ? "submission_approved"
      : s.status === "rejected"
      ? "submission_rejected"
      : s.status === "requires_revision"
      ? "submission_requires_revision"
      : "submission_pending";
  // XP is denormalised onto the submission row (points_awarded). EP is NOT —
  // it lives in ep_ledger keyed by quest_submission_id. Until we join the
  // ledger, use the quest's configured ep_reward as a stand-in when the
  // submission was approved (since the ledger write is transactional with
  // approval, quest.ep_reward === what the rep got).
  const xp = s.points_awarded || 0;
  const ep =
    kind === "submission_approved"
      ? s.quest?.ep_reward ?? s.quest?.currency_reward ?? 0
      : 0;
  const parts: string[] = [];
  if (xp > 0) parts.push(`+${xp} XP`);
  if (ep > 0) parts.push(`+${ep} EP`);
  return {
    id: `sub-${s.id}`,
    kind,
    when: s.created_at,
    actor: s.rep ? repName(s.rep) : "A rep",
    subject: s.quest?.title ?? null,
    rewardSuffix: parts.length ? parts.join(" · ") : null,
    href: "/admin/reps?tab=quests",
  };
}

function claimToActivity(c: RepRewardClaim): ActivityItem {
  // Claims status CHECK: claimed | fulfilling | fulfilled | cancelled | failed.
  // Map all five — not just fulfilled-vs-pending — so the Dashboard can show
  // a tenant when a claim is stuck in fulfilling or blew up in failed state.
  let kind: ActivityKind = "claim_pending";
  switch (c.status) {
    case "fulfilled":
      kind = "claim_fulfilled";
      break;
    case "fulfilling":
      kind = "claim_fulfilling";
      break;
    case "cancelled":
      kind = "claim_cancelled";
      break;
    case "failed":
      kind = "claim_failed";
      break;
    default:
      kind = "claim_pending";
  }
  return {
    id: `claim-${c.id}`,
    kind,
    when: c.created_at,
    actor: c.rep ? repName(c.rep) : "A rep",
    subject: c.reward?.name ?? null,
    rewardSuffix: null,
    href: `/admin/reps/${c.rep_id}`,
  };
}

interface PendingJoin {
  id: string; // rep.id
  source: "legacy" | "membership";
  membership_id?: string;
  rep: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    photo_url: string | null;
  };
  pitch: string | null;
  requested_at: string;
}

function joinRequestToActivity(j: PendingJoin): ActivityItem {
  return {
    id: `join-${j.id}`,
    kind: "join_request",
    when: j.requested_at,
    actor: repName(j.rep),
    subject: null,
    detail: j.pitch,
    rewardSuffix: null,
    href: "/admin/reps?tab=team",
  };
}

// ---------------------------------------------------------------------------

export function DashboardTab() {
  const [promoter, setPromoter] = useState<SectionState<PromoterSummary>>(initial());
  const [balance, setBalance] = useState<SectionState<BalanceData>>(initial());
  const [stats, setStats] = useState<SectionState<RepProgramStats>>(initial());
  const [submissions, setSubmissions] = useState<SectionState<RepQuestSubmission[]>>(initial());
  const [claims, setClaims] = useState<SectionState<RepRewardClaim[]>>(initial());
  const [joinRequests, setJoinRequests] = useState<SectionState<PendingJoin[]>>(initial());
  const [leaderboard, setLeaderboard] = useState<SectionState<LeaderboardEntry[]>>(initial());
  const [quests, setQuests] = useState<SectionState<LiveQuestRowData[]>>(initial());
  const [refreshing, setRefreshing] = useState(false);

  // All fetches are fired independently so a slow endpoint doesn't block the
  // rest. Each writes only its own section state via the `mark` helper.
  // Kicker state resets (setFoo to loading) ONLY happen on explicit refresh —
  // initial mount relies on useState's initial value (loading: true), so the
  // mount effect contains no synchronous setState calls.
  const fireFetches = useCallback(() => {
    const mark = <T,>(
      setter: (s: SectionState<T>) => void
    ): ((res: PromiseSettledResult<T>) => void) => (res) => {
      if (res.status === "fulfilled") {
        setter({ data: res.value, loading: false, error: null });
      } else {
        const err = res.reason instanceof Error ? res.reason.message : "Failed to load";
        setter({ data: null, loading: false, error: err });
      }
    };

    Promise.allSettled([
      fetchJson<PromoterSummary>("/api/admin/promoter"),
    ]).then(([r]) => mark<PromoterSummary>((s) => setPromoter(s))(r));

    Promise.allSettled([
      fetchJson<BalanceData>("/api/admin/ep/balance"),
    ]).then(([r]) => mark<BalanceData>((s) => setBalance(s))(r));

    Promise.allSettled([
      fetchJson<RepProgramStats>("/api/reps/stats"),
    ]).then(([r]) => mark<RepProgramStats>((s) => setStats(s))(r));

    Promise.allSettled([
      fetchJson<RepQuestSubmission[]>("/api/reps/submissions"),
    ]).then(([r]) => mark<RepQuestSubmission[]>((s) => setSubmissions(s))(r));

    Promise.allSettled([
      fetchJson<RepRewardClaim[]>("/api/reps/claims?status=claimed"),
    ]).then(([r]) => mark<RepRewardClaim[]>((s) => setClaims(s))(r));

    // Pending joins unified across legacy (reps.status='pending') and v2
    // (rep_promoter_memberships.status='pending' with pitch). See
    // src/app/api/admin/reps/pending-joins/route.ts.
    Promise.allSettled([
      fetchJson<PendingJoin[]>("/api/admin/reps/pending-joins"),
    ]).then(([r]) => mark<PendingJoin[]>((s) => setJoinRequests(s))(r));

    Promise.allSettled([
      fetchJson<LeaderboardEntry[]>("/api/reps/leaderboard?window=30d"),
    ]).then(([r]) => mark<LeaderboardEntry[]>((s) => setLeaderboard(s))(r));

    Promise.allSettled([
      fetchJson<LiveQuestRowData[]>("/api/reps/quests?status=active"),
    ]).then(([r]) => mark<LiveQuestRowData[]>((s) => setQuests(s))(r));
  }, []);

  // Mount: just kick off fetches. State starts in loading=true via initial().
  useEffect(() => {
    fireFetches();
  }, [fireFetches]);

  // Manual refresh: reset each section to loading then re-fetch. Runs off an
  // event handler (not an effect) so synchronous setState is idiomatic here.
  const refresh = () => {
    setRefreshing(true);
    setPromoter(initial());
    setBalance(initial());
    setStats(initial());
    setSubmissions(initial());
    setClaims(initial());
    setJoinRequests(initial());
    setLeaderboard(initial());
    setQuests(initial());
    fireFetches();
    setTimeout(() => setRefreshing(false), 600);
  };

  // Derived values ----------------------------------------------------------

  const pendingSubmissions = submissions.data?.filter((s) => s.status === "pending") ?? [];
  const oldestPending = pendingSubmissions
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

  const oldestJoin = joinRequests.data
    ?.slice()
    .sort(
      (a, b) =>
        new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime()
    )[0];

  const oldestClaim = claims.data
    ?.slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

  const topReps = (leaderboard.data ?? []).slice(0, 5);
  const liveQuests = (quests.data ?? []).slice(0, 4);

  // Activity feed: merge submissions + claims + join requests, sort desc, cap.
  const activity: ActivityItem[] = [];
  if (submissions.data) activity.push(...submissions.data.slice(0, 20).map(submissionToActivity));
  if (claims.data) activity.push(...claims.data.slice(0, 10).map(claimToActivity));
  if (joinRequests.data) activity.push(...joinRequests.data.slice(0, 10).map(joinRequestToActivity));
  activity.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
  const feed = activity.slice(0, 15);

  const activityLoading =
    submissions.loading && claims.loading && joinRequests.loading;

  return (
    <div className="space-y-8">
      {/* Identity bar */}
      <PromoterIdentityBar
        promoter={promoter.data}
        loading={promoter.loading}
        error={promoter.error}
      />

      {/* Needs your attention */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-xs font-semibold uppercase tracking-[2px] text-muted-foreground">
            Needs your attention
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={refreshing}
            className="h-7 gap-1.5 text-xs"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <AttentionCard
            tone="pending"
            icon={ClipboardList}
            count={stats.data?.pending_submissions ?? pendingSubmissions.length}
            label="pending submissions"
            sublabel={
              oldestPending ? `Oldest: ${relativeAge(oldestPending.created_at)}` : undefined
            }
            ctaLabel="Review"
            href="/admin/reps?tab=reports&review=submissions"
            loading={stats.loading && submissions.loading}
          />
          <AttentionCard
            tone="review"
            icon={UserPlus}
            count={joinRequests.data?.length ?? 0}
            label="join requests"
            sublabel={
              oldestJoin ? `Oldest: ${relativeAge(oldestJoin.requested_at)}` : undefined
            }
            ctaLabel="Review"
            href="/admin/reps?tab=reports&review=requests"
            loading={joinRequests.loading}
          />
          <AttentionCard
            tone="claim"
            icon={ShoppingBag}
            count={claims.data?.length ?? 0}
            label="claims awaiting fulfilment"
            sublabel={
              oldestClaim ? `Oldest: ${relativeAge(oldestClaim.created_at)}` : undefined
            }
            ctaLabel="Fulfil"
            href="/admin/reps?tab=reports&review=claims"
            loading={claims.loading}
          />
        </div>

        {/* Low-float banner */}
        {balance.data?.low_float_warning && (
          <Link
            href="/admin/ep"
            className="group flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 transition-colors hover:bg-destructive/10"
          >
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Low EP float —{" "}
                <span className="font-mono tabular-nums">
                  {formatEp(balance.data.float)}
                </span>{" "}
                <span className="text-muted-foreground">
                  (≈ {formatPence(balance.data.float_pence)})
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                You&apos;ve committed {formatEp(balance.data.committed)} to active quests
                — approvals will stall once float hits zero.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 self-center text-xs font-medium text-destructive transition-colors group-hover:text-foreground">
              Buy EP
              <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        )}
      </section>

      {/* Programme totals */}
      <section className="space-y-3">
        <h3 className="font-mono text-xs font-semibold uppercase tracking-[2px] text-muted-foreground">
          Programme totals
        </h3>
        <WeekMetrics stats={stats.data} loading={stats.loading} error={stats.error} />
      </section>

      {/* Top reps — rolling-30-day rank from rep_rank_snapshots (matches iOS masthead).
          delta_week arrows compare today's snapshot vs the next-oldest ≥3-day-old one. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[2px] text-muted-foreground">
            <Trophy size={12} />
            Top reps
            <span className="ml-1 normal-case tracking-normal text-muted-foreground/60">
              · last 30 days
            </span>
          </h3>
          <Link
            href="/admin/reps?tab=team"
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            Full team
            <ArrowRight size={11} />
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {leaderboard.loading ? (
            <div className="divide-y divide-border">
              {[0, 1, 2, 3, 4].map((i) => (
                <LeaderboardRowSkeleton key={i} />
              ))}
            </div>
          ) : leaderboard.error ? (
            <SectionError message={leaderboard.error} onRetry={refresh} />
          ) : topReps.length === 0 ? (
            <SectionEmpty
              title="No reps yet"
              hint="Invite your first rep from the Reps tab or share your signup link."
            />
          ) : (
            <div className="divide-y divide-border">
              {topReps.map((rep, i) => (
                <LeaderboardRow key={rep.id} rank={i + 1} rep={rep} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Live quests */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[2px] text-muted-foreground">
            <Swords size={12} />
            Live quests
          </h3>
          <Link
            href="/admin/reps?tab=quests"
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            View all
            <ArrowRight size={11} />
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {quests.loading ? (
            <div className="divide-y divide-border">
              {[0, 1, 2].map((i) => (
                <LiveQuestRowSkeleton key={i} />
              ))}
            </div>
          ) : quests.error ? (
            <SectionError message={quests.error} onRetry={refresh} />
          ) : liveQuests.length === 0 ? (
            <SectionEmpty
              title="No live quests"
              hint="Head to Quests to launch a new one — your team sees it instantly in the app."
            />
          ) : (
            <div className="divide-y divide-border">
              {liveQuests.map((q) => (
                <LiveQuestRow key={q.id} quest={q} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Recent activity */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[2px] text-muted-foreground">
          <Activity size={12} />
          Recent activity
        </h3>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {activityLoading ? (
            <div className="divide-y divide-border">
              {[0, 1, 2, 3, 4].map((i) => (
                <ActivityFeedItemSkeleton key={i} />
              ))}
            </div>
          ) : feed.length === 0 ? (
            <SectionEmpty
              title="Nothing recent"
              hint="When reps submit proof, claim rewards, or request to join, it&apos;ll land here."
            />
          ) : (
            <div className="divide-y divide-border">
              {feed.map((a) => (
                <ActivityFeedItem key={a.id} item={a} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
      <p className="text-sm text-destructive">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
        <RefreshCw size={12} />
        Retry
      </Button>
    </div>
  );
}

function SectionEmpty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="p-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
