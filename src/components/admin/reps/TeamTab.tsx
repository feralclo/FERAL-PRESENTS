"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  UsersRound,
  TrendingUp,
  DollarSign,
  UserPlus,
  Plus,
  Loader2,
  Check,
  X,
  Copy,
  Eye,
  Search,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Rep, RepStatus, RepProgramStats } from "@/types/reps";

type FilterTab = "active" | "pending" | "all";

const STATUS_VARIANT: Record<RepStatus, "success" | "warning" | "secondary" | "destructive"> = {
  active: "success",
  pending: "warning",
  suspended: "destructive",
  deactivated: "secondary",
};

export function TeamTab() {
  const [reps, setReps] = useState<Rep[]>([]);
  const [stats, setStats] = useState<RepProgramStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("active");
  const [search, setSearch] = useState("");

  // Simplified create + invite flow
  const [showInvite, setShowInvite] = useState(false);
  const [inviteStep, setInviteStep] = useState<"name" | "result">("name");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    invite_url: string;
    discount_code: string;
    rep_id: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState("");

  // Delete rep
  const [deleteRepTarget, setDeleteRepTarget] = useState<Rep | null>(null);
  const [deletingRep, setDeletingRep] = useState(false);
  const [deleteRepError, setDeleteRepError] = useState("");

  // Signup link copy
  const [copiedSignup, setCopiedSignup] = useState(false);

  // Current admin user (for self-deletion guard)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  const loadReps = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      if (search) params.set("search", search);
      params.set("limit", "100");
      const res = await fetch(`/api/reps?${params}`);
      const json = await res.json();
      if (json.data) setReps(json.data);
    } catch { /* network */ }
    setLoading(false);
  }, [filter, search]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/reps/stats");
      const json = await res.json();
      if (json.data) setStats(json.data);
    } catch { /* network */ }
  }, []);

  useEffect(() => { loadReps(); }, [loadReps]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const handleInviteRep = async () => {
    if (!inviteFirstName.trim() || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteError("");
    try {
      // Step 1: Create the rep with their name and email
      const createRes = await fetch("/api/reps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: inviteFirstName.trim(),
          last_name: "",
          email: inviteEmail.trim().toLowerCase(),
          status: "pending",
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok || !createJson.data) {
        setInviteError(createJson.error || "Failed to create rep");
        setInviting(false);
        return;
      }
      const newRepId = createJson.data.id;

      // Step 2: Generate invite link + discount code
      const inviteRes = await fetch(`/api/reps/${newRepId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const inviteJson = await inviteRes.json();
      if (!inviteRes.ok) {
        // Clean up the rep we just created so the admin can retry with the same email
        await fetch(`/api/reps/${newRepId}`, { method: "DELETE" }).catch(() => {});
        setInviteError(inviteJson.error || "Failed to generate invite link");
        setInviting(false);
        return;
      }
      if (inviteJson.data) {
        setInviteResult({
          invite_url: inviteJson.data.invite_url,
          discount_code: inviteJson.data.discount_code,
          rep_id: newRepId,
        });
        setInviteStep("result");
        loadReps();
        loadStats();
      }
    } catch {
      setInviteError("Network error — please try again");
    }
    setInviting(false);
  };

  const handleApprove = async (repId: string) => {
    try {
      const res = await fetch(`/api/reps/${repId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (res.ok) {
        loadReps();
        loadStats();
      }
    } catch { /* network */ }
  };

  const handleReject = async (repId: string) => {
    try {
      const res = await fetch(`/api/reps/${repId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "deactivated" }),
      });
      if (res.ok) {
        loadReps();
        loadStats();
      }
    } catch { /* network */ }
  };

  const handleDeleteRep = async () => {
    if (!deleteRepTarget) return;
    setDeletingRep(true);
    setDeleteRepError("");
    try {
      const res = await fetch(`/api/reps/${deleteRepTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteRepTarget(null);
        setDeleteRepError("");
        loadReps();
        loadStats();
      } else {
        const json = await res.json().catch(() => ({ error: "Unknown error" }));
        setDeleteRepError(json.error || `Failed (${res.status})`);
      }
    } catch { setDeleteRepError("Network error — check connection"); }
    setDeletingRep(false);
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch { /* clipboard not available */ }
  };

  const signupUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/rep/join`;
  const copySignupLink = async () => {
    try {
      await navigator.clipboard.writeText(signupUrl);
      setCopiedSignup(true);
      setTimeout(() => setCopiedSignup(false), 2000);
    } catch { /* clipboard not available */ }
  };

  const resetInviteDialog = () => {
    setShowInvite(false);
    setInviteStep("name");
    setInviteFirstName("");
    setInviteEmail("");
    setInviteResult(null);
    setInviteError("");
  };

  const counts = {
    all: reps.length,
    active: reps.filter((r) => r.status === "active").length,
    pending: reps.filter((r) => r.status === "pending").length,
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total Reps" value={String(stats.total_reps)} icon={UsersRound} />
          <StatCard label="Sales via Reps" value={String(stats.total_sales_via_reps)} icon={TrendingUp} />
          <StatCard label="Revenue via Reps" value={`£${stats.total_revenue_via_reps.toFixed(2)}`} icon={DollarSign} />
          <StatCard label="Pending Applications" value={String(stats.pending_applications)} icon={UserPlus} />
        </div>
      )}

      {/* Actions row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reps..." className="pl-9" />
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1 w-fit">
            {(["active", "pending", "all"] as FilterTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                <span className="ml-1.5 text-[10px] tabular-nums text-muted-foreground/60">{counts[tab]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copySignupLink}>
            {copiedSignup ? <Check size={14} className="text-success" /> : <ExternalLink size={14} />}
            {copiedSignup ? "Copied!" : "Signup Link"}
          </Button>
          <Button size="sm" onClick={() => setShowInvite(true)}>
            <Plus size={14} /> Invite Rep
          </Button>
        </div>
      </div>

      {/* Reps Table */}
      {loading ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-primary/60" />
            <span className="ml-3 text-sm text-muted-foreground">Loading reps...</span>
          </CardContent>
        </Card>
      ) : reps.length === 0 ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
              <UsersRound size={20} className="text-primary/60" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              {filter === "all" ? "No reps yet" : `No ${filter} reps`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Invite your first rep to start building your team
            </p>
            <Button size="sm" className="mt-4" onClick={() => setShowInvite(true)}>
              <Plus size={14} /> Invite Rep
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0 gap-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rep</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Level</TableHead>
                <TableHead className="hidden md:table-cell">Sales</TableHead>
                <TableHead className="hidden lg:table-cell">Revenue</TableHead>
                <TableHead className="hidden lg:table-cell">Points</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reps.map((rep) => (
                <TableRow key={rep.id}>
                  <TableCell>
                    <Link href={`/admin/reps/${rep.id}`} className="group">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary overflow-hidden">
                          {rep.photo_url ? (
                            <img src={rep.photo_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            `${rep.first_name.charAt(0)}${rep.last_name?.charAt(0) || ""}`
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                            {rep.display_name || `${rep.first_name} ${rep.last_name || ""}`.trim()}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {rep.email?.endsWith("@pending.entry") ? "Invite pending" : rep.email}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[rep.status]}>{rep.status}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">Lv.{rep.level}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-xs tabular-nums">{rep.total_sales}</TableCell>
                  <TableCell className="hidden lg:table-cell font-mono text-xs tabular-nums">£{Number(rep.total_revenue).toFixed(2)}</TableCell>
                  <TableCell className="hidden lg:table-cell font-mono text-xs tabular-nums text-primary">{rep.points_balance}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {rep.status === "pending" && (
                        <>
                          <Button variant="ghost" size="icon-xs" onClick={() => handleApprove(rep.id)} title="Approve" className="text-success hover:text-success">
                            <Check size={13} />
                          </Button>
                          <Button variant="ghost" size="icon-xs" onClick={() => handleReject(rep.id)} title="Reject" className="text-muted-foreground hover:text-destructive">
                            <X size={13} />
                          </Button>
                        </>
                      )}
                      <Link href={`/admin/reps/${rep.id}`}>
                        <Button variant="ghost" size="icon-xs" title="View details">
                          <Eye size={13} />
                        </Button>
                      </Link>
                      {/* Hide delete button for your own rep record */}
                      {!(rep.auth_user_id && rep.auth_user_id === currentUserId) && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setDeleteRepTarget(rep)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Delete rep"
                        >
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Delete Rep Confirmation */}
      <Dialog open={!!deleteRepTarget} onOpenChange={(open) => !open && setDeleteRepTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Rep</DialogTitle>
            <DialogDescription>
              Permanently delete <strong>{deleteRepTarget?.display_name || `${deleteRepTarget?.first_name} ${deleteRepTarget?.last_name || ""}`.trim()}</strong>?
              This removes all their data (points, sales, submissions, discount codes). They can be re-invited later.
            </DialogDescription>
          </DialogHeader>
          {deleteRepError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive">
              {deleteRepError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteRepTarget(null); setDeleteRepError(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteRep} disabled={deletingRep}>
              {deletingRep && <Loader2 size={14} className="animate-spin" />}
              {deletingRep ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Rep Dialog */}
      <Dialog open={showInvite} onOpenChange={(open) => !open && resetInviteDialog()}>
        <DialogContent>
          {inviteStep === "name" ? (
            <>
              <DialogHeader>
                <DialogTitle>Invite a Rep</DialogTitle>
                <DialogDescription>
                  Enter their name and email. We&apos;ll generate a personal invite link you can send them.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input
                    value={inviteFirstName}
                    onChange={(e) => setInviteFirstName(e.target.value)}
                    placeholder="e.g. Jordan"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="jordan@example.com"
                    onKeyDown={(e) => e.key === "Enter" && handleInviteRep()}
                  />
                </div>
              </div>
              {inviteError && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive">
                  {inviteError}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={resetInviteDialog}>Cancel</Button>
                <Button onClick={handleInviteRep} disabled={inviting || !inviteFirstName.trim() || !inviteEmail.trim() || !inviteEmail.includes("@")}>
                  {inviting && <Loader2 size={14} className="animate-spin" />}
                  {inviting ? "Generating..." : "Generate Invite Link"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Invite Ready</DialogTitle>
                <DialogDescription>
                  Send this link to {inviteFirstName}. They&apos;ll complete their profile and get onboarded automatically.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Invite Link</Label>
                  <div className="flex items-center gap-2">
                    <Input value={inviteResult?.invite_url || ""} readOnly className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => copyToClipboard(inviteResult?.invite_url || "", "link")}
                    >
                      {copiedField === "link" ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Discount Code</Label>
                  <div className="flex items-center gap-2">
                    <Input value={inviteResult?.discount_code || ""} readOnly className="font-mono text-xs tracking-wider uppercase" />
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => copyToClipboard(inviteResult?.discount_code || "", "code")}
                    >
                      {copiedField === "code" ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                    </Button>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetInviteDialog}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
