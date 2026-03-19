"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, CheckCircle2, UserCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface GuestListEntry {
  id: string;
  name: string;
  email?: string;
  qty: number;
  notes?: string;
  checked_in: boolean;
  checked_in_at?: string;
}

interface GuestListSearchProps {
  eventId: string;
  onCheckIn: () => void;
}

export function GuestListSearch({ eventId, onCheckIn }: GuestListSearchProps) {
  const [guests, setGuests] = useState<GuestListEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);

  const fetchGuests = useCallback(async () => {
    try {
      const res = await fetch(`/api/guest-list/${eventId}`);
      if (res.ok) {
        const json = await res.json();
        setGuests(json.data || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    fetchGuests();
  }, [fetchGuests]);

  const handleCheckIn = async (guest: GuestListEntry) => {
    if (guest.checked_in || checkingIn) return;
    setCheckingIn(guest.id);

    try {
      const res = await fetch(`/api/guest-list/${eventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: guest.id, checked_in: true }),
      });

      if (res.ok) {
        setGuests((prev) =>
          prev.map((g) =>
            g.id === guest.id
              ? { ...g, checked_in: true, checked_in_at: new Date().toISOString() }
              : g
          )
        );
        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(200);
        onCheckIn();
      }
    } catch { /* silent */ }
    setCheckingIn(null);
  };

  const filtered = search
    ? guests.filter((g) =>
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        g.email?.toLowerCase().includes(search.toLowerCase())
      )
    : guests;

  const checkedInCount = guests.filter((g) => g.checked_in).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full rounded-xl border border-input bg-background/50 pl-10 pr-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-[3px] focus:ring-primary/15"
          autoComplete="off"
        />
      </div>

      {/* Summary */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users size={12} />
        <span>{checkedInCount}/{guests.length} checked in</span>
      </div>

      {/* List */}
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              {search ? "No matches found" : "No guests on the list"}
            </p>
          </div>
        ) : (
          filtered.map((guest) => (
            <button
              key={guest.id}
              type="button"
              onClick={() => handleCheckIn(guest)}
              disabled={guest.checked_in || checkingIn === guest.id}
              className={cn(
                "w-full text-left rounded-xl border p-4 transition-all active:scale-[0.98]",
                guest.checked_in
                  ? "border-success/20 bg-success/5"
                  : "border-border/60 bg-card hover:border-primary/30"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  guest.checked_in ? "bg-success/15" : "bg-muted"
                )}>
                  {guest.checked_in ? (
                    <CheckCircle2 size={18} className="text-success" />
                  ) : checkingIn === guest.id ? (
                    <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                  ) : (
                    <UserCheck size={18} className="text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{guest.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {guest.qty > 1 && (
                      <span className="text-xs text-muted-foreground">+{guest.qty - 1} guests</span>
                    )}
                    {guest.notes && (
                      <span className="text-xs text-muted-foreground/60 truncate">{guest.notes}</span>
                    )}
                  </div>
                </div>
                {guest.checked_in && (
                  <span className="text-[10px] font-medium text-success shrink-0">
                    Checked in
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
