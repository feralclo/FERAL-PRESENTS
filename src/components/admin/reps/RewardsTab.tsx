"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Plus,
  Loader2,
  Gift,
  Pencil,
  Trash2,
  Target,
  ShoppingCart,
  Award,
} from "lucide-react";
import type {
  RepReward,
  RewardType,
  RepMilestone,
  MilestoneType,
} from "@/types/reps";

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

interface Product {
  id: string;
  name: string;
  images?: string[];
  price?: number;
  type?: string;
}

export function RewardsTab() {
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
                    <span className="tabular-nums">{reward.total_claimed}/{reward.total_available ?? "\u221E"} claimed</span>
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
