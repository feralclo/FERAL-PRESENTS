"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
  Tag,
  ChevronDown,
  Clock,
  Search,
  Link,
} from "lucide-react";
import type { Discount, DiscountType, DiscountStatus } from "@/types/discounts";
import { fmtMoney } from "@/lib/format";
import { useOrgCurrency } from "@/hooks/useOrgCurrency";

type FilterTab = "all" | DiscountStatus;
type DiscountMode = "code" | "flash";
type SchedulePreset = "24h" | "48h" | "weekend" | "week" | "custom";
type EventScope = "all" | "specific";

interface EventOption {
  id: string;
  name: string;
  slug: string;
  date_start?: string;
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
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function applySchedulePreset(preset: SchedulePreset): { starts_at: string; expires_at: string } {
  const now = new Date();
  const starts_at = now.toISOString().slice(0, 16);
  if (preset === "24h") {
    return { starts_at, expires_at: new Date(now.getTime() + 24 * 3600_000).toISOString().slice(0, 16) };
  }
  if (preset === "48h") {
    return { starts_at, expires_at: new Date(now.getTime() + 48 * 3600_000).toISOString().slice(0, 16) };
  }
  if (preset === "weekend") {
    const dayOfWeek = now.getDay();
    const daysToSat = dayOfWeek === 6 ? 0 : (6 - dayOfWeek);
    const sat = new Date(now); sat.setDate(sat.getDate() + daysToSat); sat.setHours(0, 0, 0, 0);
    const sunEnd = new Date(sat); sunEnd.setDate(sunEnd.getDate() + 1); sunEnd.setHours(23, 59, 0, 0);
    return { starts_at: sat.toISOString().slice(0, 16), expires_at: sunEnd.toISOString().slice(0, 16) };
  }
  if (preset === "week") {
    return { starts_at, expires_at: new Date(now.getTime() + 7 * 24 * 3600_000).toISOString().slice(0, 16) };
  }
  return { starts_at: "", expires_at: "" };
}

export default function DiscountsPage() {
  const { currency: orgCurrency, currencySymbol } = useOrgCurrency();
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");

  // Live events only (not draft/past/cancelled/archived)
  const [events, setEvents] = useState<EventOption[]>([]);

  // ── Create state ──
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newMode, setNewMode] = useState<DiscountMode>("code");
  const [newCode, setNewCode] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newType, setNewType] = useState<DiscountType>("percentage");
  const [newValue, setNewValue] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newMinOrder, setNewMinOrder] = useState("");
  const [newStartsAt, setNewStartsAt] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [newEventIds, setNewEventIds] = useState<string[]>([]);
  const [newEventScope, setNewEventScope] = useState<EventScope>("all");
  const [newSchedulePreset, setNewSchedulePreset] = useState<SchedulePreset | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Edit state ──
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
  const [editEventScope, setEditEventScope] = useState<EventScope>("all");
  const [saving, setSaving] = useState(false);

  // ── Delete state ──
  const [deleteTarget, setDeleteTarget] = useState<Discount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadDiscounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/discounts");
      const json = await res.json();
      if (json.data) setDiscounts(json.data);
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadDiscounts(); }, [loadDiscounts]);

  // Only fetch live events — past/draft/cancelled aren't useful for discount targeting
  useEffect(() => {
    fetch("/api/events?status=live")
      .then((r) => r.json())
      .then((json) => {
        const evts = (json.data || []) as EventOption[];
        setEvents(evts.map((e) => ({ id: e.id, name: e.name, slug: e.slug, date_start: e.date_start })));
      })
      .catch(() => {});
  }, []);

  const isFlash = newMode === "flash";

  const handleCreate = async () => {
    if (!isFlash && !newCode.trim()) return;
    if (!newValue) return;
    setCreating(true);
    try {
      const eventIds = newEventScope === "specific" ? newEventIds : [];
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
          auto_apply: isFlash,
          applicable_event_ids: eventIds.length > 0 ? eventIds : null,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        resetCreateForm();
        loadDiscounts();
      }
    } catch { /* */ }
    setCreating(false);
  };

  const handleEdit = async () => {
    if (!editDiscount) return;
    if (!editAutoApply && !editCode.trim()) return;
    if (!editValue) return;
    setSaving(true);
    try {
      const eventIds = editEventScope === "specific" ? editEventIds : [];
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
          applicable_event_ids: eventIds.length > 0 ? eventIds : null,
        }),
      });
      if (res.ok) { setEditDiscount(null); loadDiscounts(); }
    } catch { /* */ }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/discounts/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      loadDiscounts();
    } catch { /* */ }
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
    setEditEventScope(d.applicable_event_ids && d.applicable_event_ids.length > 0 ? "specific" : "all");
  };

  const resetCreateForm = () => {
    setNewMode("code"); setNewCode(""); setNewDescription(""); setNewType("percentage");
    setNewValue(""); setNewMaxUses(""); setNewMinOrder(""); setNewStartsAt("");
    setNewExpiresAt(""); setNewEventIds([]); setNewEventScope("all");
    setNewSchedulePreset(null); setShowAdvanced(false);
  };

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code); setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const copyLink = (d: Discount) => {
    // Build shareable URL — use first applicable event, or first live event
    const eventId = d.applicable_event_ids?.length ? d.applicable_event_ids[0] : null;
    const evt = eventId ? events.find((e) => e.id === eventId) : events[0];
    if (!evt) return;
    const base = window.location.origin.replace(/\/admin\./, "/");
    const url = `${base}/event/${evt.slug}?discount=${encodeURIComponent(d.code)}`;
    navigator.clipboard.writeText(url);
    setCopiedLinkId(d.id);
    setTimeout(() => setCopiedLinkId(null), 2000);
  };

  const selectPreset = (preset: SchedulePreset) => {
    setNewSchedulePreset(preset);
    if (preset !== "custom") {
      const { starts_at, expires_at } = applySchedulePreset(preset);
      setNewStartsAt(starts_at); setNewExpiresAt(expires_at);
    }
  };

  const filtered = filter === "all" ? discounts : discounts.filter((d) => d.status === filter);
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
          <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">Discounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create and manage discount codes for your events</p>
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
              filter === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            <span className="ml-1.5 text-[10px] tabular-nums text-muted-foreground/60">{counts[tab]}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-primary/60" />
            <span className="ml-3 text-sm text-muted-foreground">Loading discounts...</span>
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
              {filter === "all" ? "Create your first discount code to start offering promotions" : "Discounts with this status will appear here"}
            </p>
            {filter === "all" && (
              <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
                <Plus size={14} /> Create Discount
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
                      <Badge variant={STATUS_VARIANT[d.status]}>{d.status}</Badge>
                      {d.auto_apply && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 px-1.5 border-amber-500/30 text-amber-500">
                          <Zap size={9} /> Auto
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold tracking-wider">
                        {d.auto_apply && d.code.startsWith("AUTO-") ? (
                          <span className="text-muted-foreground/60 font-normal italic tracking-normal">auto-applied</span>
                        ) : d.code}
                      </span>
                      {!(d.auto_apply && d.code.startsWith("AUTO-")) && (
                        <button
                          className="text-muted-foreground/40 hover:text-foreground transition-colors"
                          onClick={(e) => { e.stopPropagation(); copyCode(d.code, d.id); }}
                          title="Copy code"
                        >
                          {copiedId === d.id ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                        </button>
                      )}
                      {events.length > 0 && !(d.auto_apply && d.code.startsWith("AUTO-")) && (
                        <button
                          className="text-muted-foreground/40 hover:text-foreground transition-colors"
                          onClick={(e) => { e.stopPropagation(); copyLink(d); }}
                          title="Copy shareable link"
                        >
                          {copiedLinkId === d.id ? <Check size={12} className="text-green-500" /> : <Link size={12} />}
                        </button>
                      )}
                    </div>
                    {d.description && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground truncate max-w-[200px]">{d.description}</p>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">{formatValue(d.type, d.value, orgCurrency)}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-xs tabular-nums">
                    {d.used_count}{d.max_uses != null && ` / ${d.max_uses}`}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">{formatDate(d.expires_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-xs" onClick={() => openEdit(d)} title="Edit"><Pencil size={13} /></Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(d)} className="text-muted-foreground hover:text-destructive" title="Delete"><Trash2 size={13} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ══ Create Dialog ══ */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-[460px] gap-0 p-0 overflow-hidden">
          {/* Mode tabs */}
          <div className="border-b border-border/50 px-5 pt-5 pb-0">
            <DialogHeader className="pb-3">
              <DialogTitle className="text-base">New Discount</DialogTitle>
            </DialogHeader>
            <div className="flex gap-0 -mb-px">
              {([
                { mode: "code" as const, icon: <Tag size={12} />, label: "Discount Code" },
                { mode: "flash" as const, icon: <Zap size={12} />, label: "Flash Sale" },
              ]).map(({ mode, icon, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setNewMode(mode)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium border-b-2 transition-colors ${
                    newMode === mode
                      ? mode === "flash" ? "border-amber-500 text-foreground" : "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Discount type + value */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Type</Label>
                <Select value={newType} onValueChange={(v) => setNewType(v as DiscountType)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed ({currencySymbol})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Value</Label>
                <Input
                  type="number" value={newValue} onChange={(e) => setNewValue(e.target.value)}
                  placeholder={newType === "percentage" ? "e.g. 50" : "e.g. 5.00"}
                  min="0" max={newType === "percentage" ? "100" : undefined}
                  step={newType === "percentage" ? "1" : "0.01"} className="h-9" autoFocus
                />
              </div>
            </div>

            {/* Code (manual only) */}
            {!isFlash && (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Code</Label>
                <Input
                  value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder="e.g. SUMMER10" className="h-9 font-mono tracking-wider uppercase"
                />
              </div>
            )}

            {/* Schedule (flash sale) */}
            {isFlash && (
              <div className="space-y-2">
                <Label className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock size={11} /> Duration</Label>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { key: "24h", label: "24 hours" }, { key: "48h", label: "48 hours" },
                    { key: "weekend", label: "Weekend" }, { key: "week", label: "1 week" },
                    { key: "custom", label: "Custom" },
                  ] as const).map(({ key, label }) => (
                    <button key={key} type="button" onClick={() => selectPreset(key)}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium border transition-colors ${
                        newSchedulePreset === key
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                          : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                      }`}
                    >{label}</button>
                  ))}
                </div>
                {newSchedulePreset === "custom" && (
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Starts</Label><DateTimePicker value={newStartsAt} onChange={setNewStartsAt} /></div>
                    <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Ends</Label><DateTimePicker value={newExpiresAt} onChange={setNewExpiresAt} /></div>
                  </div>
                )}
                {newSchedulePreset && newSchedulePreset !== "custom" && newStartsAt && newExpiresAt && (
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(newStartsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {" — "}
                    {new Date(newExpiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
            )}

            {/* Events — clear "All" vs "Specific" choice */}
            <EventScopeSelector
              events={events}
              scope={newEventScope}
              selectedIds={newEventIds}
              onScopeChange={setNewEventScope}
              onSelectionChange={setNewEventIds}
            />

            {/* Schedule (code mode) */}
            {!isFlash && (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock size={11} /> Schedule</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-[10px] text-muted-foreground/60">Starts</Label><DateTimePicker value={newStartsAt} onChange={setNewStartsAt} /></div>
                  <div className="space-y-1"><Label className="text-[10px] text-muted-foreground/60">Ends</Label><DateTimePicker value={newExpiresAt} onChange={setNewExpiresAt} /></div>
                </div>
              </div>
            )}

            {/* Advanced */}
            <div>
              <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                <ChevronDown size={11} className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                More options
              </button>
              {showAdvanced && (
                <div className="mt-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Description</Label>
                    <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Internal note" className="h-9" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Max uses</Label>
                      <Input type="number" value={newMaxUses} onChange={(e) => setNewMaxUses(e.target.value)} placeholder="Unlimited" min="1" className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Min order ({currencySymbol})</Label>
                      <Input type="number" value={newMinOrder} onChange={(e) => setNewMinOrder(e.target.value)} placeholder="None" min="0" step="0.01" className="h-9" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border/50 px-5 py-3.5 flex items-center justify-end gap-3">
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={creating || (!isFlash && !newCode.trim()) || !newValue}>
              {creating && <Loader2 size={14} className="animate-spin" />}
              {creating ? "Creating..." : isFlash ? "Start Flash Sale" : "Create Code"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Edit Dialog ══ */}
      <Dialog open={!!editDiscount} onOpenChange={(open) => !open && setEditDiscount(null)}>
        <DialogContent className="sm:max-w-[460px] gap-0 p-0 overflow-hidden">
          <div className="px-5 pt-5 pb-4 border-b border-border/50">
            <DialogHeader>
              <DialogTitle className="text-base">Edit Discount</DialogTitle>
              <DialogDescription className="text-xs">
                {editAutoApply ? "Auto-applied flash sale" : "Manual discount code"}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Active + auto-apply */}
            <div className="flex items-center justify-between">
              <Label className="text-sm">Active</Label>
              <Switch checked={editStatus === "active"} onCheckedChange={(c) => setEditStatus(c ? "active" : "inactive")} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <Zap size={13} className={editAutoApply ? "text-amber-500" : "text-muted-foreground/40"} />
                <Label className="text-sm">Auto-Apply</Label>
              </div>
              <Switch checked={editAutoApply} onCheckedChange={setEditAutoApply} />
            </div>

            {/* Value */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Type</Label>
                <Select value={editType} onValueChange={(v) => setEditType(v as DiscountType)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed ({currencySymbol})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Value</Label>
                <Input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                  min="0" max={editType === "percentage" ? "100" : undefined} step={editType === "percentage" ? "1" : "0.01"} className="h-9" />
              </div>
            </div>

            {/* Code */}
            {(!editAutoApply || (editDiscount && !editDiscount.code.startsWith("AUTO-"))) && (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Code</Label>
                <Input value={editCode} onChange={(e) => setEditCode(e.target.value.toUpperCase())} className="h-9 font-mono tracking-wider uppercase" />
              </div>
            )}

            {/* Events */}
            <EventScopeSelector
              events={events}
              scope={editEventScope}
              selectedIds={editEventIds}
              onScopeChange={setEditEventScope}
              onSelectionChange={setEditEventIds}
            />

            {/* Schedule */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock size={11} /> Schedule</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-[10px] text-muted-foreground/60">Starts</Label><DateTimePicker value={editStartsAt} onChange={setEditStartsAt} /></div>
                <div className="space-y-1"><Label className="text-[10px] text-muted-foreground/60">Ends</Label><DateTimePicker value={editExpiresAt} onChange={setEditExpiresAt} /></div>
              </div>
            </div>

            {/* Description + limits */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Description</Label>
              <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Internal note" className="h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Max uses</Label>
                <Input type="number" value={editMaxUses} onChange={(e) => setEditMaxUses(e.target.value)} placeholder="Unlimited" min="1" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Min order ({currencySymbol})</Label>
                <Input type="number" value={editMinOrder} onChange={(e) => setEditMinOrder(e.target.value)} placeholder="None" min="0" step="0.01" className="h-9" />
              </div>
            </div>

            {editDiscount && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Used {editDiscount.used_count} time{editDiscount.used_count !== 1 ? "s" : ""}
              </div>
            )}
          </div>

          <div className="border-t border-border/50 px-5 py-3.5 flex items-center justify-end gap-3">
            <Button variant="outline" size="sm" onClick={() => setEditDiscount(null)}>Cancel</Button>
            <Button size="sm" onClick={handleEdit} disabled={saving || (!editAutoApply && !editCode.trim()) || !editValue}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Delete Dialog ══ */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Discount</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.code}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 size={14} className="animate-spin" />}
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Event Scope Selector — "All events" vs "Specific events"
   Clear, explicit, searchable for large lists.
   ═══════════════════════════════════════════════ */

function EventScopeSelector({
  events,
  scope,
  selectedIds,
  onScopeChange,
  onSelectionChange,
}: {
  events: EventOption[];
  scope: EventScope;
  selectedIds: string[];
  onScopeChange: (s: EventScope) => void;
  onSelectionChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter((e) => e.name.toLowerCase().includes(q));
  }, [events, search]);

  const toggle = (id: string) => {
    onSelectionChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    );
  };

  return (
    <div className="space-y-2">
      <Label className="text-[11px] text-muted-foreground">Events</Label>

      {/* Toggle: All vs Specific */}
      <div className="flex gap-0 rounded-lg bg-muted p-0.5">
        <button
          type="button"
          onClick={() => onScopeChange("all")}
          className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
            scope === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          All events
        </button>
        <button
          type="button"
          onClick={() => onScopeChange("specific")}
          className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
            scope === "specific" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Specific events
        </button>
      </div>

      {/* Event picker — only shown when "specific" */}
      {scope === "specific" && (
        <div className="rounded-lg border border-border/50 overflow-hidden">
          {/* Search — shown when 5+ events */}
          {events.length >= 5 && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
              <Search size={13} className="text-muted-foreground/40 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search events..."
                className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 outline-none"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="text-muted-foreground/40 hover:text-foreground">
                  <X size={12} />
                </button>
              )}
            </div>
          )}

          {/* Event list */}
          <div className="max-h-[200px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11px] text-muted-foreground/60">
                {search ? "No events match your search" : "No live events"}
              </p>
            ) : (
              filtered.map((e) => {
                const selected = selectedIds.includes(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => toggle(e.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50 ${
                      selected ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      selected ? "bg-primary border-primary" : "border-border"
                    }`}>
                      {selected && <Check size={10} className="text-primary-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-foreground truncate block">{e.name}</span>
                      {e.date_start && (
                        <span className="text-[10px] text-muted-foreground">{shortDate(e.date_start)}</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Selection summary */}
          {selectedIds.length > 0 && (
            <div className="px-3 py-1.5 border-t border-border/30 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {selectedIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => onSelectionChange([])}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
