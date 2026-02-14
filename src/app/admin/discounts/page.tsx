"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  Ticket,
  Plus,
  Loader2,
  Trash2,
  Pencil,
  Copy,
  Check,
} from "lucide-react";
import type { Discount, DiscountType, DiscountStatus } from "@/types/discounts";

type FilterTab = "all" | DiscountStatus;

const STATUS_VARIANT: Record<DiscountStatus, "success" | "secondary"> = {
  active: "success",
  inactive: "secondary",
};

function formatValue(type: DiscountType, value: number): string {
  return type === "percentage" ? `${value}%` : `£${Number(value).toFixed(2)}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function DiscountsPage() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");

  // Create dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newType, setNewType] = useState<DiscountType>("percentage");
  const [newValue, setNewValue] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newMinOrder, setNewMinOrder] = useState("");
  const [newStartsAt, setNewStartsAt] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");

  // Edit dialog state
  const [editDiscount, setEditDiscount] = useState<Discount | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editType, setEditType] = useState<DiscountType>("percentage");
  const [editValue, setEditValue] = useState("");
  const [editMaxUses, setEditMaxUses] = useState("");
  const [editMinOrder, setEditMinOrder] = useState("");
  const [editStartsAt, setEditStartsAt] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editStatus, setEditStatus] = useState<DiscountStatus>("active");
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Discount | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadDiscounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/discounts");
      const json = await res.json();
      if (json.data) setDiscounts(json.data);
    } catch {
      // Network error
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDiscounts();
  }, [loadDiscounts]);

  const handleCreate = async () => {
    if (!newCode.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode.trim(),
          description: newDescription.trim() || undefined,
          type: newType,
          value: Number(newValue) || 0,
          max_uses: newMaxUses ? Number(newMaxUses) : null,
          min_order_amount: newMinOrder ? Number(newMinOrder) : null,
          starts_at: newStartsAt || null,
          expires_at: newExpiresAt || null,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        resetCreateForm();
        loadDiscounts();
      }
    } catch {
      // Network error
    }
    setCreating(false);
  };

  const handleEdit = async () => {
    if (!editDiscount || !editCode.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/discounts/${editDiscount.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: editCode.trim(),
          description: editDescription.trim() || null,
          type: editType,
          value: Number(editValue) || 0,
          max_uses: editMaxUses ? Number(editMaxUses) : null,
          min_order_amount: editMinOrder ? Number(editMinOrder) : null,
          starts_at: editStartsAt || null,
          expires_at: editExpiresAt || null,
          status: editStatus,
        }),
      });
      if (res.ok) {
        setEditDiscount(null);
        loadDiscounts();
      }
    } catch {
      // Network error
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/discounts/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      loadDiscounts();
    } catch {
      // Network error
    }
    setDeleting(false);
  };

  const openEdit = (d: Discount) => {
    setEditDiscount(d);
    setEditCode(d.code);
    setEditDescription(d.description || "");
    setEditType(d.type);
    setEditValue(String(d.value));
    setEditMaxUses(d.max_uses != null ? String(d.max_uses) : "");
    setEditMinOrder(d.min_order_amount != null ? String(d.min_order_amount) : "");
    setEditStartsAt(d.starts_at ? d.starts_at.slice(0, 16) : "");
    setEditExpiresAt(d.expires_at ? d.expires_at.slice(0, 16) : "");
    setEditStatus(d.status);
  };

  const resetCreateForm = () => {
    setNewCode("");
    setNewDescription("");
    setNewType("percentage");
    setNewValue("");
    setNewMaxUses("");
    setNewMinOrder("");
    setNewStartsAt("");
    setNewExpiresAt("");
  };

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered =
    filter === "all"
      ? discounts
      : discounts.filter((d) => d.status === filter);

  const counts = {
    all: discounts.length,
    active: discounts.filter((d) => d.status === "active").length,
    inactive: discounts.filter((d) => d.status === "inactive").length,
  };

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
            Discounts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage discount codes for your events
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} />
          Create Discount
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1 w-fit">
        {(["all", "active", "inactive"] as FilterTab[]).map((tab) => (
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

      {/* Discounts Table */}
      {loading ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-primary/60" />
            <span className="ml-3 text-sm text-muted-foreground">
              Loading discounts...
            </span>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
              <Ticket size={20} className="text-primary/60" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              {filter === "all" ? "No discounts yet" : `No ${filter} discounts`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {filter === "all"
                ? "Create your first discount code to start offering promotions"
                : "Discounts with this status will appear here"}
            </p>
            {filter === "all" && (
              <Button
                size="sm"
                className="mt-4"
                onClick={() => setShowCreate(true)}
              >
                <Plus size={14} />
                Create Discount
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0 gap-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead className="hidden md:table-cell">Usage</TableHead>
                <TableHead className="hidden lg:table-cell">Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[d.status]}>
                      {d.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold tracking-wider">
                        {d.code}
                      </span>
                      <button
                        className="text-muted-foreground/40 hover:text-foreground transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyCode(d.code, d.id);
                        }}
                        title="Copy code"
                      >
                        {copiedId === d.id ? (
                          <Check size={12} className="text-green-500" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                    {d.description && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground truncate max-w-[200px]">
                        {d.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {formatValue(d.type, d.value)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-xs tabular-nums">
                    {d.used_count}
                    {d.max_uses != null && ` / ${d.max_uses}`}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">
                    {formatDate(d.expires_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => openEdit(d)}
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setDeleteTarget(d)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Delete"
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

      {/* ── Create Dialog ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Discount</DialogTitle>
            <DialogDescription>
              Add a new discount code. Customers enter this at checkout.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Code *</Label>
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="e.g. FERAL10"
                className="font-mono tracking-wider uppercase"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Internal note (not shown to customers)"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background/50 px-3 py-1 text-sm text-foreground transition-colors focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as DiscountType)}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (£)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Value *</Label>
                <Input
                  type="number"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder={newType === "percentage" ? "e.g. 10" : "e.g. 5.00"}
                  min="0"
                  max={newType === "percentage" ? "100" : undefined}
                  step={newType === "percentage" ? "1" : "0.01"}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Uses</Label>
                <Input
                  type="number"
                  value={newMaxUses}
                  onChange={(e) => setNewMaxUses(e.target.value)}
                  placeholder="Unlimited"
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <Label>Min Order (£)</Label>
                <Input
                  type="number"
                  value={newMinOrder}
                  onChange={(e) => setNewMinOrder(e.target.value)}
                  placeholder="None"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Starts At</Label>
                <Input
                  type="datetime-local"
                  value={newStartsAt}
                  onChange={(e) => setNewStartsAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Expires At</Label>
                <Input
                  type="datetime-local"
                  value={newExpiresAt}
                  onChange={(e) => setNewExpiresAt(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newCode.trim() || !newValue}
            >
              {creating && <Loader2 size={14} className="animate-spin" />}
              {creating ? "Creating..." : "Create Discount"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editDiscount} onOpenChange={(open) => !open && setEditDiscount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Discount</DialogTitle>
            <DialogDescription>
              Update the discount code settings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={editStatus === "active"}
                onCheckedChange={(checked) =>
                  setEditStatus(checked ? "active" : "inactive")
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Code *</Label>
              <Input
                value={editCode}
                onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                className="font-mono tracking-wider uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Internal note"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background/50 px-3 py-1 text-sm text-foreground transition-colors focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as DiscountType)}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (£)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Value *</Label>
                <Input
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  min="0"
                  max={editType === "percentage" ? "100" : undefined}
                  step={editType === "percentage" ? "1" : "0.01"}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Uses</Label>
                <Input
                  type="number"
                  value={editMaxUses}
                  onChange={(e) => setEditMaxUses(e.target.value)}
                  placeholder="Unlimited"
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <Label>Min Order (£)</Label>
                <Input
                  type="number"
                  value={editMinOrder}
                  onChange={(e) => setEditMinOrder(e.target.value)}
                  placeholder="None"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Starts At</Label>
                <Input
                  type="datetime-local"
                  value={editStartsAt}
                  onChange={(e) => setEditStartsAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Expires At</Label>
                <Input
                  type="datetime-local"
                  value={editExpiresAt}
                  onChange={(e) => setEditExpiresAt(e.target.value)}
                />
              </div>
            </div>
            {editDiscount && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Used {editDiscount.used_count} time{editDiscount.used_count !== 1 ? "s" : ""}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDiscount(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={saving || !editCode.trim() || !editValue}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Discount</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.code}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 size={14} className="animate-spin" />}
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
