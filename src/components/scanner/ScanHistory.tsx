"use client";

import { CheckCircle2, XCircle, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScanStatus } from "./ScanResult";

export interface ScanHistoryEntry {
  id: string;
  code: string;
  status: ScanStatus;
  holderName?: string;
  message: string;
  timestamp: Date;
}

interface ScanHistoryProps {
  entries: ScanHistoryEntry[];
}

const STATUS_ICONS: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  valid: { icon: CheckCircle2, color: "text-success" },
  merch_success: { icon: CheckCircle2, color: "text-success" },
  already_used: { icon: XCircle, color: "text-destructive" },
  invalid: { icon: XCircle, color: "text-destructive" },
  wrong_event: { icon: AlertTriangle, color: "text-warning" },
  error: { icon: XCircle, color: "text-destructive" },
  merch_only: { icon: AlertTriangle, color: "text-warning" },
  no_merch: { icon: XCircle, color: "text-destructive" },
  merch_collected: { icon: AlertTriangle, color: "text-warning" },
};

export function ScanHistory({ entries }: ScanHistoryProps) {
  if (entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">
        Recent Scans
      </h3>
      {entries.map((entry) => {
        const config = STATUS_ICONS[entry.status] || STATUS_ICONS.error;
        const Icon = config.icon;
        return (
          <div
            key={entry.id}
            className="flex items-center gap-3 rounded-lg px-3 py-2 bg-card/50"
          >
            <Icon size={14} className={cn("shrink-0", config.color)} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">
                {entry.holderName || entry.code}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">{entry.message}</p>
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 flex items-center gap-1">
              <Clock size={9} />
              {entry.timestamp.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
