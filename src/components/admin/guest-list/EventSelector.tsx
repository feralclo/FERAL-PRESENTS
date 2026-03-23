"use client";

import { useMemo } from "react";
import { Users, AlertCircle } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";

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

function isPast(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export function EventSelector({
  events,
  selectedEventId,
  onSelectEvent,
  guestSummaries,
}: EventSelectorProps) {
  // Split events into groups for the dropdown
  const { withGuests, upcoming, past } = useMemo(() => {
    const wg: EventForSelector[] = [];
    const up: EventForSelector[] = [];
    const pa: EventForSelector[] = [];

    for (const evt of events) {
      const hasGuests = (guestSummaries[evt.id]?.total_guests || 0) > 0;
      const eventIsPast = isPast(evt.date_start);

      if (hasGuests) {
        wg.push(evt);
      } else if (eventIsPast) {
        pa.push(evt);
      } else {
        up.push(evt);
      }
    }

    return { withGuests: wg, upcoming: up, past: pa };
  }, [events, guestSummaries]);

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
        <p className="text-sm text-muted-foreground">No published events</p>
      </div>
    );
  }

  // Build display label for the selected event
  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div className="flex items-center gap-3">
      <Select
        value={selectedEventId || "__none__"}
        onValueChange={(v) => onSelectEvent(v === "__none__" ? "" : v)}
      >
        <SelectTrigger className="max-w-md">
          <SelectValue>
            {selectedEvent ? (
              <span className="flex items-center gap-2">
                <span className="font-medium">{selectedEvent.name}</span>
                {selectedEvent.date_start && (
                  <span className="text-muted-foreground text-xs">{formatShortDate(selectedEvent.date_start)}</span>
                )}
              </span>
            ) : (
              "Select event..."
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {/* Events with guest lists (top priority) */}
          {withGuests.length > 0 && (
            <>
              {withGuests.map((evt) => {
                const summary = guestSummaries[evt.id];
                const past = isPast(evt.date_start);
                return (
                  <SelectItem key={evt.id} value={evt.id}>
                    <span className="flex items-center gap-2">
                      <span className={past ? "text-muted-foreground" : ""}>{evt.name}</span>
                      {evt.date_start && (
                        <span className="text-muted-foreground/60 text-xs">{formatShortDate(evt.date_start)}</span>
                      )}
                      <span className="ml-auto flex items-center gap-1.5">
                        {summary && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
                            <Users className="h-2.5 w-2.5" />
                            {summary.total_guests}
                          </span>
                        )}
                        {summary?.pending_count > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-warning bg-warning/10 rounded px-1.5 py-0.5">
                            <AlertCircle className="h-2.5 w-2.5" />
                            {summary.pending_count}
                          </span>
                        )}
                      </span>
                    </span>
                  </SelectItem>
                );
              })}
              {(upcoming.length > 0 || past.length > 0) && <SelectSeparator />}
            </>
          )}

          {/* Upcoming events without guests */}
          {upcoming.map((evt) => (
            <SelectItem key={evt.id} value={evt.id}>
              <span className="flex items-center gap-2">
                <span>{evt.name}</span>
                {evt.date_start && (
                  <span className="text-muted-foreground/60 text-xs">{formatShortDate(evt.date_start)}</span>
                )}
              </span>
            </SelectItem>
          ))}

          {/* Past events without guests */}
          {past.length > 0 && (
            <>
              {(withGuests.length > 0 || upcoming.length > 0) && <SelectSeparator />}
              {past.map((evt) => (
                <SelectItem key={evt.id} value={evt.id}>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span>{evt.name}</span>
                    {evt.date_start && (
                      <span className="text-muted-foreground/40 text-xs">{formatShortDate(evt.date_start)}</span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>

      {/* Selected event context */}
      {selectedEvent?.venue_name && (
        <span className="text-xs text-muted-foreground/50 hidden sm:inline">
          {selectedEvent.venue_name}
        </span>
      )}
    </div>
  );
}
