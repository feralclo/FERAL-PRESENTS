"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { StatCard } from "@/components/ui/stat-card";
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
  Eye,
  Search,
  Gift,
  Swords,
  Pencil,
  Trash2,
  Target,
  ShoppingCart,
  Award,
  Save,
  RotateCcw,
  Image as ImageIcon,
  Link as LinkIcon,
  ExternalLink,
} from "lucide-react";
import type {
  Rep,
  RepStatus,
  RepProgramStats,
  RepReward,
  RewardType,
  RepMilestone,
  MilestoneType,
  RepQuest,
  QuestType,
  QuestStatus,
  RepQuestSubmission,
  RepProgramSettings,
} from "@/types/reps";
import { DEFAULT_REP_PROGRAM_SETTINGS } from "@/types/reps";

// ─── Status badge map ─────────────────────────────────────────────────
type FilterTab = "active" | "pending" | "all";

const STATUS_VARIANT: Record<RepStatus, "success" | "warning" | "secondary" | "destructive"> = {
  active: "success",
  pending: "warning",
  suspended: "destructive",
  deactivated: "secondary",
};

const REWARD_TYPE_LABELS: Record<RewardType, string> = {
  milestone: "Milestone",
  points_shop: "Points Shop",
  manual: "Manual",
};

const REWARD_TYPE_ICONS: Record<RewardType, typeof Target> = {
  milestone: Target,
  points_shop: ShoppingCart,
  manual: Award,
};

const QUEST_TYPE_LABELS: Record<QuestType, string> = {
  social_post: "Social Post",
  story_share: "Story Share",
  content_creation: "Content Creation",
  custom: "Custom",
};

const QUEST_STATUS_VARIANT: Record<QuestStatus, "success" | "warning" | "secondary" | "outline"> = {
  active: "success",
  paused: "warning",
  archived: "secondary",
  draft: "outline",
};

// ═══════════════════════════════════════════════════════════════════════
// MAIN PAGE — Unified Rep Hub
// ═══════════════════════════════════════════════════════════════════════

export default function RepsHubPage() {
  const [activeTab, setActiveTab] = useState("team");

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Page Header */}
      <div>
        <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
          Rep Programme
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recruit, manage, and reward your brand ambassadors
        </p>
      </div>

      {/* Internal Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="team">
            <UsersRound size={14} className="mr-1.5" />
            Team
          </TabsTrigger>
          <TabsTrigger value="rewards">
            <Gift size={14} className="mr-1.5" />
            Rewards
          </TabsTrigger>
          <TabsTrigger value="quests">
            <Swords size={14} className="mr-1.5" />
            Quests
          </TabsTrigger>
          <TabsTrigger value="settings">
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="team">
          <TeamTab />
        </TabsContent>
        <TabsContent value="rewards">
          <RewardsTab />
        </TabsContent>
        <TabsContent value="quests">
          <QuestsTab />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TEAM TAB
// ═══════════════════════════════════════════════════════════════════════

function TeamTab() {
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
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setDeleteRepTarget(rep)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Delete rep"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ── Delete Rep Confirmation ── */}
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

      {/* ── Invite Rep Dialog (simplified: just first name) ── */}
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

// ═══════════════════════════════════════════════════════════════════════
// REWARDS TAB
// ═══════════════════════════════════════════════════════════════════════

interface Product {
  id: string;
  name: string;
  images?: string[];
  price?: number;
  type?: string;
}

