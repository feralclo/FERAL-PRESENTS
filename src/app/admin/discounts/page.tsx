"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
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
  Zap,
  X,
} from "lucide-react";
import type { Discount, DiscountType, DiscountStatus } from "@/types/discounts";
import { fmtMoney } from "@/lib/format";
import { useOrgCurrency } from "@/hooks/useOrgCurrency";

type FilterTab = "all" | DiscountStatus;

interface EventOption {
  id: string;
  name: string;
}

const STATUS_VARIANT: Record<DiscountStatus, "success" | "secondary"> = {
  active: "success",
  inactive: "secondary",
};

function formatValue(type: DiscountType, value: number, currency: string = "GBP"): string {
  return type === "percentage" ? `${value}%` : fmtMoney(value, currency);
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
  const { currency: orgCurrency, currencySymbol } = useOrgCurrency();
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");

  // Events for event selector
  const [events, setEvents] = useState<EventOption[]>([]);

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
  const [newAutoApply, setNewAutoApply] = useState(false);
  const [newEventIds, setNewEventIds] = useState<string[]>([]);

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
  const [editAutoApply, setEditAutoApply] = useState(false);
  const [editEventIds, setEditEventIds] = useState<string[]>([]);
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

  // Load events for selector
  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((json) => {
        const evts = (json.data || json.events || []) as EventOption[];
        setEvents(evts.map((e) => ({ id: e.id, name: e.name })));
      })
      .catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!newAutoApply && !newCode.trim()) return;
    if (!newValue) return;
    setCreating(true);
    try {
      const res = await fetch("/api/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode.trim() || undefined,
          description: newDescription.trim() || undefined,
          type: newType,
          value: Number(newValue) || 0,
          max_uses: newMaxUses ? Number(newMaxUses) : null,
          min_order_amount: newMinOrder ? Number(newMinOrder) : null,
          starts_at: newStartsAt || null,
          expires_at: newExpiresAt || null,
          auto_apply: newAutoApply,
          applicable_event_ids: newEventIds.length > 0 ? newEventIds : null,
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
    if (!editDiscount) return;
    if (!editAutoApply && !editCode.trim()) return;
    if (!editValue) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/discounts/${editDiscount.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: editCode.trim() || undefined,
          description: editDescription.trim() || null,
          type: editType,
          value: Number(editValue) || 0,
          max_uses: editMaxUses ? Number(editMaxUses) : null,
          min_order_amount: editMinOrder ? Number(editMinOrder) : null,
          starts_at: editStartsAt || null,
          expires_at: editExpiresAt || null,
          status: editStatus,
          auto_apply: editAutoApply,
          applicable_event_ids: editEventIds.length > 0 ? editEventIds : null,
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
    setEditAutoApply(!!d.auto_apply);
    setEditEventIds(d.applicable_event_ids || []);
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
    setNewAutoApply(false);
    setNewEventIds([]);
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
                    <div className="flex items-center gap-1.5">
                      <Badge variant={STATUS_VARIANT[d.status]}>
                        {d.status}
                      </Badge>
                      {d.auto_apply && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 px-1.5 border-amber-500/30 text-amber-500">
                          <Zap size={9} />
                          Auto
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold tracking-wider">
                        {d.auto_apply && d.code.startsWith("AUTO-") ? (
                          <span className="text-muted-foreground/60 font-normal italic tracking-normal">auto-applied</span>
                        ) : (
                          d.code
                        )}
                      </span>
                      {!(d.auto_apply && d.code.startsWith("AUTO-")) && (
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
                      )}
                    </div>
                    {d.description && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground truncate max-w-[200px]">
                        {d.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {formatValue(d.type, d.value, orgCurrency)}
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
              {newAutoApply
                ? "Create a discount that's automatically applied on event pages."
                : "Add a new discount code. Customers enter this at checkout."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Auto-Apply Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Zap size={14} className={newAutoApply ? "text-amber-500" : "text-muted-foreground/40"} />
                <div>
                  <Label className="text-sm">Auto-Apply</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Automatically apply to event pages
                  </p>
                </div>
              </div>
              <Switch
                checked={newAutoApply}
                onCheckedChange={setNewAutoApply}
              />
            </div>

            {/* Code — optional when auto-apply */}
            {!newAutoApply && (
              <div className="space-y-2">
                <Label>Code *</Label>
                <Input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder="e.g. SUMMER10"
                  className="font-mono tracking-wider uppercase"
                  autoFocus
                />
              </div>
            )}

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
                <Select value={newType} onValueChange={(v) => setNewType(v as DiscountType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount ({currencySymbol})</SelectItem>
                  </SelectContent>
                </Select>
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

            {/* Event Selector */}
            <div className="space-y-2">
              <Label>{newAutoApply ? "Apply To Events" : "Restrict To Events"}</Label>
              <p className="text-[11px] text-muted-foreground -mt-1">
                {newEventIds.length === 0
                  ? "All events (no restriction)"
                  : `${newEventIds.length} event${newEventIds.length !== 1 ? "s" : ""} selected`}
              </p>
              <EventSelector
                events={events}
                selectedIds={newEventIds}
                onChange={setNewEventIds}
              />
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
                <Label>Min Order ({currencySymbol})</Label>
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
                <DateTimePicker
                  value={newStartsAt}
                  onChange={setNewStartsAt}
                />
              </div>
              <div className="space-y-2">
                <Label>Expires At</Label>
                <DateTimePicker
                  value={newExpiresAt}
                  onChange={setNewExpiresAt}
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
              disabled={creating || (!newAutoApply && !newCode.trim()) || !newValue}
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
              Update the discount settings.
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

            {/* Auto-Apply Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Zap size={14} className={editAutoApply ? "text-amber-500" : "text-muted-foreground/40"} />
                <div>
                  <Label className="text-sm">Auto-Apply</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Automatically apply to event pages
                  </p>
                </div>
              </div>
              <Switch
                checked={editAutoApply}
                onCheckedChange={setEditAutoApply}
              />
            </div>

            {/* Code — show for manual codes, hidden for auto-apply with generated code */}
            {(!editAutoApply || (editDiscount && !editDiscount.code.startsWith("AUTO-"))) && (
              <div className="space-y-2">
                <Label>Code {!editAutoApply ? "*" : ""}</Label>
                <Input
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                  className="font-mono tracking-wider uppercase"
                />
              </div>
            )}

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
                <Select value={editType} onValueChange={(v) => setEditType(v as DiscountType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount ({currencySymbol})</SelectItem>
                  </SelectContent>
                </Select>
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

            {/* Event Selector */}
            <div className="space-y-2">
              <Label>{editAutoApply ? "Apply To Events" : "Restrict To Events"}</Label>
              <p className="text-[11px] text-muted-foreground -mt-1">
                {editEventIds.length === 0
                  ? "All events (no restriction)"
                  : `${editEventIds.length} event${editEventIds.length !== 1 ? "s" : ""} selected`}
              </p>
              <EventSelector
                events={events}
                selectedIds={editEventIds}
                onChange={setEditEventIds}
              />
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
                <Label>Min Order ({currencySymbol})</Label>
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
                <DateTimePicker
                  value={editStartsAt}
                  onChange={setEditStartsAt}
                />
              </div>
              <div className="space-y-2">
                <Label>Expires At</Label>
                <DateTimePicker
                  value={editExpiresAt}
                  onChange={setEditExpiresAt}
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
              disabled={saving || (!editAutoApply && !editCode.trim()) || !editValue}
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

/* ── Event Selector (inline multi-select with pills) ── */

function EventSelector({
  events,
  selectedIds,
  onChange,
}: {
  events: EventOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  };

  if (events.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground/60 italic">
        No events found
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Selected pills */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const evt = events.find((e) => e.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
              >
                {evt?.name || id.slice(0, 8)}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="hover:text-foreground transition-colors"
                >
                  <X size={10} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Dropdown to add events */}
      <Select
        value=""
        onValueChange={(v) => {
          if (v && !selectedIds.includes(v)) toggle(v);
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Add event..." />
        </SelectTrigger>
        <SelectContent>
          {events
            .filter((e) => !selectedIds.includes(e.id))
            .map((e) => (
              <SelectItem key={e.id} value={e.id} className="text-xs">
                {e.name}
              </SelectItem>
            ))}
          {events.filter((e) => !selectedIds.includes(e.id)).length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              All events selected
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
