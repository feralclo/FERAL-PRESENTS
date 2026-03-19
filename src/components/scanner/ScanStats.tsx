"use client";

import { Users, Package, ClipboardList } from "lucide-react";

interface ScanStatsProps {
  mode: "entry" | "merch" | "guest-list";
  stats: {
    total_tickets: number;
    scanned: number;
    merch_total: number;
    merch_collected: number;
    guest_list_total: number;
    guest_list_checked_in: number;
  };
}

export function ScanStats({ mode, stats }: ScanStatsProps) {
  let label: string;
  let current: number;
  let total: number;
  let Icon: typeof Users;

  switch (mode) {
    case "merch":
      label = "Merch collected";
      current = stats.merch_collected;
      total = stats.merch_total;
      Icon = Package;
      break;
    case "guest-list":
      label = "Checked in";
      current = stats.guest_list_checked_in;
      total = stats.guest_list_total;
      Icon = ClipboardList;
      break;
    default:
      label = "Scanned";
      current = stats.scanned;
      total = stats.total_tickets;
      Icon = Users;
  }

  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/80 backdrop-blur px-4 py-2.5">
      <Icon size={16} className="text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-mono font-semibold text-foreground tabular-nums">
            {current}/{total}
          </span>
        </div>
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary scanner-progress-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
