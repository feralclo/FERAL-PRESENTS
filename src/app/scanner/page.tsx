"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Scan, LogOut, RefreshCw } from "lucide-react";
import { EventCard } from "@/components/scanner/EventCard";
import { getSupabaseClient } from "@/lib/supabase/client";

interface EventStats {
  total_tickets: number;
  scanned: number;
  merch_total: number;
  merch_collected: number;
  guest_list_total: number;
  guest_list_checked_in: number;
}

interface ScannerEvent {
  id: string;
  name: string;
  slug: string;
  venue_name?: string;
  date_start: string;
  doors_time?: string;
  status: string;
  cover_image?: string;
  stats: EventStats;
}

export default function ScannerHomePage() {
  const [events, setEvents] = useState<ScannerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scanner/events");
      if (res.status === 403) {
        setError("You don't have scanner permission. Ask your org admin to enable 'Orders & Scanning' access for your account.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError("Failed to load events");
        setLoading(false);
        return;
      }
      const json = await res.json();
      setEvents(json.events || []);
    } catch {
      setError("Network error — check your connection");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleLogout = async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    window.location.href = "/scanner/login";
  };

  const isToday = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  };

  // Sort: today first, then future, then past
  const sortedEvents = [...events].sort((a, b) => {
    const aToday = isToday(a.date_start);
    const bToday = isToday(b.date_start);
    if (aToday && !bToday) return -1;
    if (!aToday && bToday) return 1;
    return new Date(a.date_start).getTime() - new Date(b.date_start).getTime();
  });

  return (
    <div className="px-5 py-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
            <Scan size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Scanner</h1>
            <p className="text-xs text-muted-foreground">Select an event to scan</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchEvents}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <button
            type="button"
            onClick={fetchEvents}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      ) : sortedEvents.length === 0 ? (
        <div className="text-center py-16">
          <Scan size={40} className="text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No upcoming events</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              isToday={isToday(event.date_start)}
              onClick={() => router.push(`/scanner/${event.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
