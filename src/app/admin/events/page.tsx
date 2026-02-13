"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, ORG_ID } from "@/lib/constants";
import type { Event } from "@/types/events";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const STATUS_COLORS: Record<string, string> = {
  draft: "#FBBF24",
  live: "#34D399",
  past: "#888",
  cancelled: "#8B5CF6",
  archived: "#555",
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
  const [newPayment, setNewPayment] = useState<"test" | "weeztix" | "stripe">("test");
  const [newVisibility, setNewVisibility] = useState<"public" | "private" | "unlisted">("private");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const loadEvents = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data } = await supabase
      .from(TABLES.EVENTS)
      .select("*, ticket_types(sold, capacity, price)")
      .eq("org_id", ORG_ID)
      .order("date_start", { ascending: false });

    setEvents((data as typeof events) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Filtered and sorted events
  const filteredEvents = useMemo(() => {
    let result = events;

    // Status filter (default "all" hides archived)
    if (statusFilter === "all") {
      result = result.filter((e) => e.status !== "archived");
    } else {
      result = result.filter((e) => e.status === statusFilter);
    }

    // Date range filter
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      result = result.filter((e) => new Date(e.date_start).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000; // include end date
      result = result.filter((e) => new Date(e.date_start).getTime() <= to);
    }

    // Sort
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

  return (
    <div>
      <div className="admin-page-header">
        <h1 className="admin-title">Events</h1>
        <button
          className="admin-btn admin-btn--primary"
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? "Cancel" : "+ Create Event"}
        </button>
      </div>

      {/* Create Event Form */}
      {showCreate && (
        <div className="admin-section admin-create-form">
          <h2 className="admin-section__title">New Event</h2>
          <form onSubmit={handleCreate} className="admin-form">
            <div className="admin-form__row">
              <div className="admin-form__field">
                <label className="admin-form__label">Event Name *</label>
                <input
                  type="text"
                  className="admin-form__input"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    if (!newSlug) setNewSlug(slugify(e.target.value));
                  }}
                  placeholder="e.g. FERAL Liverpool June"
                />
              </div>
              <div className="admin-form__field">
                <label className="admin-form__label">URL Slug</label>
                <input
                  type="text"
                  className="admin-form__input"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  placeholder="auto-generated"
                />
              </div>
            </div>
            <div className="admin-form__row">
              <div className="admin-form__field">
                <label className="admin-form__label">Venue</label>
                <input
                  type="text"
                  className="admin-form__input"
                  value={newVenue}
                  onChange={(e) => setNewVenue(e.target.value)}
                  placeholder="e.g. Invisible Wind Factory"
                />
              </div>
              <div className="admin-form__field">
                <label className="admin-form__label">City</label>
                <input
                  type="text"
                  className="admin-form__input"
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  placeholder="e.g. Liverpool"
                />
              </div>
            </div>
            <div className="admin-form__row">
              <div className="admin-form__field">
                <label className="admin-form__label">Date & Time *</label>
                <input
                  type="datetime-local"
                  className="admin-form__input"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </div>
              <div className="admin-form__field">
                <label className="admin-form__label">Payment Method</label>
                <select
                  className="admin-form__input"
                  value={newPayment}
                  onChange={(e) =>
                    setNewPayment(e.target.value as typeof newPayment)
                  }
                >
                  <option value="test">Test (Simulated)</option>
                  <option value="weeztix">WeeZTix</option>
                  <option value="stripe">Stripe</option>
                </select>
              </div>
            </div>
            <div className="admin-form__row">
              <div className="admin-form__field">
                <label className="admin-form__label">Visibility</label>
                <select
                  className="admin-form__input"
                  value={newVisibility}
                  onChange={(e) =>
                    setNewVisibility(e.target.value as typeof newVisibility)
                  }
                >
                  <option value="private">Private (Secret Link)</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
              </div>
            </div>
            {createError && (
              <div className="admin-form__error">{createError}</div>
            )}
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={creating}
            >
              {creating ? "Creating..." : "Create Event"}
            </button>
          </form>
        </div>
      )}

      {/* Filter Bar */}
      {!loading && events.length > 0 && (
        <div className="admin-section" style={{ padding: "12px 16px" }}>
          {/* Status tabs */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                style={{
                  padding: "5px 12px",
                  fontSize: "0.72rem",
                  background: statusFilter === tab.key ? "#8B5CF622" : "transparent",
                  color: statusFilter === tab.key ? "#8B5CF6" : "#888",
                  border: `1px solid ${statusFilter === tab.key ? "#8B5CF644" : "#333"}`,
                  cursor: "pointer",
                  fontFamily: "'Space Mono', monospace",
                  letterSpacing: "0.5px",
                }}
              >
                {tab.label}
                {statusCounts[tab.key] ? ` (${statusCounts[tab.key]})` : ""}
              </button>
            ))}
          </div>

          {/* Date filters row */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", color: "#8888a0" }}>From</label>
              <input
                type="date"
                className="admin-form__input"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{ width: 140, padding: "4px 8px", fontSize: "0.72rem" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", color: "#8888a0" }}>To</label>
              <input
                type="date"
                className="admin-form__input"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{ width: 140, padding: "4px 8px", fontSize: "0.72rem" }}
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                style={{
                  fontSize: "0.68rem",
                  color: "#8B5CF6",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Clear dates
              </button>
            )}
            <button
              onClick={() => setDateOrder(dateOrder === "desc" ? "asc" : "desc")}
              style={{
                marginLeft: "auto",
                padding: "5px 10px",
                fontSize: "0.7rem",
                background: "transparent",
                color: "#8888a0",
                border: "1px solid #1e1e2a",
                cursor: "pointer",
                fontFamily: "'Space Mono', monospace",
              }}
            >
              Date {dateOrder === "desc" ? "Newest first" : "Oldest first"}
            </button>
          </div>
        </div>
      )}

      {/* Events Table */}
      {loading ? (
        <div className="admin-loading">Loading events...</div>
      ) : events.length === 0 ? (
        <div className="admin-empty">
          <p>No events yet. Create your first event to get started.</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="admin-empty">
          <p>No events match the current filters.</p>
        </div>
      ) : (
        <div className="admin-section">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Event</th>
                <th>Date</th>
                <th>Venue</th>
                <th>Tickets</th>
                <th>Revenue</th>
                <th>Payment</th>
                <th style={{ width: 90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((evt) => {
                const stats = getTicketStats(evt);
                const isArchived = evt.status === "archived";
                return (
                  <tr key={evt.id} style={isArchived ? { opacity: 0.6 } : undefined}>
                    <td>
                      <span
                        className="admin-badge"
                        style={{
                          background: `${STATUS_COLORS[evt.status] || "#888"}22`,
                          color: STATUS_COLORS[evt.status] || "#888",
                        }}
                      >
                        {evt.status}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/admin/events/${evt.slug}/`}
                        className="admin-link"
                      >
                        {evt.name}
                      </Link>
                    </td>
                    <td className="admin-table__mono">
                      {new Date(evt.date_start).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td>{evt.venue_name || "—"}</td>
                    <td className="admin-table__mono">
                      {stats.sold}
                      {stats.capacity !== null ? ` / ${stats.capacity}` : ""}
                    </td>
                    <td className="admin-table__mono admin-table__price">
                      £{stats.revenue.toFixed(2)}
                    </td>
                    <td>
                      <span
                        className="admin-badge"
                        style={{
                          background:
                            evt.payment_method === "test"
                              ? "#FBBF2422"
                              : evt.payment_method === "stripe"
                                ? "#635bff22"
                                : "#88888822",
                          color:
                            evt.payment_method === "test"
                              ? "#FBBF24"
                              : evt.payment_method === "stripe"
                                ? "#635bff"
                                : "#888",
                        }}
                      >
                        {evt.payment_method}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        {isArchived ? (
                          <button
                            onClick={() => handleUnarchive(evt)}
                            disabled={actionLoading === evt.id}
                            title="Restore to Draft"
                            style={{
                              padding: "3px 8px",
                              fontSize: "0.62rem",
                              background: "#34D39922",
                              color: "#34D399",
                              border: "1px solid #34D39944",
                              cursor: "pointer",
                            }}
                          >
                            {actionLoading === evt.id ? "..." : "Restore"}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleArchive(evt)}
                            disabled={actionLoading === evt.id}
                            title="Archive event"
                            style={{
                              padding: "3px 8px",
                              fontSize: "0.62rem",
                              background: "transparent",
                              color: "#8888a0",
                              border: "1px solid #1e1e2a",
                              cursor: "pointer",
                            }}
                          >
                            {actionLoading === evt.id ? "..." : "Archive"}
                          </button>
                        )}
                        {confirmDelete === evt.id ? (
                          <>
                            <button
                              onClick={() => handleDelete(evt)}
                              disabled={actionLoading === evt.id}
                              style={{
                                padding: "3px 8px",
                                fontSize: "0.62rem",
                                background: "#8B5CF622",
                                color: "#8B5CF6",
                                border: "1px solid #8B5CF644",
                                cursor: "pointer",
                              }}
                            >
                              {actionLoading === evt.id ? "..." : "Confirm"}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              style={{
                                padding: "3px 6px",
                                fontSize: "0.62rem",
                                background: "transparent",
                                color: "#8888a0",
                                border: "1px solid #1e1e2a",
                                cursor: "pointer",
                              }}
                            >
                              No
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(evt.id)}
                            title="Permanently delete"
                            style={{
                              padding: "3px 8px",
                              fontSize: "0.62rem",
                              background: "transparent",
                              color: "#8B5CF688",
                              border: "1px solid #8B5CF633",
                              cursor: "pointer",
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
