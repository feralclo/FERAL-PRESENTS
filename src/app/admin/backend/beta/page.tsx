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
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

interface Stats {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
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

export default function BetaApplicationsPage() {
  const [applications, setApplications] = useState<BetaApplication[]>([]);
  const [stats, setStats] = useState<Stats>({
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
        setStats(data.stats || { total: 0, pending: 0, accepted: 0, rejected: 0 });
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

      if (res.ok) {
        await fetchData();
      }
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
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
            Beta Applications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review and accept promoters into the platform
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            fetchData();
          }}
          className="gap-2"
        >
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>

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
