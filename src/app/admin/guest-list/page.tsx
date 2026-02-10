"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, ORG_ID } from "@/lib/constants";
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

  const handleDelete = async (entryId: string) => {
    if (!confirm("Remove this guest list entry?")) return;

    try {
      await fetch(`/api/guest-list/${selectedEvent}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entryId }),
      });
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

  return (
    <div>
      <h1 className="admin-title">Guest List</h1>

      {/* Event Selector */}
      <div className="admin-filters">
        <select
          className="admin-form__input admin-filter__select"
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
        {entries.length > 0 && (
          <button className="admin-btn admin-btn--secondary" onClick={handleExportCSV}>
            Export CSV
          </button>
        )}
      </div>

      {!selectedEvent ? (
        <div className="admin-empty">
          <p>Select an event to manage its guest list.</p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="admin-stats">
            <div className="admin-stat-card">
              <div className="admin-stat-card__value">
                {summary.total_entries}
              </div>
              <div className="admin-stat-card__label">Entries</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-card__value">
                {summary.total_guests}
              </div>
              <div className="admin-stat-card__label">Total Guests</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-card__value">
                {summary.checked_in}
              </div>
              <div className="admin-stat-card__label">Checked In</div>
            </div>
          </div>

          {/* Add Form */}
          <div className="admin-section admin-create-form">
            <h2 className="admin-section__title">Add to Guest List</h2>
            <form onSubmit={handleAdd} className="admin-form">
              <div className="admin-form__row">
                <div className="admin-form__field">
                  <label className="admin-form__label">Name *</label>
                  <input
                    type="text"
                    className="admin-form__input"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="Full name"
                    required
                  />
                </div>
                <div className="admin-form__field">
                  <label className="admin-form__label">Email</label>
                  <input
                    type="email"
                    className="admin-form__input"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
              </div>
              <div className="admin-form__row">
                <div className="admin-form__field">
                  <label className="admin-form__label">Phone</label>
                  <input
                    type="tel"
                    className="admin-form__input"
                    value={addPhone}
                    onChange={(e) => setAddPhone(e.target.value)}
                    placeholder="+44 7700 000000"
                  />
                </div>
                <div className="admin-form__field">
                  <label className="admin-form__label">Qty</label>
                  <input
                    type="number"
                    className="admin-form__input"
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                    min="1"
                    max="10"
                  />
                </div>
              </div>
              <div className="admin-form__field">
                <label className="admin-form__label">Notes</label>
                <input
                  type="text"
                  className="admin-form__input"
                  value={addNotes}
                  onChange={(e) => setAddNotes(e.target.value)}
                  placeholder="VIP, plus one, artist, etc."
                />
              </div>
              <button
                type="submit"
                className="admin-btn admin-btn--primary"
                disabled={adding}
              >
                {adding ? "Adding..." : "Add to Guest List"}
              </button>
            </form>
          </div>

          {/* Guest List Table */}
          {loading ? (
            <div className="admin-loading">Loading guest list...</div>
          ) : entries.length === 0 ? (
            <div className="admin-empty">
              <p>No guest list entries for this event yet.</p>
            </div>
          ) : (
            <div className="admin-section">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Qty</th>
                    <th>Notes</th>
                    <th>Checked In</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.name}</td>
                      <td>{entry.email || "—"}</td>
                      <td className="admin-table__mono">{entry.qty}</td>
                      <td>{entry.notes || "—"}</td>
                      <td>
                        <button
                          className={`admin-checkin-btn ${entry.checked_in ? "admin-checkin-btn--checked" : ""}`}
                          onClick={() => handleCheckIn(entry)}
                        >
                          {entry.checked_in ? "✓ Checked In" : "Check In"}
                        </button>
                      </td>
                      <td>
                        <button
                          className="admin-btn-icon admin-btn-icon--danger"
                          onClick={() => handleDelete(entry.id)}
                          title="Remove"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
