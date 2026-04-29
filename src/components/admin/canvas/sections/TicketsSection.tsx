"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { TicketsTab } from "@/components/admin/event-editor/TicketsTab";
import { WaitlistTab } from "@/components/admin/event-editor/WaitlistTab";
import { ReleaseStrategyPanel } from "./ReleaseStrategyPanel";
import { SalesTimelineCard } from "./SalesTimelineCard";
import { useEventSalesTimeline } from "@/hooks/useEventSalesTimeline";
import { cn } from "@/lib/utils";
import type { TicketsTabProps } from "@/components/admin/event-editor/types";

/**
 * Tickets — the heart of the event. Phase 4 deepens this section: a
 * dedicated Release Strategy panel consolidates the previously-split
 * group + sequential controls; a Sales Timeline card surfaces velocity
 * and what-if scenarios (only on saved events with sales).
 *
 * Order:
 *   1. SalesTimelineCard — only meaningful for saved events with sales
 *   2. ReleaseStrategyPanel — group + release config (replaces inline
 *      GroupManager + GroupHeader UI on TicketsTab)
 *   3. TicketsTab — the ticket list itself + add/template actions
 *   4. Waitlist sub-block (collapsed)
 */
export function TicketsSection(props: TicketsTabProps) {
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  // Only fetch sales for saved events. Drafts (no id) wouldn't have any.
  const { data: salesData } = useEventSalesTimeline(
    props.event.id || null
  );

  return (
    <div className="space-y-5">
      {props.event.id && (
        <SalesTimelineCard
          buckets={salesData?.buckets || []}
          ticketTypes={(salesData?.ticketTypes || []).map((t) => ({
            id: t.id,
            name: t.name,
          }))}
          currency={salesData?.currency || props.event.currency || "GBP"}
          loading={!salesData}
        />
      )}

      <ReleaseStrategyPanel
        settings={props.settings}
        updateSetting={props.updateSetting}
        ticketTypes={props.ticketTypes}
        setTicketTypes={props.setTicketTypes}
        buckets={salesData?.buckets || null}
        currency={props.event.currency || "GBP"}
      />

      <TicketsTab {...props} />

      <div className="border-t border-border/40 pt-5">
        <button
          type="button"
          onClick={() => setWaitlistOpen((v) => !v)}
          aria-expanded={waitlistOpen}
          aria-controls="canvas-tickets-waitlist"
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm font-medium text-foreground/85",
            "hover:bg-foreground/[0.03] transition-colors",
            "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
          )}
        >
          <span className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              Sold-out
            </span>
            <span>Waitlist</span>
          </span>
          <ChevronDown
            size={16}
            className={cn(
              "text-muted-foreground/70 transition-transform duration-200",
              waitlistOpen ? "rotate-0" : "-rotate-90"
            )}
          />
        </button>
        <div id="canvas-tickets-waitlist" hidden={!waitlistOpen} className="mt-4">
          <WaitlistTab
            event={props.event}
            settings={props.settings}
            updateSetting={props.updateSetting}
          />
        </div>
      </div>
    </div>
  );
}
