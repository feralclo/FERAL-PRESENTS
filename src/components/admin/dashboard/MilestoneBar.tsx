"use client";

import { Flame, Target, Zap, Trophy, TrendingUp } from "lucide-react";
import type { Milestone } from "@/hooks/useDashboardRealtime";

interface MilestoneBarProps {
  milestones: Milestone[];
}

const MILESTONE_ICONS = {
  streak: Flame,
  revenue: Zap,
  sellout: Target,
  best_hour: Trophy,
  conversion: TrendingUp,
} as const;

const MILESTONE_COLORS = {
  streak: "bg-destructive/10 text-destructive border-destructive/20",
  revenue: "bg-success/10 text-success border-success/20",
  sellout: "bg-warning/10 text-warning border-warning/20",
  best_hour: "bg-primary/10 text-primary border-primary/20",
  conversion: "bg-info/10 text-info border-info/20",
} as const;

function MilestoneBar({ milestones }: MilestoneBarProps) {
  if (milestones.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {milestones.map((m) => {
        const Icon = MILESTONE_ICONS[m.type];
        const colors = MILESTONE_COLORS[m.type];
        return (
          <div
            key={m.id}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold milestone-in ${colors}`}
          >
            <Icon size={14} />
            <span>{m.message}</span>
          </div>
        );
      })}
    </div>
  );
}

export { MilestoneBar };