function RewardsTab() {
  const [rewards, setRewards] = useState<RepReward[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Create / Edit
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [rewardType, setRewardType] = useState<RewardType>("points_shop");
  const [pointsCost, setPointsCost] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [totalAvailable, setTotalAvailable] = useState("");
  const [productId, setProductId] = useState("");
  const [rewardStatus, setRewardStatus] = useState<"active" | "archived">("active");

  // Milestones
  const [showMilestone, setShowMilestone] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<RepMilestone[]>([]);
  const [mTitle, setMTitle] = useState("");
  const [mType, setMType] = useState<MilestoneType>("sales_count");
  const [mThreshold, setMThreshold] = useState("");
  const [savingMilestone, setSavingMilestone] = useState(false);

  // Error feedback
  const [saveError, setSaveError] = useState("");

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<RepReward | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadRewards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reps/rewards");
      const json = await res.json();
      if (json.data) setRewards(json.data);
    } catch { /* network */ }
    setLoading(false);
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/merch");
      const json = await res.json();
      if (json.data) setProducts(json.data);
    } catch { /* network */ }
  }, []);

  useEffect(() => { loadRewards(); loadProducts(); }, [loadRewards, loadProducts]);

  const loadMilestones = useCallback(async (rewardId: string) => {
    try {
      const res = await fetch(`/api/reps/milestones?reward_id=${rewardId}`);
      const json = await res.json();
      if (json.data) setMilestones(json.data);
    } catch { /* network */ }
  }, []);

  const openCreate = () => {
    setEditId(null);
    setName("");
    setDescription("");
    setImageUrl("");
    setRewardType("points_shop");
    setPointsCost("");
    setCustomValue("");
    setTotalAvailable("");
    setProductId("");
    setRewardStatus("active");
    setSaveError("");
    setShowDialog(true);
  };

  const openEdit = (r: RepReward) => {
    setEditId(r.id);
    setName(r.name);
    setDescription(r.description || "");
    setImageUrl(r.image_url || "");
    setRewardType(r.reward_type);
    setPointsCost(r.points_cost != null ? String(r.points_cost) : "");
    setCustomValue(r.custom_value || "");
    setTotalAvailable(r.total_available != null ? String(r.total_available) : "");
    setProductId(r.product_id || "");
    setRewardStatus(r.status === "archived" ? "archived" : "active");
    setSaveError("");
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setSaveError("");
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      image_url: imageUrl.trim() || null,
      reward_type: rewardType,
      points_cost: pointsCost ? Number(pointsCost) : null,
      custom_value: customValue.trim() || null,
      total_available: totalAvailable ? Number(totalAvailable) : null,
      product_id: productId || null,
      ...(editId ? { status: rewardStatus } : {}),
    };
    try {
      const url = editId ? `/api/reps/rewards/${editId}` : "/api/reps/rewards";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        setSaveError("");
        setShowDialog(false);
        loadRewards();
      } else {
        const json = await res.json().catch(() => ({ error: "Unknown error" }));
        setSaveError(json.error || `Failed (${res.status})`);
      }
    } catch {
      setSaveError("Network error — check connection");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/reps/rewards/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      loadRewards();
    } catch { /* network */ }
    setDeleting(false);
  };

  const handleAddMilestone = async () => {
    if (!showMilestone || !mTitle.trim() || !mThreshold) return;
    setSavingMilestone(true);
    try {
      const res = await fetch("/api/reps/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reward_id: showMilestone,
          milestone_type: mType,
          threshold_value: Number(mThreshold),
          title: mTitle.trim(),
        }),
      });
      if (res.ok) { setMTitle(""); setMThreshold(""); loadMilestones(showMilestone); }
    } catch { /* network */ }
    setSavingMilestone(false);
  };

  const handleDeleteMilestone = async (id: string) => {
    try {
      await fetch(`/api/reps/milestones/${id}`, { method: "DELETE" });
      if (showMilestone) loadMilestones(showMilestone);
    } catch { /* network */ }
  };

  // When selecting a product, auto-populate image
  const handleProductSelect = (val: string) => {
    const pid = val === "none" ? "" : val;
    setProductId(pid);
    if (pid) {
      const product = products.find((p) => p.id === pid);
      if (product) {
        if (!name) setName(product.name);
        if (!imageUrl && product.images?.[0]) setImageUrl(product.images[0]);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Create milestone rewards and points shop items for your reps
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} /> Create Reward
        </Button>
      </div>

      {/* Rewards Grid */}
      {loading ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-primary/60" />
            <span className="ml-3 text-sm text-muted-foreground">Loading rewards...</span>
          </CardContent>
        </Card>
      ) : rewards.length === 0 ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
              <Gift size={20} className="text-primary/60" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">No rewards yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Create rewards to incentivize your reps</p>
            <Button size="sm" className="mt-4" onClick={openCreate}><Plus size={14} /> Create Reward</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rewards.map((reward) => {
            const Icon = REWARD_TYPE_ICONS[reward.reward_type];
            return (
              <Card key={reward.id} className="py-0 gap-0 overflow-hidden">
                {reward.image_url && (
                  <div className="relative h-32 bg-muted/30 flex items-center justify-center">
                    <img src={reward.image_url} alt={reward.name} className="max-h-full max-w-full object-contain p-4" />
                  </div>
                )}
                <CardContent className={`p-4 ${!reward.image_url ? "pt-4" : ""}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-primary shrink-0" />
                      <h3 className="text-sm font-medium text-foreground">{reward.name}</h3>
                    </div>
                    <Badge variant={reward.status === "active" ? "success" : "secondary"} className="text-[10px]">
                      {reward.status}
                    </Badge>
                  </div>
                  {reward.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{reward.description}</p>}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                    <span className="font-mono">{REWARD_TYPE_LABELS[reward.reward_type]}</span>
                    {reward.points_cost != null && <span className="font-mono text-primary font-bold">{reward.points_cost} pts</span>}
                    <span className="tabular-nums">{reward.total_claimed}/{reward.total_available ?? "∞"} claimed</span>
                  </div>
                  {reward.product_id && (
                    <div className="flex items-center gap-1.5 text-[10px] text-primary/70 mb-3">
                      <ShoppingCart size={10} /> Linked to merch product
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-xs" onClick={() => openEdit(reward)} title="Edit"><Pencil size={13} /></Button>
                    {reward.reward_type === "milestone" && (
                      <Button variant="ghost" size="icon-xs" onClick={() => { setShowMilestone(reward.id); loadMilestones(reward.id); }} title="Milestones"><Target size={13} /></Button>
                    )}
                    <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(reward)} className="text-muted-foreground hover:text-destructive" title="Archive"><Trash2 size={13} /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Reward" : "Create Reward"}</DialogTitle>
            <DialogDescription>{editId ? "Update this reward." : "Create a new reward. You can link it to an existing merch product."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            {/* Link to merch product */}
            {products.length > 0 && (
              <div className="space-y-2">
                <Label>Link to Merch Product</Label>
                <Select value={productId || "none"} onValueChange={handleProductSelect}>
                  <SelectTrigger><SelectValue placeholder="None — create custom reward" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None — custom reward</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Link to a product from your merch catalog to auto-populate name and image.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Free Merch Bundle" autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does the rep get?" rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Image URL</Label>
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Transparent PNG recommended" />
              {imageUrl && (
                <div className="h-20 rounded-lg bg-muted/30 flex items-center justify-center">
                  <img src={imageUrl} alt="Preview" className="max-h-full max-w-full object-contain p-2" />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={rewardType} onValueChange={(v) => setRewardType(v as RewardType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="milestone">Milestone</SelectItem>
                    <SelectItem value="points_shop">Points Shop</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {rewardType === "points_shop" && (
                <div className="space-y-2">
                  <Label>Points Cost</Label>
                  <Input type="number" value={pointsCost} onChange={(e) => setPointsCost(e.target.value)} placeholder="e.g. 500" min="0" />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Custom Value</Label>
                <Input value={customValue} onChange={(e) => setCustomValue(e.target.value)} placeholder="e.g. VIP Access" />
              </div>
              <div className="space-y-2">
                <Label>Total Available</Label>
                <Input type="number" value={totalAvailable} onChange={(e) => setTotalAvailable(e.target.value)} placeholder="Unlimited" min="1" />
              </div>
            </div>
            {editId && (
              <div className="space-y-2">
                <Label>Status</Label>
                <select
                  value={rewardStatus}
                  onChange={(e) => setRewardStatus(e.target.value as "active" | "archived")}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            )}
          </div>
          {saveError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive">
              {saveError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Saving..." : editId ? "Save Changes" : "Create Reward"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Milestones Dialog */}
      <Dialog open={!!showMilestone} onOpenChange={(open) => !open && setShowMilestone(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Milestones</DialogTitle>
            <DialogDescription>Set thresholds that automatically award this reward when hit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {milestones.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Threshold</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {milestones.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm">{m.title}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.milestone_type}</TableCell>
                      <TableCell className="font-mono text-xs">{m.threshold_value}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon-xs" onClick={() => handleDeleteMilestone(m.id)} className="hover:text-destructive"><Trash2 size={12} /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-[11px]">Title</Label>
                <Input value={mTitle} onChange={(e) => setMTitle(e.target.value)} placeholder="Sell 10 Tickets" className="h-8 text-xs" />
              </div>
              <div className="w-32 space-y-1">
                <Label className="text-[11px]">Type</Label>
                <Select value={mType} onValueChange={(v) => setMType(v as MilestoneType)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales_count">Sales</SelectItem>
                    <SelectItem value="revenue">Revenue</SelectItem>
                    <SelectItem value="points">Points</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-20 space-y-1">
                <Label className="text-[11px]">Value</Label>
                <Input type="number" value={mThreshold} onChange={(e) => setMThreshold(e.target.value)} className="h-8 text-xs" min="1" />
              </div>
              <Button size="sm" onClick={handleAddMilestone} disabled={savingMilestone || !mTitle.trim() || !mThreshold} className="h-8">
                <Plus size={12} />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMilestone(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Reward</DialogTitle>
            <DialogDescription>Archive <strong>{deleteTarget?.name}</strong>? It will no longer be available to reps.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 size={14} className="animate-spin" />}
              {deleting ? "Archiving..." : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// QUESTS TAB
// ═══════════════════════════════════════════════════════════════════════

function QuestsTab() {
  const [quests, setQuests] = useState<RepQuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | QuestStatus>("active");

  // Create/Edit
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [questType, setQuestType] = useState<QuestType>("social_post");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [pointsReward, setPointsReward] = useState("");
  const [maxCompletions, setMaxCompletions] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notifyReps, setNotifyReps] = useState(true);

  // Submissions review
  const [showSubmissions, setShowSubmissions] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<RepQuestSubmission[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const loadQuests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      const res = await fetch(`/api/reps/quests?${params}`);
      const json = await res.json();
      if (json.data) setQuests(json.data);
    } catch { /* network */ }
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadQuests(); }, [loadQuests]);

  const loadSubmissions = useCallback(async (questId: string) => {
    setLoadingSubs(true);
    try {
      const res = await fetch(`/api/reps/quests/${questId}/submissions`);
      const json = await res.json();
      if (json.data) setSubmissions(json.data);
    } catch { /* network */ }
    setLoadingSubs(false);
  }, []);

  const openCreate = () => {
    setEditId(null); setTitle(""); setDescription(""); setInstructions("");
    setQuestType("social_post"); setImageUrl(""); setVideoUrl("");
    setPointsReward("50"); setMaxCompletions(""); setExpiresAt(""); setNotifyReps(true);
    setShowDialog(true);
  };

  const openEdit = (q: RepQuest) => {
    setEditId(q.id); setTitle(q.title); setDescription(q.description || "");
    setInstructions(q.instructions || ""); setQuestType(q.quest_type);
    setImageUrl(q.image_url || ""); setVideoUrl(q.video_url || "");
    setPointsReward(String(q.points_reward));
    setMaxCompletions(q.max_completions != null ? String(q.max_completions) : "");
    setExpiresAt(q.expires_at ? q.expires_at.slice(0, 16) : ""); setNotifyReps(q.notify_reps);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const body = {
      title: title.trim(), description: description.trim() || null,
      instructions: instructions.trim() || null, quest_type: questType,
      image_url: imageUrl.trim() || null, video_url: videoUrl.trim() || null,
      points_reward: Number(pointsReward) || 0,
      max_completions: maxCompletions ? Number(maxCompletions) : null,
      expires_at: expiresAt || null, notify_reps: notifyReps,
    };
    try {
      const url = editId ? `/api/reps/quests/${editId}` : "/api/reps/quests";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { setShowDialog(false); loadQuests(); }
    } catch { /* network */ }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try { await fetch(`/api/reps/quests/${id}`, { method: "DELETE" }); loadQuests(); } catch { /* network */ }
  };

  const handleReview = async (submissionId: string, status: "approved" | "rejected", reason?: string) => {
    setReviewingId(submissionId);
    try {
      await fetch(`/api/reps/quests/submissions/${submissionId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejection_reason: reason }),
      });
      if (showSubmissions) loadSubmissions(showSubmissions);
    } catch { /* network */ }
    setReviewingId(null);
  };

  const filtered = filter === "all" ? quests : quests.filter((q) => q.status === filter);
  const counts = {
    all: quests.length,
    active: quests.filter((q) => q.status === "active").length,
    paused: quests.filter((q) => q.status === "paused").length,
    archived: quests.filter((q) => q.status === "archived").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1 w-fit">
          {(["active", "paused", "archived", "all"] as const).map((t) => (
            <button key={t} onClick={() => setFilter(t)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filter === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              <span className="ml-1.5 text-[10px] tabular-nums text-muted-foreground/60">{counts[t]}</span>
            </button>
          ))}
        </div>
        <Button size="sm" onClick={openCreate}><Plus size={14} /> Create Quest</Button>
      </div>

      {loading ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-primary/60" />
            <span className="ml-3 text-sm text-muted-foreground">Loading quests...</span>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
              <Swords size={20} className="text-primary/60" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">No quests yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Create quests to engage your reps</p>
            <Button size="sm" className="mt-4" onClick={openCreate}><Plus size={14} /> Create Quest</Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0 gap-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quest</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Points</TableHead>
                <TableHead className="hidden md:table-cell">Completions</TableHead>
                <TableHead className="hidden lg:table-cell">Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((quest) => (
                <TableRow key={quest.id}>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium text-foreground">{quest.title}</p>
                      {quest.description && <p className="mt-0.5 text-[11px] text-muted-foreground truncate max-w-[250px]">{quest.description}</p>}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{QUEST_TYPE_LABELS[quest.quest_type]}</Badge></TableCell>
                  <TableCell className="font-mono text-xs text-primary font-bold tabular-nums">+{quest.points_reward}</TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-xs tabular-nums text-muted-foreground">
                    {quest.total_completed}{quest.max_total != null ? ` / ${quest.max_total}` : ""}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    {quest.expires_at ? new Date(quest.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                  </TableCell>
                  <TableCell><Badge variant={QUEST_STATUS_VARIANT[quest.status]}>{quest.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-xs" onClick={() => { setShowSubmissions(quest.id); loadSubmissions(quest.id); }} title="View submissions"><Eye size={13} /></Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => openEdit(quest)} title="Edit"><Pencil size={13} /></Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => handleDelete(quest.id)} className="text-muted-foreground hover:text-destructive" title="Archive"><Trash2 size={13} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Quest" : "Create Quest"}</DialogTitle>
            <DialogDescription>{editId ? "Update this quest." : "Create a new quest for your reps to complete."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Share on Instagram Stories" autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What should reps do?" rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Step-by-step instructions..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={questType} onValueChange={(v) => setQuestType(v as QuestType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="social_post">Social Post</SelectItem>
                    <SelectItem value="story_share">Story Share</SelectItem>
                    <SelectItem value="content_creation">Content Creation</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Points Reward</Label>
                <Input type="number" value={pointsReward} onChange={(e) => setPointsReward(e.target.value)} min="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Reference Image URL</Label>
                <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Show them what to create" />
              </div>
              <div className="space-y-2">
                <Label>Reference Video URL</Label>
                <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="TikTok / YouTube link" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Completions per Rep</Label>
                <Input type="number" value={maxCompletions} onChange={(e) => setMaxCompletions(e.target.value)} placeholder="Unlimited" min="1" />
              </div>
              <div className="space-y-2">
                <Label>Expires At</Label>
                <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Notify Reps</p>
                <p className="text-[11px] text-muted-foreground">Send email notification to all assigned reps</p>
              </div>
              <Switch checked={notifyReps} onCheckedChange={setNotifyReps} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !title.trim()}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Saving..." : editId ? "Save Changes" : "Create Quest"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submissions Review Dialog */}
      <Dialog open={!!showSubmissions} onOpenChange={(open) => !open && setShowSubmissions(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Quest Submissions</DialogTitle>
            <DialogDescription>Review proof submitted by reps.</DialogDescription>
          </DialogHeader>
          {loadingSubs ? (
            <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-primary/60" /></div>
          ) : submissions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No submissions yet</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto space-y-3">
              {submissions.map((sub) => (
                <div key={sub.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {sub.rep?.display_name || `${sub.rep?.first_name || ""} ${sub.rep?.last_name || ""}`}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(sub.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <Badge variant={sub.status === "approved" ? "success" : sub.status === "rejected" ? "destructive" : "warning"}>
                      {sub.status}
                    </Badge>
                  </div>
                  <div className="rounded-md bg-muted/30 p-3 mb-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Proof ({sub.proof_type})</p>
                    {sub.proof_type === "screenshot" && sub.proof_url && <img src={sub.proof_url} alt="Proof" className="max-h-40 rounded-md" />}
                    {sub.proof_type === "url" && sub.proof_text && (
                      <a href={sub.proof_text} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">{sub.proof_text}</a>
                    )}
                    {sub.proof_type === "text" && sub.proof_text && <p className="text-sm text-foreground">{sub.proof_text}</p>}
                  </div>
                  {sub.status === "pending" && (
                    <div className="space-y-2">
                      {rejectingId === sub.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Reason for rejection..."
                            className="text-sm min-h-[60px]"
                            autoFocus
                          />
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="destructive" disabled={!rejectReason.trim() || reviewingId === sub.id}
                              onClick={() => { handleReview(sub.id, "rejected", rejectReason.trim()); setRejectingId(null); setRejectReason(""); }}>
                              {reviewingId === sub.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} Confirm Reject
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setRejectingId(null); setRejectReason(""); }}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => handleReview(sub.id, "approved")} disabled={reviewingId === sub.id}>
                            {reviewingId === sub.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setRejectingId(sub.id)} disabled={reviewingId === sub.id}>
                            <X size={12} /> Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {sub.rejection_reason && <p className="mt-2 text-xs text-destructive">Reason: {sub.rejection_reason}</p>}
                </div>
              ))}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setShowSubmissions(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════

function SettingsTab() {
  const [settings, setSettings] = useState<RepProgramSettings>(DEFAULT_REP_PROGRAM_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reps/settings");
      const json = await res.json();
      if (json.data) setSettings({ ...DEFAULT_REP_PROGRAM_SETTINGS, ...json.data });
    } catch { /* network */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/reps/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    } catch { /* network */ }
    setSaving(false);
  };

  const update = <K extends keyof RepProgramSettings>(key: K, value: RepProgramSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-primary/60" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setSettings(DEFAULT_REP_PROGRAM_SETTINGS)}>
          <RotateCcw size={14} /> Reset
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Save size={14} className="text-success" /> : <Save size={14} />}
          {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">General</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Programme Enabled</p>
                <p className="text-[11px] text-muted-foreground">Accept applications and track sales</p>
              </div>
              <Switch checked={settings.enabled} onCheckedChange={(v) => update("enabled", v)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Auto-Approve Applications</p>
                <p className="text-[11px] text-muted-foreground">Skip manual review for new signups</p>
              </div>
              <Switch checked={settings.auto_approve} onCheckedChange={(v) => update("auto_approve", v)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Leaderboard Visible</p>
                <p className="text-[11px] text-muted-foreground">Reps can see the full leaderboard</p>
              </div>
              <Switch checked={settings.leaderboard_visible} onCheckedChange={(v) => update("leaderboard_visible", v)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Points & Levels</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Points per Sale (per ticket)</Label>
              <div className="flex items-center gap-3">
                <Slider value={[settings.points_per_sale]} onValueChange={([v]) => update("points_per_sale", v)} min={1} max={100} step={1} className="flex-1" />
                <span className="font-mono text-sm font-bold text-primary w-10 text-right tabular-nums">{settings.points_per_sale}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Level Names (comma-separated)</Label>
              <Input
                value={settings.level_names.join(", ")}
                onChange={(e) => update("level_names", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                placeholder="Rookie, Starter, Rising, ..." className="text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>Level Thresholds (comma-separated points)</Label>
              <Input
                value={settings.level_thresholds.join(", ")}
                onChange={(e) => update("level_thresholds", e.target.value.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0))}
                placeholder="100, 300, 600, ..." className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">L1 starts at 0 points. Each value is the threshold for the next level.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Discount Code Defaults</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Default Type</Label>
                <Select value={settings.default_discount_type} onValueChange={(v) => update("default_discount_type", v as "percentage" | "fixed")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount (£)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Default Value</Label>
                <Input type="number" value={String(settings.default_discount_percent)} onChange={(e) => update("default_discount_percent", Number(e.target.value) || 0)} min="0" max={settings.default_discount_type === "percentage" ? "100" : undefined} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Email Settings</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>From Name</Label>
              <Input value={settings.email_from_name} onChange={(e) => update("email_from_name", e.target.value)} placeholder="Entry Reps" />
            </div>
            <div className="space-y-2">
              <Label>From Address</Label>
              <Input type="email" value={settings.email_from_address} onChange={(e) => update("email_from_address", e.target.value)} placeholder="reps@yourdomain.com" />
            </div>
            <div className="space-y-2">
              <Label>Welcome Message</Label>
              <Textarea value={settings.welcome_message || ""} onChange={(e) => update("welcome_message", e.target.value || null)} placeholder="Custom welcome message shown on the signup page..." rows={3} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
