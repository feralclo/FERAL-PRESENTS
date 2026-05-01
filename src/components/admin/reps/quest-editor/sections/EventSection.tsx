"use client";

import { useMemo, useState } from "react";
import { Calendar, Search } from "lucide-react";
import type { SectionProps } from "../types";

/**
 * Anchor a quest to an event so its `share_url` uses the event slug.
 * Drives event-scoped feeds + leaderboards.
 *
 * Layout:
 * - "Currently anchored" panel when set, with a Detach action.
 * - Quick-pick row of next 3 upcoming events (sorted soonest-first).
 * - Search input + scrollable result list for the rest.
 *
 * The events list is fetched once in `QuestEditor` and passed in so
 * other sections (and the chip summary) can re-use it without
 * triggering a second `/api/events` round-trip.
 */
export interface EventOption {
  id: string;
  name: string;
  date_start: string | null;
}

export interface EventSectionProps extends SectionProps {
  events: EventOption[];
}

export function EventSection({ state, onChange, events }: EventSectionProps) {
  const [query, setQuery] = useState("");

  const upcoming = useMemo(() => sortUpcoming(events), [events]);
  const selected = useMemo(
    () => events.find((e) => e.id === state.event_id) ?? null,
    [events, state.event_id]
  );
  const quickPicks = useMemo(() => upcoming.slice(0, 3), [upcoming]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return upcoming
      .filter((e) => e.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, upcoming]);

  return (
    <div className="space-y-4">
      {selected ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/[0.04] px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Calendar
              size={14}
              className="shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {selected.name}
              </p>
              {selected.date_start ? (
                <p className="text-[11px] text-muted-foreground">
                  {formatEventDate(selected.date_start)}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange({ event_id: null })}
            className="text-xs text-muted-foreground transition-colors hover:text-destructive"
          >
            Detach
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Pick an event so reps' share links carry your event slug. Leave blank for a global quest.
        </p>
      )}

      {!selected && quickPicks.length > 0 ? (
        <div className="space-y-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Soonest
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {quickPicks.map((event) => (
              <QuickPickButton
                key={event.id}
                event={event}
                onPick={() => onChange({ event_id: event.id })}
              />
            ))}
          </div>
        </div>
      ) : null}

      {!selected ? (
        <div className="space-y-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find an event by name"
              className="
                w-full rounded-md border border-border/60 bg-background
                py-2 pl-9 pr-3 text-sm
                focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30
                placeholder:text-muted-foreground/60
              "
            />
          </div>
          {filtered.length > 0 ? (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border/40 bg-card p-1">
              {filtered.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ event_id: event.id });
                      setQuery("");
                    }}
                    className="
                      flex w-full items-center justify-between gap-3 rounded
                      px-2 py-1.5 text-left text-sm
                      transition-colors hover:bg-foreground/[0.04]
                    "
                  >
                    <span className="truncate font-medium">{event.name}</span>
                    {event.date_start ? (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatEventDate(event.date_start)}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim() ? (
            <p className="text-xs text-muted-foreground">No matches.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface QuickPickButtonProps {
  event: EventOption;
  onPick: () => void;
}

function QuickPickButton({ event, onPick }: QuickPickButtonProps) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="
        flex flex-col items-start gap-1 rounded-md
        border border-border/60 bg-card px-3 py-2 text-left
        shadow-sm transition-colors
        hover:border-primary/40 hover:bg-primary/[0.03]
      "
    >
      <span className="line-clamp-1 text-sm font-medium">{event.name}</span>
      {event.date_start ? (
        <span className="text-[11px] text-muted-foreground">
          {formatEventDate(event.date_start)}
        </span>
      ) : null}
    </button>
  );
}

/** Sort upcoming-soonest-first; events without a start date sink to the end. */
function sortUpcoming(events: EventOption[]): EventOption[] {
  const now = Date.now();
  return [...events].sort((a, b) => {
    const at = a.date_start ? new Date(a.date_start).getTime() : Infinity;
    const bt = b.date_start ? new Date(b.date_start).getTime() : Infinity;
    // Future-first; past events sink below
    const aFuture = at >= now;
    const bFuture = bt >= now;
    if (aFuture && !bFuture) return -1;
    if (!aFuture && bFuture) return 1;
    return at - bt;
  });
}

function formatEventDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}

/**
 * Closed-chip summary lookup. QuestForm calls this with the events list
 * so the chip header reads "Event · Only Numbers London" without the
 * section having to be mounted.
 */
export function eventChipSummary(
  eventId: string | null,
  events: EventOption[]
): string | undefined {
  if (!eventId) return undefined;
  return events.find((e) => e.id === eventId)?.name ?? "set";
}
