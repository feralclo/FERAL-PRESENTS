"use client";

import { Calendar, MapPin, Users, Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface EventStats {
  total_tickets: number;
  scanned: number;
  merch_total: number;
  merch_collected: number;
  guest_list_total: number;
  guest_list_checked_in: number;
}

interface EventCardProps {
  event: {
    id: string;
    name: string;
    slug: string;
    venue_name?: string;
    date_start: string;
    doors_time?: string;
    status: string;
    cover_image?: string;
    stats: EventStats;
  };
  isToday: boolean;
  onClick: () => void;
}

export function EventCard({ event, isToday, onClick }: EventCardProps) {
  const { stats } = event;
  const scanPercent = stats.total_tickets > 0
    ? Math.round((stats.scanned / stats.total_tickets) * 100)
    : 0;

  const eventDate = new Date(event.date_start);
  const dateStr = eventDate.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeStr = event.doors_time || eventDate.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-2xl border bg-card p-4 transition-all active:scale-[0.98]",
        isToday
          ? "border-primary/30 shadow-[0_0_20px_rgba(139,92,246,0.1)]"
          : "border-border/60 hover:border-border"
      )}
    >
      <div className="flex gap-3">
        {/* Cover image */}
        {event.cover_image && (
          <div className="h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-muted">
            <img src={event.cover_image} alt="" className="h-full w-full object-cover" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground truncate">{event.name}</h3>
            {isToday && (
              <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary uppercase tracking-wider">
                Today
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {dateStr} {timeStr}
            </span>
            {event.venue_name && (
              <span className="flex items-center gap-1">
                <MapPin size={11} />
                {event.venue_name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Users size={12} />
            Scanned
          </span>
          <span className="font-mono font-semibold text-foreground tabular-nums">
            {stats.scanned}/{stats.total_tickets}
            <span className="text-muted-foreground ml-1">({scanPercent}%)</span>
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary scanner-progress-fill"
            style={{ width: `${scanPercent}%` }}
          />
        </div>

        {/* Secondary stats */}
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          {stats.merch_total > 0 && (
            <span className="flex items-center gap-1">
              <Package size={10} />
              Merch: {stats.merch_collected}/{stats.merch_total}
            </span>
          )}
          {stats.guest_list_total > 0 && (
            <span className="flex items-center gap-1">
              <Users size={10} />
              Guests: {stats.guest_list_checked_in}/{stats.guest_list_total}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
