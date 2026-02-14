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
  Plus,
  Minus,
} from "lucide-react";
import type { Rep, RepStatus, RepPointsLog, RepEvent, RepRewardClaim, RepQuestSubmission } from "@/types/reps";

const STATUS_VARIANT: Record<RepStatus, "success" | "warning" | "secondary" | "destructive"> = {
  active: "success",
  pending: "warning",
  suspended: "destructive",
  deactivated: "secondary",
};

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

  // Award points dialog
  const [showAwardPoints, setShowAwardPoints] = useState(false);
  const [awardAmount, setAwardAmount] = useState("");
  const [awardDescription, setAwardDescription] = useState("");
  const [awarding, setAwarding] = useState(false);

  // Status change
  const [newStatus, setNewStatus] = useState<RepStatus | "">("");

  const [copiedField, setCopiedField] = useState<string | null>(null);

  const loadRep = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reps/${repId}`);
      const json = await res.json();
      if (json.data) {
        setRep(json.data);
        setNewStatus(json.data.status);
      }
    } catch { /* network error */ }
    setLoading(false);
  }, [repId]);

  const loadPoints = useCallback(async () => {
    setLoadingPoints(true);
    try {
      const res = await fetch(`/api/reps/${repId}/points`);
      const json = await res.json();
      if (json.data) setPoints(json.data);
    } catch { /* network error */ }
    setLoadingPoints(false);
  }, [repId]);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch(`/api/reps/events?rep_id=${repId}`);
      const json = await res.json();
      if (json.data) setEvents(json.data);
    } catch { /* network error */ }
    setLoadingEvents(false);
  }, [repId]);

  const loadClaims = useCallback(async () => {
    try {
      const res = await fetch(`/api/reps/claims?rep_id=${repId}`);
      const json = await res.json();
      if (json.data) setClaims(json.data);
    } catch { /* network error */ }
  }, [repId]);

  useEffect(() => {
    loadRep();
  }, [loadRep]);

  useEffect(() => {
    if (tab === "points") loadPoints();
    if (tab === "events") loadEvents();
    if (tab === "rewards") loadClaims();
  }, [tab, loadPoints, loadEvents, loadClaims]);

  const handleStatusChange = async (status: string) => {
    if (!status || !rep) return;
    setSaving(true);
    try {
      await fetch(`/api/reps/${repId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      loadRep();
    } catch { /* network error */ }
    setSaving(false);
  };

  const handleAwardPoints = async () => {
    if (!awardAmount || !awardDescription.trim()) return;
    setAwarding(true);
    try {
      await fetch(`/api/reps/${repId}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points: Number(awardAmount),
          description: awardDescription.trim(),
        }),
      });
      setShowAwardPoints(false);
      setAwardAmount("");
      setAwardDescription("");
      loadRep();
      if (tab === "points") loadPoints();
    } catch { /* network error */ }
    setAwarding(false);
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

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

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Back + Header */}
      <div>
        <Link href="/admin/reps/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft size={12} /> Back to Reps
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary overflow-hidden">
              {rep.photo_url ? (
                <img src={rep.photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                `${rep.first_name.charAt(0)}${rep.last_name?.charAt(0) || ""}`
              )}
            </div>
            <div>
              <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
                {rep.display_name || `${rep.first_name} ${rep.last_name}`}
              </h1>
              <p className="text-sm text-muted-foreground">{rep.email}</p>
            </div>
            <Badge variant={STATUS_VARIANT[rep.status]}>{rep.status}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Select value={newStatus as string} onValueChange={(v) => handleStatusChange(v)}>
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
            <Button size="sm" variant="outline" onClick={() => setShowAwardPoints(true)}>
              <Coins size={14} /> Award Points
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="py-0 gap-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8">
                <Trophy size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Level</p>
                <p className="font-mono text-lg font-bold text-foreground">{rep.level}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0 gap-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8">
                <Coins size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Points</p>
                <p className="font-mono text-lg font-bold text-primary">{rep.points_balance}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0 gap-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8">
                <ShoppingBag size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Sales</p>
                <p className="font-mono text-lg font-bold text-foreground">{rep.total_sales}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0 gap-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8">
                <TrendingUp size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Revenue</p>
                <p className="font-mono text-lg font-bold text-foreground">£{Number(rep.total_revenue).toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Profile</TabsTrigger>
          <TabsTrigger value="points">Points</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="rewards">Rewards</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Rep Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Name</p>
                  <p className="text-sm">{rep.first_name} {rep.last_name}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Display Name</p>
                  <p className="text-sm">{rep.display_name || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Email</p>
                  <p className="text-sm">{rep.email}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Phone</p>
                  <p className="text-sm">{rep.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Instagram</p>
                  <p className="text-sm">{rep.instagram ? `@${rep.instagram}` : "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">TikTok</p>
                  <p className="text-sm">{rep.tiktok ? `@${rep.tiktok}` : "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Gender</p>
                  <p className="text-sm capitalize">{rep.gender?.replace("-", " ") || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Date of Birth</p>
                  <p className="text-sm">{rep.date_of_birth || "—"}</p>
                </div>
              </div>
              {rep.bio && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Bio</p>
                  <p className="text-sm">{rep.bio}</p>
                </div>
              )}
              {rep.invite_token && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Invite Token</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-muted-foreground">{rep.invite_token}</code>
                    <button
                      onClick={() => copyToClipboard(rep.invite_token!, "token")}
                      className="text-muted-foreground/40 hover:text-foreground transition-colors"
                    >
                      {copiedField === "token" ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              )}
              <div className="text-[11px] text-muted-foreground">
                Joined: {new Date(rep.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Points Tab */}
        <TabsContent value="points">
          <Card className="py-0 gap-0">
            {loadingPoints ? (
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 size={18} className="animate-spin text-primary/60" />
              </CardContent>
            ) : points.length === 0 ? (
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No points history yet
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
                        {new Date(entry.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </TableCell>
                      <TableCell className="text-sm">{entry.description}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{entry.source_type}</Badge>
                      </TableCell>
                      <TableCell className={`text-right font-mono text-xs tabular-nums ${entry.points >= 0 ? "text-success" : "text-destructive"}`}>
                        {entry.points >= 0 ? "+" : ""}{entry.points}
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

        {/* Events Tab */}
        <TabsContent value="events">
          <Card className="py-0 gap-0">
            {loadingEvents ? (
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 size={18} className="animate-spin text-primary/60" />
              </CardContent>
            ) : events.length === 0 ? (
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Not assigned to any events yet
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((re) => (
                    <TableRow key={re.id}>
                      <TableCell className="text-sm font-medium">
                        {re.event?.name || re.event_id}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(re.assigned_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
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

        {/* Rewards Tab */}
        <TabsContent value="rewards">
          <Card className="py-0 gap-0">
            {claims.length === 0 ? (
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No rewards claimed yet
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reward</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Points Spent</TableHead>
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
                        <Badge variant="secondary" className="text-[10px]">{claim.claim_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={claim.status === "fulfilled" ? "success" : claim.status === "cancelled" ? "destructive" : "warning"}>
                          {claim.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {claim.points_spent}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(claim.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Award Points Dialog */}
      <Dialog open={showAwardPoints} onOpenChange={setShowAwardPoints}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Award Points</DialogTitle>
            <DialogDescription>
              Manually award or revoke points for this rep. Use negative values to deduct.
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
            <Button variant="outline" onClick={() => setShowAwardPoints(false)}>Cancel</Button>
            <Button
              onClick={handleAwardPoints}
              disabled={awarding || !awardAmount || !awardDescription.trim()}
            >
              {awarding && <Loader2 size={14} className="animate-spin" />}
              {Number(awardAmount) >= 0 ? "Award Points" : "Deduct Points"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
