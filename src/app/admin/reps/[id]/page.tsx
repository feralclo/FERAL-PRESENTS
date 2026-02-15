"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  ArrowLeft,
  Loader2,
  Trophy,
  Coins,
  ShoppingBag,
  TrendingUp,
  Copy,
  Check,
  Send,
  Trash2,
  Calendar,
  Mail,
  Phone,
  Instagram,
  User,
  Globe,
} from "lucide-react";
import type {
  Rep,
  RepStatus,
  RepPointsLog,
  RepEvent,
  RepRewardClaim,
} from "@/types/reps";

// ─── Status badge map ─────────────────────────────────────────────────────
const STATUS_VARIANT: Record<
  RepStatus,
  "success" | "warning" | "secondary" | "destructive"
> = {
  active: "success",
  pending: "warning",
  suspended: "destructive",
  deactivated: "secondary",
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE — Rep Detail
// ═══════════════════════════════════════════════════════════════════════════

export default function RepDetailPage() {
  const params = useParams();
  const router = useRouter();
  const repId = params.id as string;

  const [rep, setRep] = useState<Rep | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("overview");

  // Points history
  const [points, setPoints] = useState<RepPointsLog[]>([]);
  const [loadingPoints, setLoadingPoints] = useState(false);

  // Events
  const [events, setEvents] = useState<RepEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Claims
  const [claims, setClaims] = useState<RepRewardClaim[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);

  // Award points dialog
  const [showAwardPoints, setShowAwardPoints] = useState(false);
  const [awardAmount, setAwardAmount] = useState("");
  const [awardDescription, setAwardDescription] = useState("");
  const [awarding, setAwarding] = useState(false);

  // Invite link dialog
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    invite_url: string;
    discount_code: string;
  } | null>(null);

  // Delete rep dialog
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Copy feedback
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // ── Data loaders ──────────────────────────────────────────────────────

  const loadRep = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reps/${repId}`);
      const json = await res.json();
      if (json.data) {
        setRep(json.data);
      }
    } catch {
      /* network error */
    }
    setLoading(false);
  }, [repId]);

  const loadPoints = useCallback(async () => {
    setLoadingPoints(true);
    try {
      const res = await fetch(`/api/reps/${repId}/points?limit=50`);
      const json = await res.json();
      if (json.data) setPoints(json.data);
    } catch {
      /* network error */
    }
    setLoadingPoints(false);
  }, [repId]);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch(`/api/reps/events?rep_id=${repId}`);
      const json = await res.json();
      if (json.data) setEvents(json.data);
    } catch {
      /* network error */
    }
    setLoadingEvents(false);
  }, [repId]);

  const loadClaims = useCallback(async () => {
    setLoadingClaims(true);
    try {
      const res = await fetch(`/api/reps/claims?rep_id=${repId}`);
      const json = await res.json();
      if (json.data) setClaims(json.data);
    } catch {
      /* network error */
    }
    setLoadingClaims(false);
  }, [repId]);

  useEffect(() => {
    loadRep();
  }, [loadRep]);

  useEffect(() => {
    if (tab === "points") loadPoints();
    if (tab === "events") loadEvents();
    if (tab === "rewards") loadClaims();
  }, [tab, loadPoints, loadEvents, loadClaims]);

  // ── Actions ───────────────────────────────────────────────────────────

  const handleStatusChange = async (status: string) => {
    if (!status || !rep) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/reps/${repId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) loadRep();
    } catch {
      /* network error */
    }
    setSaving(false);
  };

  const handleAwardPoints = async () => {
    if (!awardAmount || !awardDescription.trim()) return;
    setAwarding(true);
    try {
      const res = await fetch(`/api/reps/${repId}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points: Number(awardAmount),
          description: awardDescription.trim(),
        }),
      });
      if (res.ok) {
        setShowAwardPoints(false);
        setAwardAmount("");
        setAwardDescription("");
        loadRep();
        if (tab === "points") loadPoints();
      }
    } catch {
      /* network error */
    }
    setAwarding(false);
  };

  const handleGenerateInvite = async () => {
    setInviting(true);
    try {
      const res = await fetch(`/api/reps/${repId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.data) {
        setInviteResult({
          invite_url: json.data.invite_url,
          discount_code: json.data.discount_code,
        });
      }
    } catch {
      /* network error */
    }
    setInviting(false);
  };

  const handleDeleteRep = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/reps/${repId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/admin/reps");
      }
    } catch {
      /* network error */
    }
    setDeleting(false);
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // ── Loading state ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={24} className="animate-spin text-primary/60" />
      </div>
    );
  }

  if (!rep) {
    return (
      <div className="p-6 lg:p-8">
        <p className="text-muted-foreground">Rep not found.</p>
        <Link href="/admin/reps/">
          <Button variant="outline" size="sm" className="mt-4">
            <ArrowLeft size={14} /> Back to Reps
          </Button>
        </Link>
      </div>
    );
  }

  const displayName =
    rep.display_name || `${rep.first_name} ${rep.last_name || ""}`.trim();

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Back link + Header */}
      <div>
        <Link
          href="/admin/reps/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={12} /> Back to Reps
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary overflow-hidden ring-2 ring-primary/20">
              {rep.photo_url ? (
                <img
                  src={rep.photo_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                `${rep.first_name.charAt(0)}${rep.last_name?.charAt(0) || ""}`
              )}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
                  {displayName}
                </h1>
                <Badge variant={STATUS_VARIANT[rep.status]}>
                  {rep.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{rep.email}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={rep.status}
              onValueChange={(v) => handleStatusChange(v)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="deactivated">Deactivated</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAwardPoints(true)}
            >
              <Coins size={14} /> Award Points
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowInvite(true);
                setInviteResult(null);
              }}
            >
              <Send size={14} /> Generate Invite
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDelete(true)}
              className="text-muted-foreground hover:text-destructive hover:border-destructive/50"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="py-0 gap-0 group hover:border-primary/20 transition-all duration-300">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/10">
                <Trophy size={16} className="text-primary/70" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Level</p>
                <p className="font-mono text-lg font-bold tabular-nums text-foreground">
                  {rep.level}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0 gap-0 group hover:border-primary/20 transition-all duration-300">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/10">
                <Coins size={16} className="text-primary/70" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Points</p>
                <p className="font-mono text-lg font-bold tabular-nums text-primary">
                  {rep.points_balance}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0 gap-0 group hover:border-primary/20 transition-all duration-300">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/10">
                <ShoppingBag size={16} className="text-primary/70" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Sales</p>
                <p className="font-mono text-lg font-bold tabular-nums text-foreground">
                  {rep.total_sales}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0 gap-0 group hover:border-primary/20 transition-all duration-300">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/10">
                <TrendingUp size={16} className="text-primary/70" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Revenue</p>
                <p className="font-mono text-lg font-bold tabular-nums text-foreground">
                  £{Number(rep.total_revenue).toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Profile, Points, Events, Rewards */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Profile</TabsTrigger>
          <TabsTrigger value="points">Points</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="rewards">Rewards</TabsTrigger>
        </TabsList>

        {/* ── Profile Tab ──────────────────────────────────────────── */}
        <TabsContent value="overview">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Personal Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Personal Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow
                    icon={User}
                    label="First Name"
                    value={rep.first_name}
                  />
                  <InfoRow
                    icon={User}
                    label="Last Name"
                    value={rep.last_name || "—"}
                  />
                  <InfoRow
                    icon={User}
                    label="Display Name"
                    value={rep.display_name || "—"}
                  />
                  <InfoRow
                    icon={Mail}
                    label="Email"
                    value={rep.email}
                  />
                  <InfoRow
                    icon={Phone}
                    label="Phone"
                    value={rep.phone || "—"}
                  />
                  <InfoRow
                    icon={User}
                    label="Gender"
                    value={
                      rep.gender
                        ? rep.gender.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                        : "—"
                    }
                  />
                  <InfoRow
                    icon={Calendar}
                    label="Date of Birth"
                    value={rep.date_of_birth || "—"}
                  />
                  <InfoRow
                    icon={Calendar}
                    label="Joined"
                    value={new Date(rep.created_at).toLocaleDateString(
                      "en-GB",
                      { day: "numeric", month: "short", year: "numeric" }
                    )}
                  />
                </div>
                {rep.bio && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-[11px] text-muted-foreground mb-1">
                      Bio
                    </p>
                    <p className="text-sm text-foreground">{rep.bio}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Social + Onboarding */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Social Accounts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E1306C]/10">
                      <Instagram
                        size={14}
                        className="text-[#E1306C]"
                      />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">
                        Instagram
                      </p>
                      {rep.instagram ? (
                        <a
                          href={`https://instagram.com/${rep.instagram}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-foreground hover:text-primary transition-colors"
                        >
                          @{rep.instagram}
                        </a>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Not linked
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/10">
                      <Globe size={14} className="text-foreground/70" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">
                        TikTok
                      </p>
                      {rep.tiktok ? (
                        <a
                          href={`https://tiktok.com/@${rep.tiktok}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-foreground hover:text-primary transition-colors"
                        >
                          @{rep.tiktok}
                        </a>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Not linked
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Onboarding</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Onboarding Completed
                    </span>
                    <Badge
                      variant={
                        rep.onboarding_completed ? "success" : "warning"
                      }
                    >
                      {rep.onboarding_completed ? "Yes" : "No"}
                    </Badge>
                  </div>
                  {rep.invite_token && (
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">
                        Invite Token
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 truncate rounded-md bg-muted/30 px-2.5 py-1.5 text-xs font-mono text-muted-foreground">
                          {rep.invite_token}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() =>
                            copyToClipboard(rep.invite_token!, "token")
                          }
                        >
                          {copiedField === "token" ? (
                            <Check size={12} className="text-success" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── Points Tab ───────────────────────────────────────────── */}
        <TabsContent value="points">
          <Card className="py-0 gap-0">
            {loadingPoints ? (
              <CardContent className="flex items-center justify-center py-12">
                <Loader2
                  size={18}
                  className="animate-spin text-primary/60"
                />
                <span className="ml-3 text-sm text-muted-foreground">
                  Loading points history...
                </span>
              </CardContent>
            ) : points.length === 0 ? (
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
                  <Coins size={20} className="text-primary/60" />
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">
                  No points history yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Points will appear here as the rep earns or spends them
                </p>
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {points.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleDateString(
                          "en-GB",
                          {
                            day: "numeric",
                            month: "short",
                          }
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {entry.source_type}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-xs tabular-nums ${
                          entry.points >= 0
                            ? "text-success"
                            : "text-destructive"
                        }`}
                      >
                        {entry.points >= 0 ? "+" : ""}
                        {entry.points}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {entry.balance_after}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* ── Events Tab ───────────────────────────────────────────── */}
        <TabsContent value="events">
          <Card className="py-0 gap-0">
            {loadingEvents ? (
              <CardContent className="flex items-center justify-center py-12">
                <Loader2
                  size={18}
                  className="animate-spin text-primary/60"
                />
                <span className="ml-3 text-sm text-muted-foreground">
                  Loading events...
                </span>
              </CardContent>
            ) : events.length === 0 ? (
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
                  <Calendar size={20} className="text-primary/60" />
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">
                  Not assigned to any events
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Assign this rep to events from the event editor
                </p>
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((re) => (
                    <TableRow key={re.id}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {re.event?.name || re.event_id}
                          </p>
                          {re.event?.slug && (
                            <p className="text-[11px] text-muted-foreground">
                              /{re.event.slug}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {re.event?.status && (
                          <Badge
                            variant={
                              re.event.status === "published"
                                ? "success"
                                : re.event.status === "draft"
                                  ? "secondary"
                                  : "warning"
                            }
                            className="text-[10px]"
                          >
                            {re.event.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(re.assigned_at).toLocaleDateString(
                          "en-GB",
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          }
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {re.sales_count}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        £{Number(re.revenue).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* ── Rewards Tab ──────────────────────────────────────────── */}
        <TabsContent value="rewards">
          <Card className="py-0 gap-0">
            {loadingClaims ? (
              <CardContent className="flex items-center justify-center py-12">
                <Loader2
                  size={18}
                  className="animate-spin text-primary/60"
                />
                <span className="ml-3 text-sm text-muted-foreground">
                  Loading rewards...
                </span>
              </CardContent>
            ) : claims.length === 0 ? (
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
                  <Trophy size={20} className="text-primary/60" />
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">
                  No rewards claimed yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reward claims will appear here when the rep redeems points
                </p>
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reward</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">
                      Points Spent
                    </TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claims.map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell className="text-sm font-medium">
                        {claim.reward?.name || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className="text-[10px]"
                        >
                          {claim.claim_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            claim.status === "fulfilled"
                              ? "success"
                              : claim.status === "cancelled"
                                ? "destructive"
                                : "warning"
                          }
                        >
                          {claim.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {claim.points_spent}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(claim.created_at).toLocaleDateString(
                          "en-GB",
                          {
                            day: "numeric",
                            month: "short",
                          }
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Award Points Dialog ─────────────────────────────────────── */}
      <Dialog open={showAwardPoints} onOpenChange={setShowAwardPoints}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Award Points</DialogTitle>
            <DialogDescription>
              Manually award or revoke points for {displayName}. Use negative
              values to deduct.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Points *</Label>
              <Input
                type="number"
                value={awardAmount}
                onChange={(e) => setAwardAmount(e.target.value)}
                placeholder="e.g. 50 or -25"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Current balance: {rep.points_balance} pts
              </p>
            </div>
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea
                value={awardDescription}
                onChange={(e) => setAwardDescription(e.target.value)}
                placeholder="Why are you awarding/revoking these points?"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAwardPoints(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAwardPoints}
              disabled={
                awarding || !awardAmount || !awardDescription.trim()
              }
            >
              {awarding && (
                <Loader2 size={14} className="animate-spin" />
              )}
              {Number(awardAmount) >= 0 ? "Award Points" : "Deduct Points"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Generate Invite Dialog ──────────────────────────────────── */}
      <Dialog
        open={showInvite}
        onOpenChange={(open) => {
          if (!open) {
            setShowInvite(false);
            setInviteResult(null);
          }
        }}
      >
        <DialogContent>
          {!inviteResult ? (
            <>
              <DialogHeader>
                <DialogTitle>Generate Invite Link</DialogTitle>
                <DialogDescription>
                  Generate a new invite link and discount code for{" "}
                  {displayName}. This will create a fresh invite token and a
                  new discount code.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowInvite(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerateInvite}
                  disabled={inviting}
                >
                  {inviting && (
                    <Loader2 size={14} className="animate-spin" />
                  )}
                  {inviting ? "Generating..." : "Generate"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Invite Ready</DialogTitle>
                <DialogDescription>
                  Send this link to {displayName}. The discount code is
                  ready to use.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Invite Link</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={inviteResult.invite_url}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() =>
                        copyToClipboard(
                          inviteResult.invite_url,
                          "invite_url"
                        )
                      }
                    >
                      {copiedField === "invite_url" ? (
                        <Check size={14} className="text-success" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Discount Code</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={inviteResult.discount_code}
                      readOnly
                      className="font-mono text-xs tracking-wider uppercase"
                    />
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() =>
                        copyToClipboard(
                          inviteResult.discount_code,
                          "discount_code"
                        )
                      }
                    >
                      {copiedField === "discount_code" ? (
                        <Check size={14} className="text-success" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowInvite(false);
                    setInviteResult(null);
                    loadRep();
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Rep Dialog ───────────────────────────────────────── */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Rep</DialogTitle>
            <DialogDescription>
              Permanently delete <strong>{displayName}</strong>? This removes
              all their data including points, sales history, quest
              submissions, and discount codes. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDelete(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteRep}
              disabled={deleting}
            >
              {deleting && (
                <Loader2 size={14} className="animate-spin" />
              )}
              {deleting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Reusable info row for profile display ────────────────────────────────
function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
        <Icon size={10} className="shrink-0" />
        {label}
      </p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
