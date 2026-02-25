"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  RefreshCw,
  Check,
  X,
  Copy,
  Clock,
  UserPlus,
  UserCheck,
  UserX,
  Plus,
  Key,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/* ── Types ── */

interface BetaApplication {
  id: string;
  company_name: string;
  email: string;
  event_types: string[];
  monthly_events: string | null;
  audience_size: string | null;
  status: "pending" | "accepted" | "rejected";
  invite_code?: string;
  applied_at: string;
  reviewed_at?: string;
}

interface AppStats {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
}

interface InviteCode {
  code: string;
  label: string;
  created_at: string;
  created_for?: string;
  used: boolean;
  used_by?: string;
  used_at?: string;
  source: "generated" | "application";
}

interface CodeStats {
  total: number;
  used: number;
  unused: number;
  generated: number;
  from_applications: number;
}

/* ── Helpers ── */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof UserPlus;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}
        >
          <Icon size={18} />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-[12px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ══════════════════════════════════════════════
   APPLICATIONS TAB
   ══════════════════════════════════════════════ */

function ApplicationsTab() {
  const [applications, setApplications] = useState<BetaApplication[]>([]);
  const [stats, setStats] = useState<AppStats>({
    total: 0,
    pending: 0,
    accepted: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [filter, setFilter] = useState<
    "all" | "pending" | "accepted" | "rejected"
  >("all");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/platform/beta-applications");
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
        setStats(
          data.stats || { total: 0, pending: 0, accepted: 0, rejected: 0 }
        );
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAction = async (id: string, action: "accept" | "reject") => {
    setActionLoading(id);
    try {
      const res = await fetch("/api/platform/beta-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok) await fetchData();
    } catch {
      // silently fail
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filtered =
    filter === "all"
      ? applications
      : applications.filter((a) => a.status === filter);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total"
          value={stats.total}
          icon={UserPlus}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          icon={Clock}
          color="bg-warning/10 text-warning"
        />
        <StatCard
          label="Accepted"
          value={stats.accepted}
          icon={UserCheck}
          color="bg-success/10 text-success"
        />
        <StatCard
          label="Rejected"
          value={stats.rejected}
          icon={UserX}
          color="bg-destructive/10 text-destructive"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
        {(
          [
            { key: "all", label: "All" },
            { key: "pending", label: "Pending" },
            { key: "accepted", label: "Accepted" },
            { key: "rejected", label: "Rejected" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-all ${
              filter === tab.key
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.key === "pending" && stats.pending > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warning/20 px-1 text-[10px] font-bold text-warning">
                {stats.pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Applications list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <UserPlus
              size={32}
              className="text-muted-foreground/30 mb-3"
            />
            <p className="text-sm text-muted-foreground">
              {filter === "all"
                ? "No applications yet"
                : `No ${filter} applications`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => (
            <Card key={app.id} className="overflow-hidden">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  {/* Left: info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-[15px] font-semibold text-foreground truncate">
                        {app.company_name}
                      </h3>
                      <Badge
                        variant={
                          app.status === "accepted"
                            ? "default"
                            : app.status === "rejected"
                            ? "destructive"
                            : "secondary"
                        }
                        className={`text-[10px] ${
                          app.status === "accepted"
                            ? "bg-success/15 text-success border-success/20"
                            : app.status === "pending"
                            ? "bg-warning/15 text-warning border-warning/20"
                            : ""
                        }`}
                      >
                        {app.status}
                      </Badge>
                    </div>

                    <p className="mt-1 text-[13px] text-muted-foreground">
                      {app.email}
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground/60">
                      {app.event_types.length > 0 && (
                        <span>{app.event_types.join(", ")}</span>
                      )}
                      {app.monthly_events && (
                        <span>{app.monthly_events}</span>
                      )}
                      <span>{timeAgo(app.applied_at)}</span>
                    </div>

                    {/* Show invite code for accepted applications */}
                    {app.status === "accepted" && app.invite_code && (
                      <div className="mt-3 flex items-center gap-2">
                        <code className="rounded-md border border-success/20 bg-success/5 px-2.5 py-1 font-mono text-[12px] text-success">
                          {app.invite_code}
                        </code>
                        <button
                          onClick={() =>
                            handleCopyCode(app.invite_code!)
                          }
                          className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {copiedCode === app.invite_code ? (
                            <>
                              <Check size={12} className="text-success" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              Copy code
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Right: actions */}
                  {app.status === "pending" && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(app.id, "reject")}
                        disabled={actionLoading === app.id}
                        className="gap-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/30"
                      >
                        {actionLoading === app.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <X size={14} />
                        )}
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleAction(app.id, "accept")}
                        disabled={actionLoading === app.id}
                        className="gap-1.5 bg-success hover:bg-success/90 text-white"
                      >
                        {actionLoading === app.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                        Accept
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   INVITE CODES TAB
   ══════════════════════════════════════════════ */

function InviteCodesTab() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [stats, setStats] = useState<CodeStats>({
    total: 0,
    used: 0,
    unused: 0,
    generated: 0,
    from_applications: 0,
  });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [count, setCount] = useState(1);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unused" | "used">("all");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/platform/invite-codes");
      if (res.ok) {
        const data = await res.json();
        setCodes(data.codes || []);
        setStats(
          data.stats || {
            total: 0,
            used: 0,
            unused: 0,
            generated: 0,
            from_applications: 0,
          }
        );
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setGenerating(true);

    try {
      const res = await fetch("/api/platform/invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), count }),
      });

      if (res.ok) {
        setLabel("");
        setCount(1);
        setShowForm(false);
        await fetchData();
      }
    } catch {
      // silently fail
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filtered =
    filter === "all"
      ? codes
      : filter === "used"
      ? codes.filter((c) => c.used)
      : codes.filter((c) => !c.used);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Total codes"
          value={stats.total}
          icon={Key}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          label="Available"
          value={stats.unused}
          icon={Plus}
          color="bg-success/10 text-success"
        />
        <StatCard
          label="Redeemed"
          value={stats.used}
          icon={UserCheck}
          color="bg-warning/10 text-warning"
        />
      </div>

      {/* Generate form */}
      {showForm ? (
        <Card>
          <CardContent className="p-5">
            <h3 className="text-[14px] font-semibold text-foreground mb-4">
              Generate invite codes
            </h3>
            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
                  Label
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Twitter campaign, VIP handout, DJ outreach..."
                  className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-[14px] text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-[3px] focus:ring-primary/15"
                  autoFocus
                  required
                />
                <p className="mt-1 text-[11px] text-muted-foreground/60">
                  A label to help you remember who these codes are for
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
                  How many codes?
                </label>
                <div className="flex items-center gap-2">
                  {[1, 3, 5, 10].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCount(n)}
                      className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-all ${
                        count === n
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="submit"
                  size="sm"
                  disabled={generating || !label.trim()}
                  className="gap-1.5"
                >
                  {generating ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  Generate {count > 1 ? `${count} codes` : "code"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowForm(false);
                    setLabel("");
                    setCount(1);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Button
          size="sm"
          onClick={() => setShowForm(true)}
          className="gap-1.5"
        >
          <Plus size={14} />
          Generate codes
        </Button>
      )}

      {/* Filter */}
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
        {(
          [
            { key: "all", label: "All" },
            { key: "unused", label: "Available" },
            { key: "used", label: "Redeemed" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-all ${
              filter === tab.key
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Codes list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Key size={32} className="text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {filter === "all"
                ? "No invite codes yet"
                : filter === "used"
                ? "No redeemed codes"
                : "No available codes"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((code) => (
            <Card key={code.code} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Left: code + info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <code
                        className={`rounded-md border px-2.5 py-1 font-mono text-[13px] font-semibold ${
                          code.used
                            ? "border-border/50 bg-muted/30 text-muted-foreground"
                            : "border-primary/20 bg-primary/5 text-primary"
                        }`}
                      >
                        {code.code}
                      </code>
                      <Badge
                        variant={code.used ? "secondary" : "default"}
                        className={`text-[10px] ${
                          code.used
                            ? "bg-muted/50 text-muted-foreground"
                            : "bg-success/15 text-success border-success/20"
                        }`}
                      >
                        {code.used ? "redeemed" : "available"}
                      </Badge>
                      {code.source === "application" && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-primary/10 text-primary/60 border-primary/15"
                        >
                          from application
                        </Badge>
                      )}
                    </div>

                    {/* Label */}
                    <p className="mt-1.5 text-[12px] text-muted-foreground/70">
                      {code.label || (code.created_for ? `Created for ${code.created_for}` : "No label")}
                    </p>

                    {/* Usage tracking */}
                    {code.used && code.used_by && (
                      <div className="mt-2 flex items-center gap-1.5 text-[12px]">
                        <ArrowRight size={11} className="text-success" />
                        <span className="text-success font-medium">
                          {code.used_by}
                        </span>
                        {code.used_at && (
                          <span className="text-muted-foreground/50">
                            &middot; {timeAgo(code.used_at)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Created for (application codes) */}
                    {!code.used && code.created_for && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground/50">
                        <ExternalLink size={10} />
                        Sent to {code.created_for}
                      </div>
                    )}

                    {/* Created time */}
                    <p className="mt-1 text-[11px] text-muted-foreground/40">
                      Created {timeAgo(code.created_at)}
                    </p>
                  </div>

                  {/* Right: copy button */}
                  {!code.used && (
                    <button
                      onClick={() => handleCopy(code.code)}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground"
                    >
                      {copiedCode === code.code ? (
                        <>
                          <Check size={13} className="text-success" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          Copy
                        </>
                      )}
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   HARDCODED CODES INFO
   ══════════════════════════════════════════════ */

const HARDCODED_CODES = ["ENTRY-FOUNDING", "ENTRY-VIP-2026", "PROMOTER-001"];

function HardcodedCodesCard({
  copiedCode,
  onCopy,
}: {
  copiedCode: string | null;
  onCopy: (code: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Key size={14} className="text-warning" />
          <h3 className="text-[13px] font-semibold text-foreground">
            Permanent codes
          </h3>
          <Badge
            variant="secondary"
            className="text-[10px] bg-warning/10 text-warning border-warning/15"
          >
            reusable
          </Badge>
        </div>
        <p className="text-[12px] text-muted-foreground/60 mb-3">
          These codes always work and can be used by anyone, unlimited times.
          They&apos;re hardcoded in the codebase.
        </p>
        <div className="flex flex-wrap gap-2">
          {HARDCODED_CODES.map((code) => (
            <button
              key={code}
              onClick={() => onCopy(code)}
              className="flex items-center gap-1.5 rounded-md border border-warning/20 bg-warning/5 px-2.5 py-1 font-mono text-[12px] text-warning transition-all hover:bg-warning/10"
            >
              {code}
              {copiedCode === code ? (
                <Check size={11} className="text-success" />
              ) : (
                <Copy size={11} className="opacity-50" />
              )}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ══════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════ */

export default function BetaManagementPage() {
  const [activeTab, setActiveTab] = useState<"applications" | "codes">(
    "applications"
  );
  const [copiedHardcoded, setCopiedHardcoded] = useState<string | null>(null);

  const handleCopyHardcoded = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedHardcoded(code);
    setTimeout(() => setCopiedHardcoded(null), 2000);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
          Beta Access
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage applications and invite codes
        </p>
      </div>

      {/* Hardcoded codes */}
      <HardcodedCodesCard
        copiedCode={copiedHardcoded}
        onCopy={handleCopyHardcoded}
      />

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        <button
          onClick={() => setActiveTab("applications")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-all ${
            activeTab === "applications"
              ? "bg-primary/10 text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <UserPlus size={16} />
          Applications
        </button>
        <button
          onClick={() => setActiveTab("codes")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-all ${
            activeTab === "codes"
              ? "bg-primary/10 text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Key size={16} />
          Invite Codes
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "applications" ? <ApplicationsTab /> : <InviteCodesTab />}
    </div>
  );
}
