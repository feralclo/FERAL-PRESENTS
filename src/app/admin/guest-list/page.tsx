"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, ORG_ID } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import type { GuestListEntry } from "@/types/orders";

export default function GuestListPage() {
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [entries, setEntries] = useState<GuestListEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState({
    total_entries: 0,
    total_guests: 0,
    checked_in: 0,
  });

  // Add form state
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addQty, setAddQty] = useState("1");
  const [addNotes, setAddNotes] = useState("");
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const loadEvents = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name")
      .eq("org_id", ORG_ID)
      .order("date_start", { ascending: false });

    setEvents(data || []);
    if (data && data.length > 0 && !selectedEvent) {
      setSelectedEvent(data[0].id);
    }
  }, [selectedEvent]);

  const loadGuestList = useCallback(async () => {
    if (!selectedEvent) return;
    setLoading(true);

    const res = await fetch(`/api/guest-list/${selectedEvent}`);
    const json = await res.json();

    if (json.data) {
      setEntries(json.data);
      setSummary(json.summary || { total_entries: 0, total_guests: 0, checked_in: 0 });
    }
    setLoading(false);
  }, [selectedEvent]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (selectedEvent) loadGuestList();
  }, [selectedEvent, loadGuestList]);

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
          added_by: "admin",
        }),
      });

      if (res.ok) {
        setAddName("");
        setAddEmail("");
        setAddPhone("");
        setAddQty("1");
        setAddNotes("");
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
          checked_in_count: entry.checked_in ? entry.checked_in_count : entry.checked_in_count + 1,
        }),
      });
      loadGuestList();
    } catch {
      // Network error
    }
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  const handleExportCSV = () => {
    if (entries.length === 0) return;

    const headers = ["Name", "Email", "Phone", "Qty", "Notes", "Checked In", "Added By"];
    const rows = entries.map((e) => [
      e.name,
      e.email || "",
      e.phone || "",
      String(e.qty),
      e.notes || "",
      e.checked_in ? "Yes" : "No",
      e.added_by || "",
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

  const checkInRate =
    summary.total_guests > 0
      ? ((summary.checked_in / summary.total_guests) * 100).toFixed(0)
      : "0";

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">Guest List</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage guest lists and check-ins for your events</p>
        </div>
        <div className="flex items-center gap-3">
          {entries.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download size={14} />
              Export CSV
            </Button>
          )}
          {selectedEvent && (
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus size={14} />
              {showForm ? "Cancel" : "Add Guest"}
            </Button>
          )}
        </div>
      </div>

      {/* Event Selector */}
      <Card className="py-0 gap-0">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Label className="shrink-0 text-muted-foreground">Event</Label>
            <select
              className="flex h-9 w-full max-w-sm rounded-md border border-input bg-background/50 px-3 py-1 text-sm transition-colors focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
            >
              <option value="">Select Event</option>
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.name}
                </option>
              ))}
            </select>
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
              label="Entries"
              value={String(summary.total_entries)}
              icon={ClipboardCheck}
            />
            <StatCard
              label="Total Guests"
              value={String(summary.total_guests)}
              icon={Users}
            />
            <StatCard
              label="Checked In"
              value={String(summary.checked_in)}
              icon={UserCheck}
              detail={`${checkInRate}% check-in rate`}
            />
            <StatCard
              label="Remaining"
              value={String(Math.max(0, summary.total_guests - summary.checked_in))}
              icon={Circle}
              detail="Still expected"
            />
          </div>

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
                  <div className="grid gap-4 sm:grid-cols-3">
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
                      <Label>Notes</Label>
                      <Input
                        value={addNotes}
                        onChange={(e) => setAddNotes(e.target.value)}
                        placeholder="VIP, plus one, artist..."
                      />
                    </div>
                  </div>
                  <Button type="submit" size="sm" disabled={adding}>
                    {adding && <Loader2 size={14} className="animate-spin" />}
                    {adding ? "Adding..." : "Add to Guest List"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Guest List Table */}
          {loading ? (
            <Card className="py-0 gap-0">
              <CardContent className="flex items-center justify-center py-16">
                <Loader2 size={20} className="animate-spin text-primary/60" />
                <span className="ml-3 text-sm text-muted-foreground">Loading guest list...</span>
              </CardContent>
            </Card>
          ) : entries.length === 0 ? (
            <Card className="py-0 gap-0">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
                  <Users size={20} className="text-muted-foreground" />
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">No guests yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Add your first guest to get started</p>
                <Button size="sm" className="mt-4" onClick={() => setShowForm(true)}>
                  <Plus size={14} />
                  Add Guest
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="py-0 gap-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell className="text-muted-foreground">{entry.email || "—"}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums">{entry.qty}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground text-xs">
                        {entry.notes || "—"}
                      </TableCell>
                      <TableCell className="text-center">
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
                            <Badge variant="outline" className="gap-1 cursor-pointer hover:border-success/40 hover:text-success">
                              <Circle size={11} />
                              Check In
                            </Badge>
                          )}
                        </button>
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
