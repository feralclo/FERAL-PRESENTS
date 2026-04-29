"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { TicketsTab } from "@/components/admin/event-editor/TicketsTab";
import { WaitlistTab } from "@/components/admin/event-editor/WaitlistTab";
import { cn } from "@/lib/utils";
import type { TicketsTabProps } from "@/components/admin/event-editor/types";

/**
 * Tickets — the heart of the event. Phase 4 of EVENT-BUILDER-PLAN deepens
 * this section (timeline view, what-if velocity); for Phase 3 we mount
 * the existing TicketsTab implementation under the canvas surface and
 * fold Waitlist in as a collapsible sub-block.
 */
export function TicketsSection(props: TicketsTabProps) {
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  return (
    <div className="space-y-6">
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
