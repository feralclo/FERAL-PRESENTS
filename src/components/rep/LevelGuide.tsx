"use client";

import { useState } from "react";
import {
  Zap,
  TrendingUp,
  Compass,
  Trophy,
  ChevronDown,
  ChevronUp,
  Lock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TierInfo {
  name: string;
  min_level: number;
  color: string;
}

interface LevelRow {
  level: number;
  totalXp: number;
  xpToNext: number;
  tier: string;
  color: string;
}

interface LevelGuideProps {
  tiers: TierInfo[];
  levelTable: LevelRow[];
  maxLevel: number;
  xpPerQuestType?: Record<string, number>;
  pointsPerSale?: number;
  currentLevel?: number;
  currentXp?: number;
}

const QUEST_LABELS: Record<string, { label: string; icon: typeof Zap }> = {
  social_post: { label: "Social Post", icon: Compass },
  story_share: { label: "Story Share", icon: Compass },
  content_creation: { label: "Content Creation", icon: Compass },
  sales_milestone: { label: "Sales Milestone", icon: TrendingUp },
  custom: { label: "Custom Quest", icon: Compass },
};

export function LevelGuide({
  tiers,
  levelTable,
  maxLevel,
  xpPerQuestType,
  pointsPerSale,
  currentLevel,
  currentXp,
}: LevelGuideProps) {
  const [showAllLevels, setShowAllLevels] = useState(false);

  const displayRows = showAllLevels ? levelTable : levelTable.slice(0, 10);

  return (
    <div className="space-y-5 rep-slide-up" style={{ animationDelay: "150ms" }}>
      {/* Section title */}
      <div className="text-center">
        <h2 className="text-base font-bold text-foreground">Level Guide</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          How XP and leveling works
        </p>
      </div>

      {/* Tier progression — horizontal strip */}
      <Card className="py-0 gap-0 rep-surface-1 overflow-hidden">
        <CardContent className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Tier Progression
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {tiers.map((tier, i) => {
              const isCurrentTier =
                currentLevel !== undefined &&
                currentLevel >= tier.min_level &&
                (i === tiers.length - 1 || currentLevel < tiers[i + 1].min_level);
              const isLocked =
                currentLevel !== undefined && currentLevel < tier.min_level;

              return (
                <div
                  key={tier.name}
                  className={cn(
                    "relative flex flex-col items-center justify-center rounded-xl px-3 py-2.5 min-w-[72px] transition-all duration-300",
                    isCurrentTier
                      ? "ring-1 scale-[1.02]"
                      : isLocked
                        ? "opacity-40"
                        : "",
                  )}
                  style={{
                    backgroundColor: tier.color + "12",
                    border: `1px solid ${tier.color}${isCurrentTier ? "50" : "20"}`,
                    ...(isCurrentTier
                      ? {
                          boxShadow: `0 0 16px ${tier.color}20, inset 0 1px 0 ${tier.color}15`,
                          ringColor: tier.color + "40",
                        }
                      : {}),
                  }}
                >
                  {isLocked && (
                    <Lock
                      size={10}
                      className="absolute top-1.5 right-1.5 text-muted-foreground/40"
                    />
                  )}
                  <span
                    className="text-lg font-black leading-none"
                    style={{ color: tier.color }}
                  >
                    {tier.min_level}
                  </span>
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider mt-1 leading-none"
                    style={{ color: tier.color }}
                  >
                    {tier.name}
                  </span>
                  {isCurrentTier && (
                    <span
                      className="absolute -bottom-px left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full"
                      style={{ backgroundColor: tier.color }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* How to earn XP */}
      <Card className="py-0 gap-0 rep-surface-1">
        <CardContent className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Earn XP
          </p>
          <div className="space-y-2">
            {/* Sales */}
            {pointsPerSale != null && pointsPerSale > 0 && (
              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/15">
                    <TrendingUp size={13} className="text-success" />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    Each Sale
                  </span>
                </div>
                <span className="text-sm font-bold font-mono tabular-nums text-primary">
                  +{pointsPerSale} XP
                </span>
              </div>
            )}

            {/* Leaderboard positions */}
            <div className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/15">
                  <Trophy size={13} className="text-warning" />
                </div>
                <span className="text-sm font-medium text-foreground">
                  Leaderboard Placement
                </span>
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                Top 3
              </span>
            </div>

            {/* Quest types */}
            {xpPerQuestType &&
              Object.entries(xpPerQuestType).map(([type, xp]) => {
                const config = QUEST_LABELS[type] || {
                  label: type.replace(/_/g, " "),
                  icon: Compass,
                };
                const Icon = config.icon;
                return (
                  <div
                    key={type}
                    className="flex items-center justify-between py-1.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
                        <Icon size={13} className="text-primary" />
                      </div>
                      <span className="text-sm font-medium text-foreground capitalize">
                        {config.label}
                      </span>
                    </div>
                    <span className="text-sm font-bold font-mono tabular-nums text-primary">
                      +{xp} XP
                    </span>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Level table */}
      <Card className="py-0 gap-0 rep-surface-1 overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Level Table
            </p>
            <p className="text-[10px] text-muted-foreground/60 tabular-nums">
              {maxLevel} levels
            </p>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[40px_1fr_80px_80px] text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 pb-1.5 border-b border-border/30 mb-1">
            <span>Lvl</span>
            <span>Tier</span>
            <span className="text-right">Total XP</span>
            <span className="text-right">To Next</span>
          </div>

          {/* Rows */}
          <div className="space-y-0">
            {displayRows.map((row) => {
              const isCurrent = currentLevel !== undefined && row.level === currentLevel;
              return (
                <div
                  key={row.level}
                  className={cn(
                    "grid grid-cols-[40px_1fr_80px_80px] items-center py-1.5 text-xs transition-colors rounded-md px-1 -mx-1",
                    isCurrent && "bg-primary/8",
                  )}
                >
                  <span
                    className="font-bold font-mono tabular-nums"
                    style={{ color: row.color }}
                  >
                    {row.level}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: row.color }}
                    >
                      {row.tier}
                    </span>
                    {isCurrent && (
                      <span className="text-[8px] font-bold uppercase tracking-wider text-primary bg-primary/10 rounded px-1.5 py-0.5 leading-none">
                        You
                      </span>
                    )}
                  </div>
                  <span className="text-right font-mono tabular-nums text-muted-foreground text-[11px]">
                    {row.totalXp.toLocaleString()}
                  </span>
                  <span className="text-right font-mono tabular-nums text-foreground/70 text-[11px]">
                    {row.xpToNext > 0 ? `+${row.xpToNext.toLocaleString()}` : "MAX"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Show more/less toggle */}
          {levelTable.length > 10 && (
            <button
              onClick={() => setShowAllLevels(!showAllLevels)}
              className="flex items-center justify-center gap-1.5 w-full pt-3 mt-2 border-t border-border/30 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {showAllLevels ? (
                <>
                  Show Less <ChevronUp size={14} />
                </>
              ) : (
                <>
                  Show All {maxLevel} Levels <ChevronDown size={14} />
                </>
              )}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
