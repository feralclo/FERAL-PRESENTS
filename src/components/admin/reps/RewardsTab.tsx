"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Ticket,
  ArrowUpCircle,
  Package,
  Wrench,
  ChevronLeft,
  Info,
  AlertTriangle,
  ShoppingBag,
  ExternalLink,
} from "lucide-react";
import type {
  RepReward,
  RewardType,
  RepMilestone,
  MilestoneType,
  FulfillmentType,
  RewardMetadata,
} from "@/types/reps";
import { cn } from "@/lib/utils";

// ─── Constants ──────────────────────────────────────────────────────────────

const REWARD_TYPE_LABELS: Record<RewardType, string> = {
  milestone: "Milestone",
  // "shop" = v2 name; "points_shop" = v1 alias for old rows. Both render
  // as "EP Shop" because the economy is EP-denominated post-v2.
  shop: "EP Shop",
  points_shop: "EP Shop",
  manual: "Manual",
};

const REWARD_TYPE_ICONS: Record<RewardType, typeof Target> = {
  milestone: Target,
  shop: ShoppingCart,
  points_shop: ShoppingCart,
  manual: Award,
};

// Guard against any future reward_type value we don't know about — never
// render `<undefined />`, which is what crashed the page for the user.
function rewardIcon(type: string): typeof Target {
  return REWARD_TYPE_ICONS[type as RewardType] ?? Award;
}
function rewardLabel(type: string): string {
  return REWARD_TYPE_LABELS[type as RewardType] ?? type;
}

// Treat "shop" and legacy "points_shop" as the same concept throughout the UI.
function isShopType(t: string | undefined): boolean {
  return t === "shop" || t === "points_shop";
}

const FULFILLMENT_TYPE_ICONS: Record<FulfillmentType, typeof Wrench> = {
  manual: Wrench,
  free_ticket: Ticket,
  extra_tickets: Ticket,
  vip_upgrade: ArrowUpCircle,
  merch: Package,
};

const FULFILLMENT_CARD_CONFIG: {
  type: FulfillmentType;
  icon: typeof Ticket;
  label: string;
  description: string;
  color: string;
}[] = [
  {
    type: "free_ticket",
    icon: Ticket,
    label: "Free Ticket",
    description: "Give a free ticket to an event (can include merch)",
    color: "text-primary",
  },
  {
    type: "vip_upgrade",
    icon: ArrowUpCircle,
    label: "VIP Upgrade",
    description: "Upgrade a rep's existing ticket to a higher tier",
    color: "text-amber-400",
  },
  {
    type: "merch",
    icon: Package,
    label: "Free Merch",
    description: "Standalone merch — no ticket, just collection",
    color: "text-emerald-400",
  },
  {
    type: "manual",
    icon: Gift,
    label: "Custom Reward",
    description: "Anything else — you fulfil it manually",
    color: "text-muted-foreground",
  },
];

// ─── Types ──────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  images?: string[];
  sizes?: string[];
  price?: number;
  type?: string;
}

interface EventOption {
  id: string;
  name: string;
  slug?: string;
  status?: string;
}

interface TicketTypeOption {
  id: string;
  name: string;
  price: number;
  includes_merch?: boolean;
  product_id?: string | null;
  product?: { name?: string } | null;
}

type DialogStep = "choose-type" | "configure";

// ─── Component ──────────────────────────────────────────────────────────────

