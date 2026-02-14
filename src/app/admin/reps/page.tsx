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
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
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
  Send,
  Trophy,
  Eye,
  Search,
} from "lucide-react";
import type { Rep, RepStatus, RepProgramStats } from "@/types/reps";

type FilterTab = "active" | "pending" | "all";

const STATUS_VARIANT: Record<RepStatus, "success" | "warning" | "secondary" | "destructive"> = {
  active: "success",
  pending: "warning",
  suspended: "destructive",
  deactivated: "secondary",
};

export default function RepsOverviewPage() {
  const [reps, setReps] = useState<Rep[]>([]);
  const [stats, setStats] = useState<RepProgramStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("active");
  const [search, setSearch] = useState("");

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newInstagram, setNewInstagram] = useState("");
  const [newTiktok, setNewTiktok] = useState("");
  const [newGender, setNewGender] = useState("");

  // Invite dialog
  const [inviteRepId, setInviteRepId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ invite_url: string; discount_code: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

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
    } catch { /* network error */ }
    setLoading(false);
  }, [filter, search]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/reps/stats");
      const json = await res.json();
      if (json.data) setStats(json.data);
    } catch { /* network error */ }
  }, []);

  useEffect(() => {
    loadReps();
  }, [loadReps]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleCreate = async () => {
    if (!newEmail.trim() || !newFirstName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/reps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim().toLowerCase(),
          first_name: newFirstName.trim(),
          last_name: newLastName.trim(),
          phone: newPhone.trim() || undefined,
          instagram: newInstagram.trim() || undefined,
          tiktok: newTiktok.trim() || undefined,
          gender: newGender || undefined,
          status: "active",
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        resetForm();
        loadReps();
        loadStats();
      }
    } catch { /* network error */ }
    setCreating(false);
  };

  const handleApprove = async (repId: string) => {
    try {
      await fetch(`/api/reps/${repId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      loadReps();
      loadStats();
    } catch { /* network error */ }
  };

  const handleReject = async (repId: string) => {
    try {
      await fetch(`/api/reps/${repId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "deactivated" }),
      });
      loadReps();
      loadStats();
    } catch { /* network error */ }
  };

  const handleInvite = async () => {
    if (!inviteRepId) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/reps/${inviteRepId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.data) {
        setInviteResult(json.data);
      }
    } catch { /* network error */ }
    setInviting(false);
  };

  const resetForm = () => {
    setNewEmail("");
    setNewFirstName("");
    setNewLastName("");
    setNewPhone("");
    setNewInstagram("");
    setNewTiktok("");
    setNewGender("");
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const counts = {
    all: reps.length,
    active: reps.filter((r) => r.status === "active").length,
    pending: reps.filter((r) => r.status === "pending").length,
  };

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
            Reps
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your ambassador programme — recruit, track, and reward your reps
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} />
          Add Rep
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total Reps"
            value={String(stats.total_reps)}
            icon={UsersRound}
          />
          <StatCard
            label="Sales via Reps"
            value={String(stats.total_sales_via_reps)}
            icon={TrendingUp}
          />
          <StatCard
            label="Revenue via Reps"
            value={`£${stats.total_revenue_via_reps.toFixed(2)}`}
            icon={DollarSign}
          />
          <StatCard
            label="Pending Applications"
            value={String(stats.pending_applications)}
            icon={UserPlus}
          />
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reps..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1 w-fit">
          {(["active", "pending", "all"] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              <span className="ml-1.5 text-[10px] tabular-nums text-muted-foreground/60">
                {counts[tab]}
              </span>
            </button>
          ))}
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
              Add your first rep to start building your ambassador programme
            </p>
            <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus size={14} />
              Add Rep
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
                            {rep.display_name || `${rep.first_name} ${rep.last_name}`}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{rep.email}</p>
                        </div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[rep.status]}>{rep.status}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      Lv.{rep.level}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-xs tabular-nums">
                    {rep.total_sales}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell font-mono text-xs tabular-nums">
                    £{Number(rep.total_revenue).toFixed(2)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell font-mono text-xs tabular-nums text-primary">
                    {rep.points_balance}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {rep.status === "pending" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleApprove(rep.id)}
                            title="Approve"
                            className="text-success hover:text-success"
                          >
                            <Check size={13} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleReject(rep.id)}
                            title="Reject"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X size={13} />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => {
                          setInviteRepId(rep.id);
                          setInviteResult(null);
                        }}
                        title="Send invite"
                      >
                        <Send size={13} />
                      </Button>
                      <Link href={`/admin/reps/${rep.id}`}>
                        <Button variant="ghost" size="icon-xs" title="View details">
                          <Eye size={13} />
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ── Create Rep Dialog ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Rep</DialogTitle>
            <DialogDescription>
              Manually add a rep to your programme. They&apos;ll be set as active immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  placeholder="First name"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  placeholder="Last name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="rep@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+44..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Instagram</Label>
                <Input
                  value={newInstagram}
                  onChange={(e) => setNewInstagram(e.target.value)}
                  placeholder="handle"
                />
              </div>
              <div className="space-y-2">
                <Label>TikTok</Label>
                <Input
                  value={newTiktok}
                  onChange={(e) => setNewTiktok(e.target.value)}
                  placeholder="handle"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={newGender} onValueChange={setNewGender}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="non-binary">Non-binary</SelectItem>
                  <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newEmail.trim() || !newFirstName.trim()}
            >
              {creating && <Loader2 size={14} className="animate-spin" />}
              {creating ? "Adding..." : "Add Rep"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Invite Dialog ── */}
      <Dialog open={!!inviteRepId} onOpenChange={(open) => !open && setInviteRepId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Invite Link</DialogTitle>
            <DialogDescription>
              Generate a unique invite link and discount code for this rep.
            </DialogDescription>
          </DialogHeader>
          {inviteResult ? (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Invite Link</Label>
                <div className="flex items-center gap-2">
                  <Input value={inviteResult.invite_url} readOnly className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => copyToClipboard(inviteResult.invite_url, "link")}
                  >
                    {copiedField === "link" ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Discount Code</Label>
                <div className="flex items-center gap-2">
                  <Input value={inviteResult.discount_code} readOnly className="font-mono text-xs tracking-wider uppercase" />
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => copyToClipboard(inviteResult.discount_code, "code")}
                  >
                    {copiedField === "code" ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                This will generate a personal invite link and create a discount code for the rep.
              </p>
              <Button onClick={handleInvite} disabled={inviting}>
                {inviting && <Loader2 size={14} className="animate-spin" />}
                {inviting ? "Generating..." : "Generate Invite"}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteRepId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
