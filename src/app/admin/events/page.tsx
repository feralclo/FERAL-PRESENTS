"use client";

import { useState, useEffect, useCallback } from "react";
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
  draft: "#ffc107",
  live: "#4ecb71",
  past: "#888",
  cancelled: "#ff0033",
};

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<(Event & { ticket_types?: { sold: number; capacity: number | null; price: number }[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

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

      // Redirect to the event editor
      setCreating(false);
      router.push(`/admin/events/${json.data.slug}/`);
    } catch {
      setCreateError("Network error");
      setCreating(false);
    }
  };

  const getTicketStats = (evt: typeof events[0]) => {
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

      {/* Events Table */}
      {loading ? (
        <div className="admin-loading">Loading events...</div>
      ) : events.length === 0 ? (
        <div className="admin-empty">
          <p>No events yet. Create your first event to get started.</p>
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
              </tr>
            </thead>
            <tbody>
              {events.map((evt) => {
                const stats = getTicketStats(evt);
                return (
                  <tr key={evt.id}>
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
                              ? "#ffc10722"
                              : evt.payment_method === "stripe"
                                ? "#635bff22"
                                : "#88888822",
                          color:
                            evt.payment_method === "test"
                              ? "#ffc107"
                              : evt.payment_method === "stripe"
                                ? "#635bff"
                                : "#888",
                        }}
                      >
                        {evt.payment_method}
                      </span>
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