export function RewardsTab() {
  const [rewards, setRewards] = useState<RepReward[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  // Count of claims awaiting fulfilment — for the cross-link banner to Reports
  const [unfulfilledClaims, setUnfulfilledClaims] = useState(0);

  // Create / Edit dialog
  const [showDialog, setShowDialog] = useState(false);
  const [dialogStep, setDialogStep] = useState<DialogStep>("choose-type");
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Common fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [rewardType, setRewardType] = useState<RewardType>("shop");
  const [pointsCost, setPointsCost] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [totalAvailable, setTotalAvailable] = useState("");
  const [productId, setProductId] = useState("");
  const [rewardStatus, setRewardStatus] = useState<"active" | "archived">("active");

  // Fulfillment config
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>("manual");
  const [eventId, setEventId] = useState("");
  const [ticketTypeId, setTicketTypeId] = useState("");
  const [upgradeTicketTypeId, setUpgradeTicketTypeId] = useState("");
  const [maxClaimsPerRep, setMaxClaimsPerRep] = useState("1");
  const [unlimitedClaims, setUnlimitedClaims] = useState(false);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketTypeOption[]>([]);

  // Milestones
  const [showMilestone, setShowMilestone] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<RepMilestone[]>([]);
  const [mTitle, setMTitle] = useState("");
  const [mType, setMType] = useState<MilestoneType>("sales_count");
  const [mThreshold, setMThreshold] = useState("");
  const [savingMilestone, setSavingMilestone] = useState(false);

  // Error + delete
  const [saveError, setSaveError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<RepReward | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Archive visibility
  const [showArchived, setShowArchived] = useState(false);

  // ─── Data Loading ───────────────────────────────────────────────────────

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

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events");
      const json = await res.json();
      if (json.data) setEvents(json.data);
    } catch { /* network */ }
  }, []);

  // Small fetch to show "N claims awaiting fulfilment → Reports" banner.
  // Only the count is needed; actual management happens in Reports.
  const loadClaimsCount = useCallback(async () => {
    try {
      const res = await fetch("/api/reps/claims?status=claimed");
      const json = await res.json();
      if (Array.isArray(json.data)) setUnfulfilledClaims(json.data.length);
    } catch { /* network */ }
  }, []);

  useEffect(() => {
    // Each fetch sets its own state after await. The rule flags the
    // transitive chain; no data-library in play, so disable with reason.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRewards();
    loadProducts();
    loadEvents();
    loadClaimsCount();
  }, [loadRewards, loadProducts, loadEvents, loadClaimsCount]);

  // Load ticket types when event changes.
  useEffect(() => {
    // Intentional synchronous reset when no event is selected.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!eventId) { setTicketTypes([]); return; }
    (async () => {
      try {
        const res = await fetch(`/api/events/${eventId}`);
        const json = await res.json();
        if (json.data?.ticket_types) setTicketTypes(json.data.ticket_types);
        else setTicketTypes([]);
      } catch { /* network */ }
    })();
  }, [eventId]);

  const loadMilestones = useCallback(async (rewardId: string) => {
    try {
      const res = await fetch(`/api/reps/milestones?reward_id=${rewardId}`);
      const json = await res.json();
      if (json.data) setMilestones(json.data);
    } catch { /* network */ }
  }, []);

  // ─── Dialog Helpers ─────────────────────────────────────────────────────

  const resetAll = () => {
    setName(""); setDescription(""); setImageUrl(""); setRewardType("shop");
    setPointsCost(""); setCustomValue(""); setTotalAvailable(""); setProductId("");
    setRewardStatus("active"); setFulfillmentType("manual"); setEventId("");
    setTicketTypeId(""); setUpgradeTicketTypeId(""); setMaxClaimsPerRep("1");
    setUnlimitedClaims(false); setSaveError("");
  };

  const openCreate = () => {
    setEditId(null);
    resetAll();
    setDialogStep("choose-type");
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

    const meta = r.metadata as RewardMetadata | undefined;
    setFulfillmentType(meta?.fulfillment_type || "manual");
    setEventId(meta?.event_id || "");
    setTicketTypeId(meta?.ticket_type_id || "");
    setUpgradeTicketTypeId(meta?.upgrade_to_ticket_type_id || "");
    if (meta?.max_claims_per_rep === null || meta?.max_claims_per_rep === 0) {
      setUnlimitedClaims(true); setMaxClaimsPerRep("");
    } else {
      setUnlimitedClaims(false);
      setMaxClaimsPerRep(meta?.max_claims_per_rep != null ? String(meta.max_claims_per_rep) : "1");
    }

    setSaveError("");
    setDialogStep("configure"); // skip type picker when editing
    setShowDialog(true);
  };

  const selectFulfillmentType = (ft: FulfillmentType) => {
    setFulfillmentType(ft);
    setRewardType("shop");
    // Reset type-specific fields
    setEventId(""); setTicketTypeId(""); setUpgradeTicketTypeId(""); setProductId("");
    // Smart defaults
    if (ft === "free_ticket") {
      setMaxClaimsPerRep("1"); setUnlimitedClaims(false);
    } else if (ft === "extra_tickets") {
      setMaxClaimsPerRep(""); setUnlimitedClaims(true);
    } else if (ft === "vip_upgrade") {
      setMaxClaimsPerRep("1"); setUnlimitedClaims(false);
    } else if (ft === "merch") {
      setMaxClaimsPerRep("1"); setUnlimitedClaims(false);
    } else {
      setMaxClaimsPerRep("1"); setUnlimitedClaims(false);
    }
    setDialogStep("configure");
  };

  // ─── Save ───────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setSaveError("");

    const metadata: RewardMetadata = { fulfillment_type: fulfillmentType };
    if (isShopType(rewardType)) {
      if (fulfillmentType === "free_ticket" || fulfillmentType === "extra_tickets") {
        if (eventId) metadata.event_id = eventId;
        if (ticketTypeId) metadata.ticket_type_id = ticketTypeId;
      } else if (fulfillmentType === "vip_upgrade") {
        if (eventId) metadata.event_id = eventId;
        if (upgradeTicketTypeId) metadata.upgrade_to_ticket_type_id = upgradeTicketTypeId;
      } else if (fulfillmentType === "merch") {
        if (eventId) metadata.event_id = eventId;
      }
      metadata.max_claims_per_rep = unlimitedClaims ? 0 : (maxClaimsPerRep ? Number(maxClaimsPerRep) : 1);
    }

    // Send both ep_cost (v2) and points_cost (v1) + both stock (v2) and
    // total_available (v1). Backend normalises either pair; sending both
    // keeps legacy-web and new-web reads consistent during the transition.
    const costValue = pointsCost ? Number(pointsCost) : null;
    const stockValue = totalAvailable ? Number(totalAvailable) : null;
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      image_url: imageUrl.trim() || null,
      reward_type: rewardType,
      points_cost: costValue,
      ep_cost: costValue,
      custom_value: customValue.trim() || null,
      total_available: stockValue,
      stock: stockValue,
      product_id: productId || null,
      metadata: isShopType(rewardType) ? metadata : {},
      ...(editId ? { status: rewardStatus } : {}),
    };

    try {
      const url = editId ? `/api/reps/rewards/${editId}` : "/api/reps/rewards";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
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

  // ─── Other Actions ──────────────────────────────────────────────────────

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

  // ─── Derived ────────────────────────────────────────────────────────────

  const getFulfillmentLabel = (ft?: FulfillmentType) => {
    switch (ft) {
      case "free_ticket": return "Free Ticket";
      case "extra_tickets": return "Extra Tickets";
      case "vip_upgrade": return "VIP Upgrade";
      case "merch": return "Free Merch";
      default: return "Custom";
    }
  };

  const getFulfillmentBadge = (r: RepReward) => {
    const meta = r.metadata as RewardMetadata | undefined;
    const ft = meta?.fulfillment_type;
    if (!ft || ft === "manual") return null;
    const Icon = FULFILLMENT_TYPE_ICONS[ft];
    return (
      <Badge variant="secondary" className="text-[10px] gap-1">
        <Icon size={9} />
        {getFulfillmentLabel(ft)}
      </Badge>
    );
  };

  // Dialog title based on step and type
  const getDialogTitle = () => {
    if (editId) return "Edit Reward";
    if (dialogStep === "choose-type") return "What are you giving away?";
    return `New ${getFulfillmentLabel(fulfillmentType)} Reward`;
  };

  const getDialogDescription = () => {
    if (editId) return "Update this reward.";
    if (dialogStep === "choose-type") return "Choose the type of reward your reps can claim from the shop.";
    switch (fulfillmentType) {
      case "free_ticket": return "Rep spends points and automatically gets a ticket emailed to them.";
      case "extra_tickets": return "Rep can buy multiple tickets with points. Great for bringing friends.";
      case "vip_upgrade": return "Rep spends points to upgrade their existing ticket to a higher tier.";
      case "merch": return "Rep spends points on merch. No ticket is created — you mark it fulfilled when they collect at the event.";
      default: return "Rep spends points, you fulfil the reward manually.";
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

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

      {/* Claims-pending cross-link → Reports handles actual fulfilment */}
      {unfulfilledClaims > 0 && (
        <Link
          href="/admin/reps?tab=reports&review=claims"
          className="group flex items-center gap-3 rounded-xl border border-info/30 bg-info/5 px-5 py-3 transition-colors hover:bg-info/10"
        >
          <ShoppingBag size={18} className="shrink-0 text-info" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              <span className="font-mono tabular-nums">{unfulfilledClaims}</span>{" "}
              {unfulfilledClaims === 1 ? "claim is" : "claims are"} awaiting fulfilment
            </p>
            <p className="text-[11px] text-muted-foreground">
              Fulfil or cancel in Reports — reps get refunded on cancel
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-info group-hover:text-foreground">
            Fulfil
            <ExternalLink size={12} />
          </span>
        </Link>
      )}

      {/* ── Rewards Grid ── */}
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
      ) : (() => {
        const activeRewards = rewards.filter((r) => r.status !== "archived");
        const archivedRewards = rewards.filter((r) => r.status === "archived");
        const visibleRewards = showArchived ? rewards : activeRewards;
        return (
        <>
        {archivedRewards.length > 0 && (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showArchived ? "Hide" : "Show"} archived ({archivedRewards.length})
            </button>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleRewards.map((reward) => {
            const Icon = rewardIcon(reward.reward_type);
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
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                    <span className="font-mono">{rewardLabel(reward.reward_type)}</span>
                    {/* Prefer v2 ep_cost; fall back to points_cost for legacy rows. */}
                    {(() => {
                      const cost = reward.ep_cost ?? reward.points_cost;
                      if (cost == null) return null;
                      const unit = reward.ep_cost != null ? "EP" : "pts";
                      return (
                        <span className="font-mono text-primary font-bold">
                          {cost} {unit}
                        </span>
                      );
                    })()}
                    <span className="tabular-nums">{reward.total_claimed}/{(reward.stock ?? reward.total_available) ?? "\u221E"} claimed</span>
                  </div>
                  {(() => {
                    const cap = reward.stock ?? reward.total_available;
                    if (cap == null) return null;
                    const remaining = cap - reward.total_claimed;
                    if (remaining <= 0) {
                      return (
                        <Badge
                          variant="outline"
                          className="mb-3 gap-1 border-destructive/40 bg-destructive/10 text-destructive text-[10px]"
                        >
                          <AlertTriangle size={10} strokeWidth={2} />
                          Out of stock
                        </Badge>
                      );
                    }
                    const lowThreshold = Math.max(2, Math.ceil(cap * 0.2));
                    if (remaining <= lowThreshold) {
                      return (
                        <Badge
                          variant="outline"
                          className="mb-3 gap-1 border-warning/40 bg-warning/10 text-warning text-[10px]"
                        >
                          <AlertTriangle size={10} strokeWidth={2} />
                          Low stock ({remaining} left)
                        </Badge>
                      );
                    }
                    return null;
                  })()}
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {getFulfillmentBadge(reward)}
                    {reward.product_id && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <ShoppingCart size={9} /> Linked product
                      </Badge>
                    )}
                  </div>
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
        </>
        );
      })()}

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
            <DialogDescription>{getDialogDescription()}</DialogDescription>
          </DialogHeader>

          {/* ── Step 1: Choose fulfillment type (new rewards only) ── */}
          {dialogStep === "choose-type" && !editId && (
            <div className="py-2 space-y-5">
              {/* Shop rewards — visual type cards */}
              <div className="grid grid-cols-2 gap-3">
                {FULFILLMENT_CARD_CONFIG.map((cfg) => (
                  <button
                    key={cfg.type}
                    onClick={() => selectFulfillmentType(cfg.type)}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-xl border border-border/60 p-4 text-left transition-all",
                      "hover:border-primary/40 hover:bg-primary/[0.03] hover:shadow-sm",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    )}
                  >
                    <cfg.icon size={20} className={cfg.color} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{cfg.label}</p>
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{cfg.description}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Milestone — separate section */}
              <div className="border-t border-border/40 pt-4">
                <button
                  onClick={() => { setRewardType("milestone"); setFulfillmentType("manual"); setDialogStep("configure"); }}
                  className={cn(
                    "flex items-center gap-3 w-full rounded-xl border border-border/60 p-4 text-left transition-all",
                    "hover:border-primary/40 hover:bg-primary/[0.03] hover:shadow-sm",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  )}
                >
                  <Target size={20} className="text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Milestone Reward</p>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">Automatically awarded when a rep hits a sales or points target</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Configure reward ── */}
          {dialogStep === "configure" && (
            <>
              <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
                {/* Back button (new rewards only) */}
                {!editId && (
                  <button
                    onClick={() => { setDialogStep("choose-type"); resetAll(); }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors -mt-1 mb-1"
                  >
                    <ChevronLeft size={14} />
                    Change reward type
                  </button>
                )}

                {/* ── Common: Name ── */}
                <div className="space-y-2">
                  <Label>Reward Name *</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      fulfillmentType === "free_ticket" ? "e.g. Free GA Ticket" :
                      fulfillmentType === "vip_upgrade" ? "e.g. VIP Upgrade" :
                      fulfillmentType === "merch" ? "e.g. Free T-Shirt" :
                      "e.g. Backstage Pass"
                    }
                    autoFocus
                  />
                </div>

                {/* ── Ticket rewards: Event + Ticket Type ── */}
                {(fulfillmentType === "free_ticket" || fulfillmentType === "extra_tickets") && (
                  <>
                    <div className="space-y-2">
                      <Label>Event *</Label>
                      <Select value={eventId || "none"} onValueChange={(v) => { setEventId(v === "none" ? "" : v); setTicketTypeId(""); }}>
                        <SelectTrigger><SelectValue placeholder="Select event" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select an event</SelectItem>
                          {events.map((e) => (
                            <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {eventId && (
                      <div className="space-y-2">
                        <Label>Ticket Type *</Label>
                        {ticketTypes.length > 0 ? (
                          <>
                            <Select value={ticketTypeId || "none"} onValueChange={(v) => setTicketTypeId(v === "none" ? "" : v)}>
                              <SelectTrigger><SelectValue placeholder="Select ticket type" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Select a ticket type</SelectItem>
                                {ticketTypes.map((tt) => (
                                  <SelectItem key={tt.id} value={tt.id}>
                                    {tt.name} {tt.price > 0 ? `(£${tt.price})` : "(Free)"}
                                    {(tt.includes_merch || tt.product_id) ? " + Merch" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {ticketTypeId && (() => {
                              const selected = ticketTypes.find((tt) => tt.id === ticketTypeId);
                              if (!selected?.includes_merch && !selected?.product_id) return null;
                              const merchName = selected.product?.name || "merch item";
                              return (
                                <div className="flex items-start gap-2 rounded-lg bg-info/5 border border-info/10 px-3 py-2">
                                  <Package size={12} className="text-info shrink-0 mt-0.5" />
                                  <p className="text-[11px] text-muted-foreground leading-snug">
                                    This ticket includes <span className="font-medium text-foreground">{merchName}</span>. The rep will receive a ticket <em>and</em> a merch collection QR.
                                  </p>
                                </div>
                              );
                            })()}
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground py-2">No ticket types found for this event</p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* ── VIP Upgrade: Event + Upgrade-to type ── */}
                {fulfillmentType === "vip_upgrade" && (
                  <>
                    <div className="space-y-2">
                      <Label>Event *</Label>
                      <Select value={eventId || "none"} onValueChange={(v) => { setEventId(v === "none" ? "" : v); setUpgradeTicketTypeId(""); }}>
                        <SelectTrigger><SelectValue placeholder="Select event" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select an event</SelectItem>
                          {events.map((e) => (
                            <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {eventId && (
                      <div className="space-y-2">
                        <Label>Upgrade To *</Label>
                        {ticketTypes.length > 0 ? (
                          <Select value={upgradeTicketTypeId || "none"} onValueChange={(v) => setUpgradeTicketTypeId(v === "none" ? "" : v)}>
                            <SelectTrigger><SelectValue placeholder="Select the VIP tier" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Select the VIP tier</SelectItem>
                              {ticketTypes.map((tt) => (
                                <SelectItem key={tt.id} value={tt.id}>
                                  {tt.name} {tt.price > 0 ? `(£${tt.price})` : "(Free)"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-xs text-muted-foreground py-2">No ticket types found for this event</p>
                        )}
                        <div className="flex items-start gap-2 rounded-lg bg-info/5 border border-info/10 px-3 py-2">
                          <Info size={12} className="text-info shrink-0 mt-0.5" />
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            The rep must already have a ticket to this event. Their existing ticket gets swapped to the tier you select above.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ── Merch: Event + Product ── */}
                {fulfillmentType === "merch" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Collection Event *</Label>
                      <Select value={eventId || "none"} onValueChange={(v) => setEventId(v === "none" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="Where do they collect?" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select an event</SelectItem>
                          {events.map((e) => (
                            <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">Rep must collect this merch at this event.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Merch Product</Label>
                      {products.length > 0 ? (
                        <Select value={productId || "none"} onValueChange={handleProductSelect}>
                          <SelectTrigger><SelectValue placeholder="Select a product (for sizes)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No product (freeform)</SelectItem>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}{p.sizes?.length ? ` (${p.sizes.join(", ")})` : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-xs text-muted-foreground py-2">No products in your merch catalog. Rep won&apos;t see a size picker.</p>
                      )}
                    </div>
                    <div className="flex items-start gap-2 rounded-lg bg-info/5 border border-info/10 px-3 py-2">
                      <Package size={12} className="text-info shrink-0 mt-0.5" />
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Rep picks their size when claiming. No ticket is created — this is merch only.
                        You mark it as fulfilled when they collect at the event.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── EP Cost (shop rewards) ── */}
                {isShopType(rewardType) && (
                  <div className="space-y-2">
                    <Label>EP cost *</Label>
                    <Input type="number" value={pointsCost} onChange={(e) => setPointsCost(e.target.value)} placeholder="e.g. 500" min="1" />
                    <p className="text-[11px] text-muted-foreground">
                      How many EP the rep spends to claim this reward. 1 EP = £0.01.
                    </p>
                  </div>
                )}

                {/* ── Description ── */}
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional — shown to reps in the shop" rows={2} />
                </div>

                {/* ── Image ── */}
                <div className="space-y-2">
                  <Label>Image URL</Label>
                  <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Transparent PNG recommended" />
                  {imageUrl && (
                    <div className="h-20 rounded-lg bg-muted/30 flex items-center justify-center">
                      <img src={imageUrl} alt="Preview" className="max-h-full max-w-full object-contain p-2" />
                    </div>
                  )}
                </div>

                {/* ── Advanced: Stock + Claims ── */}
                {isShopType(rewardType) && (
                  <div className="space-y-4 rounded-lg border border-border/40 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground -mb-1">Limits</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Total Stock</Label>
                        <Input type="number" value={totalAvailable} onChange={(e) => setTotalAvailable(e.target.value)} placeholder="Unlimited" min="1" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Per Rep</Label>
                        <div className="flex items-center gap-2">
                          {unlimitedClaims ? (
                            <span className="text-sm text-muted-foreground px-3 py-1.5">Unlimited</span>
                          ) : (
                            <Input
                              type="number"
                              value={maxClaimsPerRep}
                              onChange={(e) => setMaxClaimsPerRep(e.target.value)}
                              placeholder="1"
                              min="1"
                              className="w-20"
                            />
                          )}
                          <div className="flex items-center gap-1.5">
                            <Switch checked={unlimitedClaims} onCheckedChange={setUnlimitedClaims} />
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">No limit</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Milestone: Custom Value ── */}
                {rewardType === "milestone" && (
                  <div className="space-y-2">
                    <Label>Custom Value</Label>
                    <Input value={customValue} onChange={(e) => setCustomValue(e.target.value)} placeholder="e.g. VIP Access, Merch Bundle" />
                    <p className="text-[11px] text-muted-foreground">Shown to reps when the milestone is unlocked.</p>
                  </div>
                )}

                {/* ── Edit: Status ── */}
                {editId && (
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={rewardStatus} onValueChange={(v) => setRewardStatus(v as "active" | "archived")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
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
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Milestones Dialog ── */}
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

      {/* ── Delete Dialog ── */}
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
