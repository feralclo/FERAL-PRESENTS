"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  ClipboardCheck,
  Users,
  UserCheck,
  Download,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  Loader2,
  Send,
  Shield,
  Ticket,
  Link2,
  Copy,
  Check,
  Clock,
  Mail,
} from "lucide-react";
import type { GuestListEntry, AccessLevel } from "@/types/orders";

// ---------------------------------------------------------------------------
// Access level config
// ---------------------------------------------------------------------------

const ACCESS_LEVEL_OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: "guest_list", label: "Guest List" },
  { value: "vip", label: "VIP" },
  { value: "backstage", label: "Backstage" },
  { value: "aaa", label: "AAA" },
  { value: "artist", label: "Artist" },
];

const ACCESS_LEVEL_COLORS: Record<AccessLevel, string> = {
  guest_list: "bg-muted text-muted-foreground",
  vip: "bg-warning/15 text-warning border-warning/20",
  backstage: "bg-warning/15 text-warning border-warning/20",
  aaa: "bg-destructive/15 text-destructive border-destructive/20",
  artist: "bg-primary/15 text-primary border-primary/20",
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "outline" | "success" | "destructive" | "secondary" }> = {
  invited: { label: "Invited", variant: "outline" },
  accepted: { label: "Accepted", variant: "default" },
  pending: { label: "Pending", variant: "secondary" },
  approved: { label: "Approved", variant: "success" },
  confirmed: { label: "Confirmed", variant: "success" },
  declined: { label: "Declined", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GuestListPage() {
  const orgId = useOrgId();
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [entries, setEntries] = useState<GuestListEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState({
    total_entries: 0,
    total_guests: 0,
    checked_in: 0,
    status_counts: {} as Record<string, number>,
  });

  // Filter
  const [statusFilter, setStatusFilter] = useState("all");

  // Add form state
  const [showForm, setShowForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addQty, setAddQty] = useState("1");
  const [addNotes, setAddNotes] = useState("");
  const [addAccessLevel, setAddAccessLevel] = useState<AccessLevel>("guest_list");
  const [addSendInvite, setAddSendInvite] = useState(true);
  const [adding, setAdding] = useState(false);

  // Submission link state
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkArtistName, setLinkArtistName] = useState("");
  const [generatingLink, setGeneratingLink] = useState(false);
  const [generatedLinks, setGeneratedLinks] = useState<{ token: string; url: string; artist_name: string }[]>([]);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Action states
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const [invitingIds, setInvitingIds] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadEvents = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name")
      .eq("org_id", orgId)
      .order("date_start", { ascending: false });

    setEvents(data || []);
    if (data && data.length > 0 && !selectedEvent) {
      setSelectedEvent(data[0].id);
    }
  }, [selectedEvent, orgId]);

  const loadGuestList = useCallback(async () => {
    if (!selectedEvent) return;
    setLoading(true);

    const res = await fetch(`/api/guest-list/${selectedEvent}`);
    const json = await res.json();

    if (json.data) {
      setEntries(json.data);
      setSummary(json.summary || { total_entries: 0, total_guests: 0, checked_in: 0, status_counts: {} });
    }
    setLoading(false);
  }, [selectedEvent]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (selectedEvent) loadGuestList();
  }, [selectedEvent, loadGuestList]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim() || !selectedEvent) return;

    setAdding(true);
    try {
      const res = await fetch("/api/guest-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: selectedEvent,
          name: addName.trim(),
          email: addEmail.trim() || undefined,
          phone: addPhone.trim() || undefined,
          qty: parseInt(addQty, 10) || 1,
          notes: addNotes.trim() || undefined,
          access_level: addAccessLevel,
          send_invite: addEmail.trim() ? addSendInvite : false,
          added_by: "admin",
        }),
      });

      if (res.ok) {
        setAddName("");
        setAddEmail("");
        setAddPhone("");
        setAddQty("1");
        setAddNotes("");
        setAddAccessLevel("guest_list");
        setShowForm(false);
        loadGuestList();
      }
    } catch {
      // Network error
    }
    setAdding(false);
  };

  const handleCheckIn = async (entry: GuestListEntry) => {
    try {
      await fetch(`/api/guest-list/${selectedEvent}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: entry.id,
          checked_in: !entry.checked_in,
        }),
      });
      loadGuestList();
    } catch {
      // Network error
    }
  };

  const handleDelete = async (entryId: string) => {
    try {
      await fetch(`/api/guest-list/${selectedEvent}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entryId }),
      });
      setConfirmDeleteId(null);
      loadGuestList();
    } catch {
      // Network error
    }
  };

  const handleApprove = async (guestIds: string[]) => {
    const newSet = new Set(approvingIds);
    guestIds.forEach((id) => newSet.add(id));
    setApprovingIds(newSet);

    try {
      await fetch("/api/guest-list/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guest_ids: guestIds }),
      });
      loadGuestList();
    } catch {
      // Network error
    }

    const cleaned = new Set(approvingIds);
    guestIds.forEach((id) => cleaned.delete(id));
    setApprovingIds(cleaned);
  };

  const handleSendInvite = async (guestIds: string[]) => {
    const newSet = new Set(invitingIds);
    guestIds.forEach((id) => newSet.add(id));
    setInvitingIds(newSet);

    try {
      await fetch("/api/guest-list/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guest_ids: guestIds }),
      });
      loadGuestList();
    } catch {
      // Network error
    }

    const cleaned = new Set(invitingIds);
    guestIds.forEach((id) => cleaned.delete(id));
    setInvitingIds(cleaned);
  };

  const handleGenerateLink = async () => {
    if (!linkArtistName.trim() || !selectedEvent) return;
    setGeneratingLink(true);

    try {
      const res = await fetch("/api/guest-list/submission-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: selectedEvent,
          artist_name: linkArtistName.trim(),
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setGeneratedLinks((prev) => [...prev, json]);
        setLinkArtistName("");
        setShowLinkForm(false);
      }
    } catch {
      // Network error
    }
    setGeneratingLink(false);
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(url);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleExportCSV = () => {
    if (entries.length === 0) return;

    const headers = ["Name", "Email", "Phone", "Qty", "Access Level", "Status", "Notes", "Checked In", "Added By", "Submitted By"];
    const rows = entries.map((e) => [
      e.name,
      e.email || "",
      e.phone || "",
      String(e.qty),
      e.access_level || "guest_list",
      e.status || "confirmed",
      e.notes || "",
      e.checked_in ? "Yes" : "No",
      e.added_by || "",
      e.submitted_by || "",
    ]);

    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "guest-list.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ---------------------------------------------------------------------------
  // Filtered entries
  // ---------------------------------------------------------------------------

  const filteredEntries = statusFilter === "all"
    ? entries
    : entries.filter((e) => (e.status || "confirmed") === statusFilter);

  const sc = summary.status_counts;
  const acceptedCount = (sc.accepted || 0) + (sc.pending || 0);
  const approvedCount = (sc.approved || 0) + (sc.confirmed || 0);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">Guest List</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage invitations, access levels, and check-ins</p>
        </div>
        <div className="flex items-center gap-2">
          {entries.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download size={14} />
              Export
            </Button>
          )}
          {selectedEvent && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowLinkForm(!showLinkForm)}>
                <Link2 size={14} />
                {showLinkForm ? "Cancel" : "Submission Link"}
              </Button>
              <Button size="sm" onClick={() => setShowForm(!showForm)}>
                <Plus size={14} />
                {showForm ? "Cancel" : "Add Guest"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Event Selector */}
      <Card className="py-0 gap-0">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Label className="shrink-0 text-muted-foreground">Event</Label>
            <Select value={selectedEvent || "__none__"} onValueChange={(v) => setSelectedEvent(v === "__none__" ? "" : v)}>
              <SelectTrigger className="max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select Event</SelectItem>
                {events.map((evt) => (
                  <SelectItem key={evt.id} value={evt.id}>
                    {evt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!selectedEvent ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
              <ClipboardCheck size={20} className="text-primary/60" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">Select an event</p>
            <p className="mt-1 text-xs text-muted-foreground">Choose an event above to manage its guest list</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Guests"
              value={String(summary.total_guests)}
              icon={Users}
            />
            <StatCard
              label="Invited"
              value={String(sc.invited || 0)}
              icon={Mail}
              detail={acceptedCount > 0 ? `${acceptedCount} awaiting approval` : undefined}
            />
            <StatCard
              label="Approved"
              value={String(approvedCount)}
              icon={Ticket}
              detail="Tickets issued"
            />
            <StatCard
              label="Checked In"
              value={String(summary.checked_in)}
              icon={UserCheck}
              detail={summary.total_guests > 0 ? `${((summary.checked_in / summary.total_guests) * 100).toFixed(0)}% rate` : undefined}
            />
          </div>

          {/* DJ Submission Link Generator */}
          {showLinkForm && (
            <Card className="py-0 gap-0 border-primary/20">
              <CardHeader className="pb-0 pt-5 px-6">
                <CardTitle className="text-sm">Generate Submission Link</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Create a link for an artist or DJ to submit their guest list</p>
              </CardHeader>
              <CardContent className="p-6 pt-4">
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-2">
                    <Label>Artist / DJ Name</Label>
                    <Input
                      value={linkArtistName}
                      onChange={(e) => setLinkArtistName(e.target.value)}
                      placeholder="e.g. DJ Shadow"
                    />
                  </div>
                  <Button size="sm" onClick={handleGenerateLink} disabled={generatingLink || !linkArtistName.trim()}>
                    {generatingLink ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                    Generate
                  </Button>
                </div>

                {/* Generated links */}
                {generatedLinks.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {generatedLinks.map((link) => (
                      <div key={link.token} className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground">{link.artist_name}</p>
                          <p className="text-[11px] text-muted-foreground truncate font-mono">{link.url}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleCopyLink(link.url)}
                          className="shrink-0"
                        >
                          {copiedLink === link.url ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Add Form */}
          {showForm && (
            <Card className="py-0 gap-0 border-primary/20">
              <CardHeader className="pb-0 pt-5 px-6">
                <CardTitle className="text-sm">Add to Guest List</CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-4">
                <form onSubmit={handleAdd} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Name *</Label>
                      <Input
                        value={addName}
                        onChange={(e) => setAddName(e.target.value)}
                        placeholder="Full name"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={addEmail}
                        onChange={(e) => setAddEmail(e.target.value)}
                        placeholder="email@example.com"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-4">
                    <div className="space-y-2">
                      <Label>Access Level</Label>
                      <Select value={addAccessLevel} onValueChange={(v) => setAddAccessLevel(v as AccessLevel)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACCESS_LEVEL_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Qty</Label>
                      <Input
                        type="number"
                        value={addQty}
                        onChange={(e) => setAddQty(e.target.value)}
                        min="1"
                        max="10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        type="tel"
                        value={addPhone}
                        onChange={(e) => setAddPhone(e.target.value)}
                        placeholder="+44 7700 000000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Input
                        value={addNotes}
                        onChange={(e) => setAddNotes(e.target.value)}
                        placeholder="Optional notes"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {addEmail.trim() && (
                        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={addSendInvite}
                            onChange={(e) => setAddSendInvite(e.target.checked)}
                            className="rounded border-border"
                          />
                          Send invitation email
                        </label>
                      )}
                    </div>
                    <Button type="submit" size="sm" disabled={adding}>
                      {adding && <Loader2 size={14} className="animate-spin" />}
                      {adding ? "Adding..." : "Add to Guest List"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Bulk actions + status filter */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="all">All ({entries.length})</TabsTrigger>
                {(sc.invited || 0) > 0 && <TabsTrigger value="invited">Invited ({sc.invited})</TabsTrigger>}
                {(sc.accepted || 0) > 0 && <TabsTrigger value="accepted">Accepted ({sc.accepted})</TabsTrigger>}
                {(sc.pending || 0) > 0 && <TabsTrigger value="pending">Pending ({sc.pending})</TabsTrigger>}
                {(sc.approved || 0) > 0 && <TabsTrigger value="approved">Approved ({sc.approved})</TabsTrigger>}
                {(sc.confirmed || 0) > 0 && <TabsTrigger value="confirmed">Walk-ups ({sc.confirmed})</TabsTrigger>}
                {(sc.declined || 0) > 0 && <TabsTrigger value="declined">Declined ({sc.declined})</TabsTrigger>}
              </TabsList>
            </Tabs>

            {/* Bulk approve button */}
            {(sc.accepted || 0) + (sc.pending || 0) > 0 && statusFilter === "all" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const ids = entries
                    .filter((e) => (e.status === "accepted" || e.status === "pending") && e.email)
                    .map((e) => e.id);
                  if (ids.length > 0) handleApprove(ids);
                }}
              >
                <CheckCircle2 size={14} />
                Approve All ({acceptedCount})
              </Button>
            )}
          </div>

          {/* Guest List Table */}
          {loading ? (
            <Card className="py-0 gap-0">
              <CardContent className="flex items-center justify-center py-16">
                <Loader2 size={20} className="animate-spin text-primary/60" />
                <span className="ml-3 text-sm text-muted-foreground">Loading guest list...</span>
              </CardContent>
            </Card>
          ) : filteredEntries.length === 0 ? (
            <Card className="py-0 gap-0">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
                  <Users size={20} className="text-muted-foreground" />
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">
                  {entries.length === 0 ? "No guests yet" : "No guests match this filter"}
                </p>
                {entries.length === 0 && (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground">Add your first guest to get started</p>
                    <Button size="sm" className="mt-4" onClick={() => setShowForm(true)}>
                      <Plus size={14} />
                      Add Guest
                    </Button>
                  </>
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
                    <TableHead>Access</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[180px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => {
                    const status = entry.status || "confirmed";
                    const accessLevel = (entry.access_level || "guest_list") as AccessLevel;
                    const statusConfig = STATUS_LABELS[status] || STATUS_LABELS.confirmed;

                    return (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{entry.name}</span>
                            {entry.submitted_by && (
                              <span className="text-[11px] text-muted-foreground">
                                via {entry.submitted_by}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {entry.email || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-bold ${ACCESS_LEVEL_COLORS[accessLevel]}`}
                          >
                            {accessLevel === "aaa" ? "AAA" : ACCESS_LEVEL_OPTIONS.find((o) => o.value === accessLevel)?.label || accessLevel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-mono tabular-nums text-sm">{entry.qty}</TableCell>
                        <TableCell>
                          {status === "confirmed" || status === "approved" ? (
                            <button
                              onClick={() => handleCheckIn(entry)}
                              className="inline-flex items-center gap-1.5 transition-colors duration-200"
                            >
                              {entry.checked_in ? (
                                <Badge variant="success" className="gap-1 cursor-pointer">
                                  <CheckCircle2 size={11} />
                                  Checked In
                                </Badge>
                              ) : (
                                <Badge variant={statusConfig.variant} className="gap-1 cursor-pointer hover:border-success/40 hover:text-success">
                                  {status === "approved" ? <Ticket size={11} /> : <Circle size={11} />}
                                  {statusConfig.label}
                                </Badge>
                              )}
                            </button>
                          ) : (
                            <Badge variant={statusConfig.variant} className="gap-1">
                              {status === "invited" && <Clock size={11} />}
                              {status === "accepted" && <CheckCircle2 size={11} />}
                              {status === "pending" && <Clock size={11} />}
                              {statusConfig.label}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {/* Send/resend invite */}
                            {entry.email && (status === "confirmed" || status === "invited") && (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => handleSendInvite([entry.id])}
                                disabled={invitingIds.has(entry.id)}
                                title={status === "invited" ? "Resend invite" : "Send invite"}
                                className="text-muted-foreground hover:text-primary"
                              >
                                {invitingIds.has(entry.id) ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Send size={13} />
                                )}
                              </Button>
                            )}

                            {/* Approve */}
                            {entry.email && (status === "accepted" || status === "pending") && (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => handleApprove([entry.id])}
                                disabled={approvingIds.has(entry.id)}
                                title="Approve and issue ticket"
                                className="text-muted-foreground hover:text-success"
                              >
                                {approvingIds.has(entry.id) ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Shield size={13} />
                                )}
                              </Button>
                            )}

                            {/* Delete */}
                            {confirmDeleteId === entry.id ? (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="destructive"
                                  size="xs"
                                  onClick={() => handleDelete(entry.id)}
                                >
                                  Yes
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => setConfirmDeleteId(null)}
                                >
                                  No
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => setConfirmDeleteId(entry.id)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 size={13} />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
