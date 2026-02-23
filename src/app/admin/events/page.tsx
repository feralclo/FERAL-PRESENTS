"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker, DateTimePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  CalendarDays,
  Plus,
  Archive,
  RotateCcw,
  Trash2,
  Loader2,
  ArrowUpDown,
  X,
} from "lucide-react";
import type { Event } from "@/types/events";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const STATUS_VARIANT: Record<string, "warning" | "success" | "secondary" | "default" | "destructive"> = {
  draft: "warning",
  live: "success",
  past: "secondary",
  cancelled: "destructive",
  archived: "secondary",
};

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "draft", label: "Draft" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
  { key: "archived", label: "Archived" },
];

type EventWithTickets = Event & {
  ticket_types?: { sold: number; capacity: number | null; price: number }[];
};

export default function EventsPage() {
  const orgId = useOrgId();
  const router = useRouter();
  const [events, setEvents] = useState<EventWithTickets[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Filter state
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateOrder, setDateOrder] = useState<"desc" | "asc">("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Create form state
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newVenue, setNewVenue] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newPayment, setNewPayment] = useState<"test" | "stripe">("test");
  const [newVisibility, setNewVisibility] = useState<"public" | "private" | "unlisted">("private");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const loadEvents = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data } = await supabase
      .from(TABLES.EVENTS)
      .select("*, ticket_types(sold, capacity, price)")
      .eq("org_id", orgId)
      .order("date_start", { ascending: false });

    setEvents((data as typeof events) || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Filtered and sorted events
  const filteredEvents = useMemo(() => {
    let result = events;

    if (statusFilter === "all") {
      result = result.filter((e) => e.status !== "archived");
    } else {
      result = result.filter((e) => e.status === statusFilter);
    }

    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      result = result.filter((e) => new Date(e.date_start).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000;
      result = result.filter((e) => new Date(e.date_start).getTime() <= to);
    }

    result = [...result].sort((a, b) => {
      const diff = new Date(a.date_start).getTime() - new Date(b.date_start).getTime();
      return dateOrder === "asc" ? diff : -diff;
    });

    return result;
  }, [events, statusFilter, dateOrder, dateFrom, dateTo]);

  // Status counts for tabs
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    for (const e of events) {
      counts[e.status] = (counts[e.status] || 0) + 1;
      if (e.status !== "archived") counts.all++;
    }
    return counts;
  }, [events]);

  const handleArchive = async (evt: EventWithTickets) => {
    setActionLoading(evt.id);
    try {
      await fetch(`/api/events/${evt.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      await loadEvents();
    } catch {
      // Silently fail
    }
    setActionLoading(null);
  };

  const handleUnarchive = async (evt: EventWithTickets) => {
    setActionLoading(evt.id);
    try {
      await fetch(`/api/events/${evt.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      await loadEvents();
    } catch {
      // Silently fail
    }
    setActionLoading(null);
  };

  const handleDelete = async (evt: EventWithTickets) => {
    setActionLoading(evt.id);
    try {
      const res = await fetch(`/api/events/${evt.id}`, { method: "DELETE" });
      if (res.ok) {
        await loadEvents();
        setConfirmDelete(null);
      }
    } catch {
      // Silently fail
    }
    setActionLoading(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");

    if (!newName || !newDate) {
      setCreateError("Name and date are required");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          slug: newSlug || slugify(newName),
          venue_name: newVenue || undefined,
          city: newCity || undefined,
          date_start: new Date(newDate).toISOString(),
          payment_method: newPayment,
          visibility: newVisibility,
          status: "draft",
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setCreateError(json.error || "Failed to create event");
        setCreating(false);
        return;
      }

      setCreating(false);
      router.push(`/admin/events/${json.data.slug}/`);
    } catch {
      setCreateError("Network error");
      setCreating(false);
    }
  };

  const getTicketStats = (evt: EventWithTickets) => {
    const types = evt.ticket_types || [];
    const sold = types.reduce((s, t) => s + (t.sold || 0), 0);
    const capacity = types.reduce((s, t) => s + (t.capacity || 0), 0);
    const revenue = types.reduce(
      (s, t) => s + (t.sold || 0) * Number(t.price || 0),
      0
    );
    const hasCapacity = types.some((t) => t.capacity !== null);
    return { sold, capacity: hasCapacity ? capacity : null, revenue };
  };

  const hasDateFilters = dateFrom || dateTo;

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">Events</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create and manage your events</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? (
            <>
              <X size={14} />
              Cancel
            </>
          ) : (
            <>
              <Plus size={14} />
              Create Event
            </>
          )}
        </Button>
      </div>

      {/* Create Event Form */}
      {showCreate && (
        <Card className="py-0 gap-0 border-primary/20">
          <CardHeader className="pb-0 pt-5 px-6">
            <CardTitle className="text-sm">New Event</CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-4">
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Event Name *</Label>
                  <Input
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      if (!newSlug) setNewSlug(slugify(e.target.value));
                    }}
                    placeholder="e.g. Summer Launch Party"
                  />
                </div>
                <div className="space-y-2">
                  <Label>URL Slug</Label>
                  <Input
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    placeholder="auto-generated"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Venue</Label>
                  <Input
                    value={newVenue}
                    onChange={(e) => setNewVenue(e.target.value)}
                    placeholder="e.g. Invisible Wind Factory"
                  />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    placeholder="e.g. Liverpool"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Date & Time *</Label>
                  <DateTimePicker
                    value={newDate}
                    onChange={setNewDate}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select value={newPayment} onValueChange={(v) => setNewPayment(v as typeof newPayment)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="test">Test (Simulated)</SelectItem>
                      <SelectItem value="stripe">Stripe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Visibility</Label>
                  <Select value={newVisibility} onValueChange={(v) => setNewVisibility(v as typeof newVisibility)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Private (Secret Link)</SelectItem>
                      <SelectItem value="unlisted">Unlisted</SelectItem>
                      <SelectItem value="public">Public</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {createError && (
                <p className="text-sm text-destructive">{createError}</p>
              )}
              <Button type="submit" size="sm" disabled={creating}>
                {creating && <Loader2 size={14} className="animate-spin" />}
                {creating ? "Creating..." : "Create Event"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filter Bar */}
      {!loading && events.length > 0 && (
        <Card className="py-0 gap-0">
          <CardContent className="p-4 space-y-3">
            {/* Status tabs */}
            <div className="flex gap-1 flex-wrap">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`rounded-md px-3 py-1.5 font-mono text-[11px] font-medium tracking-wide transition-all duration-200 ${
                    statusFilter === tab.key
                      ? "bg-primary/15 text-primary ring-1 ring-primary/20"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {statusCounts[tab.key] ? (
                    <span className="ml-1.5 text-[10px] opacity-60">
                      {statusCounts[tab.key]}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            {/* Date filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground shrink-0">From</Label>
                <DatePicker
                  value={dateFrom}
                  onChange={setDateFrom}
                  className="h-8 w-[140px] text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground shrink-0">To</Label>
                <DatePicker
                  value={dateTo}
                  onChange={setDateTo}
                  className="h-8 w-[140px] text-xs"
                />
              </div>
              {hasDateFilters && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                  className="text-primary"
                >
                  Clear
                </Button>
              )}
              <Button
                variant="outline"
                size="xs"
                onClick={() => setDateOrder(dateOrder === "desc" ? "asc" : "desc")}
                className="ml-auto"
              >
                <ArrowUpDown size={12} />
                {dateOrder === "desc" ? "Newest" : "Oldest"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Events Table */}
      {loading ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-primary/60" />
            <span className="ml-3 text-sm text-muted-foreground">Loading events...</span>
          </CardContent>
        </Card>
      ) : events.length === 0 ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
              <CalendarDays size={20} className="text-primary/60" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">No events yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Create your first event to get started</p>
            <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus size={14} />
              Create Event
            </Button>
          </CardContent>
        </Card>
      ) : filteredEvents.length === 0 ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">No events match the current filters</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-primary"
              onClick={() => { setStatusFilter("all"); setDateFrom(""); setDateTo(""); }}
            >
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0 gap-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Venue</TableHead>
                <TableHead className="text-right">Tickets</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEvents.map((evt) => {
                const stats = getTicketStats(evt);
                const isArchived = evt.status === "archived";
                return (
                  <TableRow
                    key={evt.id}
                    className={isArchived ? "opacity-50" : "cursor-pointer"}
                    onClick={() => !isArchived && router.push(`/admin/events/${evt.slug}/`)}
                  >
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[evt.status] || "secondary"}>
                        {evt.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/events/${evt.slug}/`}
                        className="font-medium text-foreground hover:text-primary transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {evt.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                      {new Date(evt.date_start).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {evt.venue_name || "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {stats.sold}
                      {stats.capacity !== null ? (
                        <span className="text-muted-foreground"> / {stats.capacity}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-success">
                      £{stats.revenue.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          evt.payment_method === "test"
                            ? "warning"
                            : evt.payment_method === "stripe"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {evt.payment_method}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {isArchived ? (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleUnarchive(evt)}
                            disabled={actionLoading === evt.id}
                            className="text-success hover:text-success"
                          >
                            {actionLoading === evt.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <RotateCcw size={12} />
                            )}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleArchive(evt)}
                            disabled={actionLoading === evt.id}
                            title="Archive"
                            className="text-muted-foreground"
                          >
                            {actionLoading === evt.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Archive size={12} />
                            )}
                          </Button>
                        )}
                        {confirmDelete === evt.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="destructive"
                              size="xs"
                              onClick={() => handleDelete(evt)}
                              disabled={actionLoading === evt.id}
                            >
                              {actionLoading === evt.id ? "..." : "Yes"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => setConfirmDelete(null)}
                            >
                              No
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setConfirmDelete(evt.id)}
                            title="Delete"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 size={12} />
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
    </div>
  );
}
