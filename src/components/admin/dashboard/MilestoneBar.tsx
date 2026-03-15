"use client";

import { Flame, Target, Zap } from "lucide-react";
import type { Milestone } from "@/hooks/useDashboardRealtime";

interface MilestoneBarProps {
  milestones: Milestone[];
}

const MILESTONE_CONFIG = {
  streak: {
    icon: Flame,
    gradient: "from-destructive/15 via-warning/10 to-destructive/15",
    borderColor: "border-destructive/25",
    textColor: "text-destructive",
    iconColor: "text-destructive",
    glow: "rgba(244, 63, 94, 0.15)",
  },
  revenue: {
    icon: Zap,
    gradient: "from-success/15 via-success/8 to-success/15",
    borderColor: "border-success/25",
    textColor: "text-success",
    iconColor: "text-success",
    glow: "rgba(52, 211, 153, 0.15)",
  },
  sellout: {
    icon: Target,
    gradient: "from-warning/15 via-warning/8 to-warning/15",
    borderColor: "border-warning/25",
    textColor: "text-warning",
    iconColor: "text-warning",
    glow: "rgba(251, 191, 36, 0.15)",
  },
  best_hour: {
    icon: Zap,
    gradient: "from-primary/15 via-primary/8 to-primary/15",
    borderColor: "border-primary/25",
    textColor: "text-primary",
    iconColor: "text-primary",
    glow: "rgba(139, 92, 246, 0.15)",
  },
  conversion: {
    icon: Zap,
    gradient: "from-info/15 via-info/8 to-info/15",
    borderColor: "border-info/25",
    textColor: "text-info",
    iconColor: "text-info",
    glow: "rgba(56, 189, 248, 0.15)",
  },
} as const;

function MilestoneBar({ milestones }: MilestoneBarProps) {
  if (milestones.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {milestones.map((m) => {
        const config = MILESTONE_CONFIG[m.type];
        const Icon = config.icon;
        return (
          <div
            key={m.id}
            className={`flex items-center gap-2 rounded-xl border bg-gradient-to-r px-4 py-2.5 text-[13px] font-bold milestone-in ${config.borderColor} ${config.gradient}`}
            style={{ boxShadow: `0 0 20px ${config.glow}` }}
          >
            <Icon size={16} className={config.iconColor} />
            <span className={config.textColor}>{m.message}</span>
          </div>
        );
      })}
    </div>
  );
}

export { MilestoneBar };
