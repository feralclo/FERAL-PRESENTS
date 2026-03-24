"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Plus,
  Copy,
  Check,
  Loader2,
  Link2,
  Mail,
  ShieldCheck,
  XCircle,
  Clock,
  X,
  CheckCircle2,
  Instagram,
  CreditCard,
} from "lucide-react";
import type { ApplicationCampaignWithUsage } from "@/types/guest-list";
import type { GuestListEntry, AccessLevel } from "@/types/orders";

const ACCESS_LEVEL_OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: "guest_list", label: "Guest List" },
  { value: "vip", label: "VIP" },
  { value: "backstage", label: "Backstage" },
  { value: "aaa", label: "AAA" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/15 text-warning",
  invited: "bg-primary/15 text-primary",
  accepted: "bg-success/15 text-success",
  approved: "bg-success/15 text-success",
  declined: "bg-destructive/15 text-destructive",
};

interface ApplicationsTabProps {
  selectedEventId: string;
  orgId: string;
}

export function ApplicationsTab({ selectedEventId, orgId }: ApplicationsTabProps) {
  // Campaigns
  const [campaigns, setCampaigns] = useState<ApplicationCampaignWithUsage[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState("Guest List");
  const [createDesc, setCreateDesc] = useState("");
  const [createPrice, setCreatePrice] = useState("0");
  const [createAccess, setCreateAccess] = useState<AccessLevel>("guest_list");
  const [createCapacity, setCreateCapacity] = useState("");
  const [createInstagram, setCreateInstagram] = useState(true);
  const [createDob, setCreateDob] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Applications
  const [applications, setApplications] = useState<GuestListEntry[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [paidPriceInput, setPaidPriceInput] = useState<Record<string, string>>({});

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const res = await fetch(`/api/guest-list/campaigns?event_id=${selectedEventId}`);
      if (res.ok) {
        const json = await res.json();
        setCampaigns(json.campaigns || []);
      }
    } catch { /* silent */ }
    setLoadingCampaigns(false);
  }, [selectedEventId]);

  const loadApplications = useCallback(async () => {
    setLoadingApps(true);
    try {
      const res = await fetch(`/api/guest-list/${selectedEventId}`);
      if (res.ok) {
        const json = await res.json();
        const all = (json.data || []) as GuestListEntry[];
        setApplications(all.filter((e) => e.source === "application"));
      }
    } catch { /* silent */ }
    setLoadingApps(false);
  }, [selectedEventId]);

  useEffect(() => {
    loadCampaigns();
    loadApplications();
  }, [loadCampaigns, loadApplications]);

  const handleCreateCampaign = async () => {
    if (!createTitle.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/guest-list/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: selectedEventId,
          title: createTitle.trim(),
          description: createDesc.trim() || undefined,
          default_price: parseFloat(createPrice) || 0,
          access_level: createAccess,
          capacity: createCapacity ? parseInt(createCapacity) : undefined,
          fields: { instagram: createInstagram, date_of_birth: createDob },
        }),
      });
      setShowCreate(false);
      setCreateTitle("Guest List");
      setCreateDesc("");
      setCreatePrice("0");
      setCreateCapacity("");
      loadCampaigns();
    } catch { /* silent */ }
    setCreating(false);
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleToggleCampaign = async (id: string, active: boolean) => {
    await fetch("/api/guest-list/campaigns", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
    loadCampaigns();
  };

  const handleAccept = async (guestIds: string[], type: "free" | "paid", price?: number) => {
    setProcessingIds((prev) => { const s = new Set(prev); guestIds.forEach((id) => s.add(id)); return s; });
    try {
      await fetch("/api/guest-list/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_ids: guestIds,
          accept_type: type,
          payment_amount: type === "paid" ? (price || 5) : 0,
        }),
      });
      loadApplications();
      loadCampaigns();
    } catch { /* silent */ }
    setProcessingIds((prev) => { const s = new Set(prev); guestIds.forEach((id) => s.delete(id)); return s; });
  };

  const handleReject = async (guestId: string) => {
    setProcessingIds((prev) => new Set(prev).add(guestId));
    try {
      await fetch(`/api/guest-list/${selectedEventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: guestId, status: "declined" }),
      });
      loadApplications();
    } catch { /* silent */ }
    setProcessingIds((prev) => { const s = new Set(prev); s.delete(guestId); return s; });
  };

  const pendingApps = applications.filter((a) => a.status === "pending");
  const defaultPrice = campaigns.find((c) => c.active)?.default_price || 0;

  return (
    <div className="space-y-5">
      {/* Campaign management */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {campaigns.filter((c) => c.active).length === 0
            ? "Create a campaign to start accepting applications"
            : `${campaigns.filter((c) => c.active).length} active campaign${campaigns.filter((c) => c.active).length !== 1 ? "s" : ""}`
          }
        </p>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? <X size={14} /> : <Plus size={14} />}
          {showCreate ? "Cancel" : "New Campaign"}
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="py-0 gap-0 border-primary/20">
          <CardHeader className="pb-0 pt-5 px-6">
            <CardTitle className="text-sm">New Application Campaign</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Create a landing page where people can apply for guest list</p>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="Guest List" />
              </div>
              <div className="space-y-2">
                <Label>Default price <span className="text-muted-foreground/50 font-normal">(0 = free)</span></Label>
                <Input type="number" min="0" step="0.01" value={createPrice} onChange={(e) => setCreatePrice(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description <span className="text-muted-foreground/50 font-normal">(optional)</span></Label>
              <Input value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} placeholder="Apply for a spot on the guest list" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Access level</Label>
                <Select value={createAccess} onValueChange={(v) => setCreateAccess(v as AccessLevel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCESS_LEVEL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Capacity <span className="text-muted-foreground/50 font-normal">(optional)</span></Label>
                <Input type="number" min="1" value={createCapacity} onChange={(e) => setCreateCapacity(e.target.value)} placeholder="Unlimited" />
              </div>
              <div className="space-y-3 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={createInstagram} onCheckedChange={setCreateInstagram} />
                  <Instagram size={14} /> Instagram
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={createDob} onCheckedChange={setCreateDob} />
                  Date of birth
                </label>
              </div>
            </div>
            <Button size="sm" onClick={handleCreateCampaign} disabled={creating || !createTitle.trim()}>
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
              Create Campaign
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Campaign list */}
      {campaigns.length > 0 && (
        <div className="space-y-2">
          {campaigns.map((c) => (
            <Card key={c.id} className={`py-0 gap-0 ${!c.active ? "opacity-50" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{c.title}</p>
                      {c.default_price > 0 && <Badge variant="outline" className="text-[10px]">£{c.default_price}</Badge>}
                      {!c.active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {c.applied_count} application{c.applied_count !== 1 ? "s" : ""}
                      {c.capacity ? ` · ${c.capacity} max` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon-xs" onClick={() => handleCopy(c.url)} title="Copy link">
                      {copiedUrl === c.url ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                    </Button>
                    <Button variant="ghost" size="icon-xs"
                      onClick={() => handleToggleCampaign(c.id, !c.active)}
                      title={c.active ? "Deactivate" : "Activate"}
                      className={c.active ? "text-muted-foreground hover:text-destructive" : "text-muted-foreground hover:text-success"}>
                      {c.active ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Applications header */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Applications ({applications.length})
        </p>
        {pendingApps.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleAccept(pendingApps.map((a) => a.id), "free")}>
              <ShieldCheck size={14} /> Accept All Free ({pendingApps.length})
            </Button>
            {defaultPrice > 0 && (
              <Button variant="outline" size="sm" onClick={() => handleAccept(pendingApps.map((a) => a.id), "paid", defaultPrice)}>
                <CreditCard size={14} /> Accept All £{defaultPrice} ({pendingApps.length})
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Applications table */}
      {loadingApps ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-primary/60" />
          </CardContent>
        </Card>
      ) : applications.length === 0 ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">No applications yet</p>
            {campaigns.filter((c) => c.active).length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground/50">Create a campaign first</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0 gap-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Instagram</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[250px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((app) => {
                const appData = app.application_data as { instagram?: string; date_of_birth?: string } | null;
                const isPending = app.status === "pending";
                const isProcessing = processingIds.has(app.id);
                const priceVal = paidPriceInput[app.id] ?? String(defaultPrice || 5);

                return (
                  <TableRow key={app.id}>
                    <TableCell>
                      <span className="font-medium text-foreground">{app.name}</span>
                      {appData?.date_of_birth && (
                        <span className="ml-2 text-[10px] text-muted-foreground">{appData.date_of_birth}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{app.email || "—"}</TableCell>
                    <TableCell>
                      {appData?.instagram ? (
                        <span className="text-xs text-muted-foreground">{appData.instagram}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] gap-1 ${STATUS_COLORS[app.status || "pending"] || STATUS_COLORS.pending}`}>
                        {app.status === "pending" && <Clock size={10} />}
                        {app.status === "invited" && <Mail size={10} />}
                        {(app.status === "approved" || app.status === "accepted") && <CheckCircle2 size={10} />}
                        {app.status === "declined" && <XCircle size={10} />}
                        {app.status === "pending"
                          ? "Applied"
                          : app.status === "invited"
                            ? (app.payment_amount ? `Accepted — Awaiting Payment (£${((app.payment_amount || 0) / 100).toFixed(0)})` : "Accepted — Invite Sent")
                            : app.status === "approved"
                              ? "Ticket Issued"
                              : app.status === "declined"
                                ? "Declined"
                                : app.status || "Applied"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isPending && (
                        <div className="flex items-center gap-1.5">
                          <Button size="xs" variant="outline" onClick={() => handleAccept([app.id], "free")}
                            disabled={isProcessing} className="text-[10px] h-7">
                            {isProcessing ? <Loader2 size={10} className="animate-spin" /> : <ShieldCheck size={10} />}
                            Free
                          </Button>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">£</span>
                            <Input type="number" min="1" step="1" value={priceVal}
                              onChange={(e) => setPaidPriceInput((prev) => ({ ...prev, [app.id]: e.target.value }))}
                              className="h-7 w-14 text-[10px] px-1.5" />
                            <Button size="xs" variant="outline" onClick={() => handleAccept([app.id], "paid", parseFloat(priceVal))}
                              disabled={isProcessing} className="text-[10px] h-7">
                              <CreditCard size={10} /> Paid
                            </Button>
                          </div>
                          <Button size="xs" variant="ghost" onClick={() => handleReject(app.id)}
                            disabled={isProcessing} className="text-[10px] h-7 text-muted-foreground hover:text-destructive">
                            <XCircle size={10} />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
