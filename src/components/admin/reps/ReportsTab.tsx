"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Inbox,
  Loader2,
  RefreshCw,
  ShoppingBag,
  UserPlus,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type {
  Rep,
  RepQuestSubmission,
  RepRewardClaim,
  RepReward,
  SubmissionStatus,
} from "@/types/reps";

type ReportKind = "submissions" | "claims" | "requests";

type SubFilter = "pending" | "approved" | "rejected" | "all";

function repName(r: { display_name?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined): string {
  if (!r) return "A rep";
  if (r.display_name) return r.display_name;
  const n = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
  return n || "A rep";
}

function relative(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor(Math.max(0, Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------

export function ReportsTab() {
  const searchParams = useSearchParams();
  const reviewParam = searchParams?.get("review");
  const initialKind: ReportKind =
    reviewParam === "submissions" ||
    reviewParam === "claims" ||
    reviewParam === "requests"
      ? reviewParam
      : "submissions";
  const [kind, setKind] = useState<ReportKind>(initialKind);

  // Re-sync if the URL changes (Dashboard attention cards link here with
  // ?review=<kind> — reactive to client-side navigation). The set is
  // guarded so it's only called when the value actually differs.
  useEffect(() => {
    if (
      (reviewParam === "submissions" ||
        reviewParam === "claims" ||
        reviewParam === "requests") &&
      reviewParam !== kind
    ) {
      setKind(reviewParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kind intentionally omitted to avoid loop
  }, [reviewParam]);

  const [submissions, setSubmissions] = useState<RepQuestSubmission[] | null>(null);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [subFilter, setSubFilter] = useState<SubFilter>("pending");

  const [claims, setClaims] = useState<RepRewardClaim[] | null>(null);
  const [loadingClaims, setLoadingClaims] = useState(true);

  const [requests, setRequests] = useState<Rep[] | null>(null);
  const [loadingRequests, setLoadingRequests] = useState(true);

  // Load helpers only call setState asynchronously (after await / in .catch).
  // Initial loading=true comes from useState; refresh button handles its own
  // synchronous reset outside of any effect. Keeps us clean against the
  // react-hooks/set-state-in-effect rule.
  const loadSubs = useCallback(async () => {
    try {
      const res = await fetch("/api/reps/submissions", { cache: "no-store" });
      const json = await res.json();
      setSubmissions(json.data ?? []);
    } catch {
      setSubmissions([]);
    }
    setLoadingSubs(false);
  }, []);

  const loadClaims = useCallback(async () => {
    try {
      const res = await fetch("/api/reps/claims?status=claimed", { cache: "no-store" });
      const json = await res.json();
      setClaims(json.data ?? []);
    } catch {
      setClaims([]);
    }
    setLoadingClaims(false);
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/reps?status=pending&limit=100", { cache: "no-store" });
      const json = await res.json();
      setRequests(json.data ?? []);
    } catch {
      setRequests([]);
    }
    setLoadingRequests(false);
  }, []);

  useEffect(() => {
    loadSubs();
    loadClaims();
    loadRequests();
  }, [loadSubs, loadClaims, loadRequests]);

  const refresh = () => {
    // Explicit reset → re-fetch. Runs off a click handler, not an effect.
    if (kind === "submissions") {
      setLoadingSubs(true);
      loadSubs();
    }
    if (kind === "claims") {
      setLoadingClaims(true);
      loadClaims();
    }
    if (kind === "requests") {
      setLoadingRequests(true);
      loadRequests();
    }
  };

  // Counts for the tab chips — always reflect the pending/actionable amount,
  // not the current filter, so tenants see the queue depth at a glance.
  const subPending = (submissions ?? []).filter((s) => s.status === "pending").length;
  const claimPending = (claims ?? []).length; // already filtered server-side
  const requestPending = (requests ?? []).length;

  return (
    <div className="space-y-6">
      {/* Header + kind nav — horizontal scroll on narrow screens keeps all
          three reachable without wrapping the pill group. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
            <KindButton
              active={kind === "submissions"}
              onClick={() => setKind("submissions")}
              icon={<ClipboardList size={14} />}
              label="Submissions"
              count={subPending}
            />
            <KindButton
              active={kind === "claims"}
              onClick={() => setKind("claims")}
              icon={<ShoppingBag size={14} />}
              label="Claims"
              count={claimPending}
            />
            <KindButton
              active={kind === "requests"}
              onClick={() => setKind("requests")}
              icon={<UserPlus size={14} />}
              label="Requests"
              count={requestPending}
            />
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
          <RefreshCw size={13} />
          Refresh
        </Button>
      </div>

      {kind === "submissions" && (
        <SubmissionsQueue
          submissions={submissions}
          loading={loadingSubs}
          filter={subFilter}
          onFilter={setSubFilter}
          onChange={(s) =>
            setSubmissions((prev) =>
              prev ? prev.map((row) => (row.id === s.id ? s : row)) : prev
            )
          }
        />
      )}
      {kind === "claims" && (
        <ClaimsQueue
          claims={claims}
          loading={loadingClaims}
          onChange={(id, next) =>
            setClaims((prev) => (prev ? prev.filter((c) => c.id !== id).concat(next ? [next] : []) : prev))
          }
        />
      )}
      {kind === "requests" && (
        <RequestsQueue
          requests={requests}
          loading={loadingRequests}
          onDecided={(id) =>
            setRequests((prev) => (prev ? prev.filter((r) => r.id !== id) : prev))
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function KindButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
      {count > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
            active ? "bg-primary/10 text-primary" : "bg-foreground/10 text-foreground"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// SUBMISSIONS
// ---------------------------------------------------------------------------

function SubmissionsQueue({
  submissions,
  loading,
  filter,
  onFilter,
  onChange,
}: {
  submissions: RepQuestSubmission[] | null;
  loading: boolean;
  filter: SubFilter;
  onFilter: (f: SubFilter) => void;
  onChange: (updated: RepQuestSubmission) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);

  const filtered = (submissions ?? []).filter((s) => {
    if (filter === "all") return true;
    return s.status === filter;
  });
  const counts: Record<SubFilter, number> = {
    pending: (submissions ?? []).filter((s) => s.status === "pending").length,
    approved: (submissions ?? []).filter((s) => s.status === "approved").length,
    rejected: (submissions ?? []).filter((s) => s.status === "rejected").length,
    all: (submissions ?? []).length,
  };

  async function decide(s: RepQuestSubmission, status: SubmissionStatus, reason?: string) {
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/reps/quests/submissions/${s.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejection_reason: reason }),
      });
      if (res.ok) {
        onChange({
          ...s,
          status,
          rejection_reason: reason ?? s.rejection_reason ?? null,
          reviewed_at: new Date().toISOString(),
        });
      }
    } catch {
      /* network */
    }
    setBusyId(null);
    setRejectingId(null);
    setRejectReason("");
  }

  return (
    <div className="space-y-4">
      {/* Status filter */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted/50 p-1">
          {(["pending", "approved", "rejected", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => onFilter(t)}
              className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === t
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              <span className="ml-1 text-[10px] tabular-nums text-muted-foreground/60">
                {counts[t]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Batch approve */}
      {filter === "pending" && counts.pending >= 2 && (
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-5 py-3">
          <span className="text-sm text-muted-foreground">
            <span className="font-mono tabular-nums text-foreground">{counts.pending}</span>{" "}
            submission{counts.pending !== 1 ? "s" : ""} awaiting review
          </span>
          <Button
            size="sm"
            disabled={busyId !== null}
            onClick={async () => {
              const pending = filtered.filter((s) => s.status === "pending");
              for (const s of pending) {
                await decide(s, "approved");
              }
            }}
          >
            <CheckCircle2 size={14} /> Approve all
          </Button>
        </div>
      )}

      {loading ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-primary/60" />
            <span className="ml-3 text-sm text-muted-foreground">Loading submissions...</span>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyCard
          icon={<Inbox size={20} className="text-primary/60" />}
          title={filter === "pending" ? "You're all caught up" : "Nothing to show"}
          hint={
            filter === "pending"
              ? "No submissions waiting on you. Nice work."
              : "Switch back to Pending to see what needs review."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const rep = s.rep;
            const quest = s.quest;
            const isPending = s.status === "pending";
            const proofType = s.proof_type;
            const proofUrl = s.proof_url ?? "";
            const isLink =
              proofType === "url" ||
              proofType === "tiktok_link" ||
              proofType === "instagram_link";
            const proofLabel =
              proofType === "screenshot"
                ? "Screenshot"
                : proofType === "tiktok_link"
                ? "TikTok"
                : proofType === "instagram_link"
                ? "Instagram"
                : proofType === "url"
                ? "URL"
                : "Text";

            const borderTone = isPending
              ? "ring-1 ring-primary/25"
              : s.status === "approved"
              ? "opacity-80"
              : "ring-1 ring-destructive/20 opacity-90";

            return (
              <Card
                key={s.id}
                className={`overflow-hidden transition-all ${borderTone}`}
              >
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row">
                    {/* Proof column */}
                    <div className="sm:w-56 shrink-0 border-b border-border bg-muted/10 sm:border-b-0 sm:border-r">
                      {proofType === "screenshot" && proofUrl ? (
                        <button
                          type="button"
                          onClick={() => setLightbox(proofUrl)}
                          className="group relative w-full cursor-zoom-in"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={proofUrl}
                            alt="Proof"
                            className="w-full bg-black/10 object-contain sm:h-48"
                          />
                        </button>
                      ) : isLink && proofUrl ? (
                        <a
                          href={proofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-full items-center justify-center gap-2 p-6 text-sm text-primary hover:underline"
                        >
                          <ExternalLink size={14} />
                          Open {proofLabel}
                        </a>
                      ) : (
                        <div className="p-5 text-xs text-muted-foreground">
                          <p className="font-mono uppercase tracking-wider">
                            {proofLabel}
                          </p>
                          {s.proof_text && (
                            <p className="mt-2 whitespace-pre-wrap text-foreground">
                              {s.proof_text}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Details + actions */}
                    <div className="flex flex-1 flex-col gap-3 p-5">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-foreground">
                            {repName(rep)}
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">
                            {quest?.title ?? "Quest"}
                          </span>
                          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            {relative(s.created_at)}
                          </span>
                        </div>
                        {quest?.event && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {(quest.event as { name: string }).name}
                          </p>
                        )}
                        <StatusBadge status={s.status} />
                        {s.rejection_reason && (
                          <p className="mt-2 rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-muted-foreground">
                            <span className="font-medium text-destructive">
                              Rejected —{" "}
                            </span>
                            {s.rejection_reason}
                          </p>
                        )}
                      </div>

                      {isPending && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            disabled={busyId === s.id}
                            onClick={() => decide(s, "approved")}
                            className="gap-1.5"
                          >
                            {busyId === s.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Check size={13} />
                            )}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === s.id}
                            onClick={() => {
                              setRejectingId(s.id);
                              setRejectReason("");
                            }}
                            className="gap-1.5"
                          >
                            <X size={13} />
                            Reject
                          </Button>
                          <Link
                            href={`/admin/reps/${s.rep_id}`}
                            className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-primary"
                          >
                            View rep
                            <ArrowRight size={11} />
                          </Link>
                        </div>
                      )}

                      {rejectingId === s.id && (
                        <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                          <Textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Reason (optional — shown to the rep)"
                            rows={2}
                            className="text-xs"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setRejectingId(null);
                                setRejectReason("");
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={busyId !== null}
                              onClick={() => decide(s, "rejected", rejectReason.trim() || undefined)}
                            >
                              Confirm reject
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-6 backdrop-blur"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Proof"
            className="max-h-full max-w-full rounded-lg shadow-2xl"
          />
        </button>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: SubmissionStatus }) {
  const cls =
    status === "approved"
      ? "border-success/30 bg-success/10 text-success"
      : status === "rejected"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : "border-primary/30 bg-primary/10 text-primary";
  return (
    <span
      className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CLAIMS
// ---------------------------------------------------------------------------

function ClaimsQueue({
  claims,
  loading,
  onChange,
}: {
  claims: RepRewardClaim[] | null;
  loading: boolean;
  onChange: (id: string, replacement: RepRewardClaim | null) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function fulfil(c: RepRewardClaim) {
    setBusyId(c.id);
    try {
      const res = await fetch(`/api/reps/claims/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "fulfilled" }),
      });
      if (res.ok) onChange(c.id, null);
    } catch {
      /* network */
    }
    setBusyId(null);
  }

  async function cancel(c: RepRewardClaim) {
    if (!confirm("Cancel this claim? The rep will be refunded their points.")) return;
    setBusyId(c.id);
    try {
      const res = await fetch(`/api/reps/claims/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (res.ok) onChange(c.id, null);
    } catch {
      /* network */
    }
    setBusyId(null);
  }

  if (loading) {
    return (
      <Card className="py-0 gap-0">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-primary/60" />
          <span className="ml-3 text-sm text-muted-foreground">Loading claims...</span>
        </CardContent>
      </Card>
    );
  }

  if (!claims || claims.length === 0) {
    return (
      <EmptyCard
        icon={<ShoppingBag size={20} className="text-primary/60" />}
        title="No claims awaiting fulfilment"
        hint="When a rep redeems a reward from your shop, they'll show up here to mark fulfilled."
      />
    );
  }

  return (
    <div className="space-y-3">
      {claims.map((c) => {
        const rew = c.reward as RepReward | undefined;
        const rep = c.rep;
        return (
          <Card key={c.id} className="overflow-hidden">
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {repName(rep)}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-sm text-foreground">
                    {rew?.name ?? "Reward"}
                  </span>
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {relative(c.created_at)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="font-mono tabular-nums">
                    {c.points_spent} pts
                  </span>
                  {rew?.reward_type && (
                    <Badge
                      variant="outline"
                      className="border-border text-[10px] uppercase tracking-wider text-muted-foreground"
                    >
                      {rew.reward_type}
                    </Badge>
                  )}
                  {c.notes && <span className="italic">&ldquo;{c.notes}&rdquo;</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  disabled={busyId === c.id}
                  onClick={() => fulfil(c)}
                  className="gap-1.5"
                >
                  {busyId === c.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Check size={13} />
                  )}
                  Mark fulfilled
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === c.id}
                  onClick={() => cancel(c)}
                >
                  Cancel
                </Button>
                <Link
                  href={`/admin/reps/${c.rep_id}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                  title="Open rep profile"
                >
                  <ExternalLink size={13} />
                </Link>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// JOIN REQUESTS
// ---------------------------------------------------------------------------

function RequestsQueue({
  requests,
  loading,
  onDecided,
}: {
  requests: Rep[] | null;
  loading: boolean;
  onDecided: (id: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function decide(rep: Rep, status: "active" | "deactivated") {
    setBusyId(rep.id);
    try {
      const res = await fetch(`/api/reps/${rep.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) onDecided(rep.id);
    } catch {
      /* network */
    }
    setBusyId(null);
  }

  if (loading) {
    return (
      <Card className="py-0 gap-0">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-primary/60" />
          <span className="ml-3 text-sm text-muted-foreground">Loading requests...</span>
        </CardContent>
      </Card>
    );
  }

  if (!requests || requests.length === 0) {
    return (
      <EmptyCard
        icon={<UserPlus size={20} className="text-primary/60" />}
        title="No pending join requests"
        hint="Share your signup link from the Reps tab — you'll see new applicants here first."
      />
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => {
        const initials = repName(r)
          .split(/\s+/)
          .filter(Boolean)
          .map((w) => w[0]!.toUpperCase())
          .slice(0, 2)
          .join("");
        return (
          <Card key={r.id} className="overflow-hidden">
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-warning/40 to-warning/15 text-[11px] font-bold text-foreground ring-1 ring-warning/25">
                {r.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.photo_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials || "—"
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {repName(r)}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {r.email}
                  </span>
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {relative(r.created_at)}
                  </span>
                </div>
                {r.bio && (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                    {r.bio}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {r.instagram && (
                    <span className="font-mono">@{r.instagram}</span>
                  )}
                  {r.tiktok && (
                    <span className="font-mono">tiktok: @{r.tiktok}</span>
                  )}
                  {r.phone && <span className="font-mono">{r.phone}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch">
                <Button
                  size="sm"
                  disabled={busyId === r.id}
                  onClick={() => decide(r, "active")}
                  className="gap-1.5"
                >
                  {busyId === r.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Check size={13} />
                  )}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === r.id}
                  onClick={() => decide(r, "deactivated")}
                >
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

function EmptyCard({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <Card className="py-0 gap-0">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
          {icon}
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
