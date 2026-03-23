"use client";

import { useMemo } from "react";
import { Calendar, MapPin, Users, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
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
  // Only non-draft events
  const activeEvents = useMemo(
    () => events.filter((e) => e.status !== "draft"),
    [events]
  );

  // Events that actually have guest list entries — shown as cards
  const eventsWithGuests = useMemo(
    () => activeEvents.filter((e) => (guestSummaries[e.id]?.total_guests || 0) > 0),
    [activeEvents, guestSummaries]
  );

  // Events without guests — available via dropdown only
  const eventsWithoutGuests = useMemo(
    () => activeEvents.filter((e) => !guestSummaries[e.id] || guestSummaries[e.id].total_guests === 0),
    [activeEvents, guestSummaries]
  );

  // Is the selected event one without guests? (show it as context)
  const selectedIsEmpty = selectedEventId && !eventsWithGuests.find((e) => e.id === selectedEventId);
  const selectedEvent = activeEvents.find((e) => e.id === selectedEventId);

  if (activeEvents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
        <p className="text-sm text-muted-foreground">No published events</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Cards for events with guests */}
      {eventsWithGuests.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          {eventsWithGuests.map((evt) => {
            const isSelected = evt.id === selectedEventId;
            const summary = guestSummaries[evt.id];
            const totalGuests = summary?.total_guests || 0;
            const pendingCount = summary?.pending_count || 0;
            const past = isPast(evt.date_start);

            return (
              <button
                key={evt.id}
                type="button"
                onClick={() => onSelectEvent(evt.id)}
                className={cn(
                  "flex-shrink-0 w-[200px] rounded-xl border p-3.5 text-left transition-all",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border/60 bg-card/50 hover:border-primary/30",
                  past && !isSelected && "opacity-60"
                )}
              >
                <p className="text-sm font-semibold text-foreground truncate">{evt.name}</p>
                {evt.date_start && (
                  <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 shrink-0" />
                    {formatShortDate(evt.date_start)}
                    {past && <span className="text-muted-foreground/40">· past</span>}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px] gap-1 py-0">
                    <Users className="h-2.5 w-2.5" />
                    {totalGuests}
                  </Badge>
                  {pendingCount > 0 && (
                    <Badge variant="outline" className="text-[10px] gap-1 py-0 border-warning/30 text-warning">
                      <AlertCircle className="h-2.5 w-2.5" />
                      {pendingCount}
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Compact dropdown for switching to other events (or only selector if no cards) */}
      <div className="flex items-center gap-3">
        {eventsWithGuests.length > 0 && (
          <span className="text-[11px] text-muted-foreground/50 shrink-0">or select</span>
        )}
        <Select
          value={selectedEventId || "__none__"}
          onValueChange={(v) => onSelectEvent(v === "__none__" ? "" : v)}
        >
          <SelectTrigger className={cn("max-w-xs", eventsWithGuests.length === 0 && "max-w-sm")}>
            <SelectValue placeholder="Select event..." />
          </SelectTrigger>
          <SelectContent>
            {eventsWithGuests.length > 0 && eventsWithoutGuests.length > 0 && (
              <SelectItem value="__none__" disabled className="text-muted-foreground/50 text-xs">
                Other events
              </SelectItem>
            )}
            {(eventsWithGuests.length === 0 ? activeEvents : eventsWithoutGuests).map((evt) => (
              <SelectItem key={evt.id} value={evt.id}>
                <span className={isPast(evt.date_start) ? "text-muted-foreground" : ""}>
                  {evt.name}
                  {evt.date_start && (
                    <span className="ml-2 text-muted-foreground/50 text-xs">
                      {formatShortDate(evt.date_start)}
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Show selected empty event as a small context line */}
      {selectedIsEmpty && selectedEvent && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <p className="text-sm font-medium text-foreground">{selectedEvent.name}</p>
          {selectedEvent.date_start && (
            <span className="text-xs text-muted-foreground">{formatShortDate(selectedEvent.date_start)}</span>
          )}
          {selectedEvent.venue_name && (
            <span className="text-xs text-muted-foreground">· {selectedEvent.venue_name}</span>
          )}
        </div>
      )}
    </div>
  );
}
