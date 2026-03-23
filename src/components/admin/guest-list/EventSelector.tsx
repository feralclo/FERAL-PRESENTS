"use client";

import { useMemo, useState } from "react";
import { Calendar, MapPin, Users, AlertCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export interface EventForSelector {
  id: string;
  name: string;
  date_start: string | null;
  venue_name: string | null;
  status: string;
}

interface EventSelectorProps {
  events: EventForSelector[];
  selectedEventId: string;
  onSelectEvent: (eventId: string) => void;
  guestSummaries: Record<string, { total_guests: number; pending_count: number }>;
}

function formatShortDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}

export function EventSelector({
  events,
  selectedEventId,
  onSelectEvent,
  guestSummaries,
}: EventSelectorProps) {
  const [showPast, setShowPast] = useState(false);

  const { upcoming, past } = useMemo(() => {
    const now = new Date();
    const up: EventForSelector[] = [];
    const pa: EventForSelector[] = [];

    for (const evt of events) {
      const eventDate = evt.date_start ? new Date(evt.date_start) : null;
      const isUpcoming = !eventDate || eventDate >= now || evt.status === "live";
      if (isUpcoming) {
        up.push(evt);
      } else {
        pa.push(evt);
      }
    }

    return { upcoming: up, past: pa };
  }, [events]);

  const renderCard = (evt: EventForSelector) => {
    const isSelected = evt.id === selectedEventId;
    const summary = guestSummaries[evt.id];
    const totalGuests = summary?.total_guests || 0;
    const pendingCount = summary?.pending_count || 0;

    return (
      <button
        key={evt.id}
        type="button"
        onClick={() => onSelectEvent(evt.id)}
        className={cn(
          "flex-shrink-0 w-[220px] rounded-xl border p-4 text-left transition-all",
          isSelected
            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
            : "border-border/60 bg-card/50 hover:border-primary/30"
        )}
      >
        <p className="text-sm font-semibold text-foreground truncate">{evt.name}</p>

        {evt.date_start && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>{formatShortDate(evt.date_start)}</span>
          </div>
        )}

        {evt.venue_name && (
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{evt.venue_name}</span>
          </div>
        )}

        <div className="mt-2.5 flex items-center gap-2">
          {totalGuests > 0 && (
            <Badge variant="secondary" className="text-[10px] gap-1 py-0">
              <Users className="h-2.5 w-2.5" />
              {totalGuests}
            </Badge>
          )}
          {pendingCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 py-0 border-warning/30 text-warning">
              <AlertCircle className="h-2.5 w-2.5" />
              {pendingCount} pending
            </Badge>
          )}
        </div>
      </button>
    );
  };

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
        <p className="text-sm text-muted-foreground">No events yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Upcoming events — scrollable card row */}
      {upcoming.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
            {upcoming.length === events.length ? "Events" : "Upcoming"}
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
            {upcoming.map(renderCard)}
          </div>
        </div>
      )}

      {/* Past events — collapsed */}
      {past.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowPast(!showPast)}
            className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", showPast && "rotate-180")} />
            Past events ({past.length})
          </button>
          {showPast && (
            <div className="mt-2 flex flex-wrap gap-2">
              {past.map((evt) => {
                const isSelected = evt.id === selectedEventId;
                const summary = guestSummaries[evt.id];
                const totalGuests = summary?.total_guests || 0;

                return (
                  <button
                    key={evt.id}
                    type="button"
                    onClick={() => onSelectEvent(evt.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-all text-xs",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border/40 bg-card/30 hover:border-border/60"
                    )}
                  >
                    <span className="font-medium text-foreground/80">{evt.name}</span>
                    {evt.date_start && (
                      <span className="ml-2 text-muted-foreground/50">{formatShortDate(evt.date_start)}</span>
                    )}
                    {totalGuests > 0 && (
                      <span className="ml-2 text-muted-foreground/40">· {totalGuests} guests</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
