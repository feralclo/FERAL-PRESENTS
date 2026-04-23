"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2,
  Zap,
  TrendingUp,
  Compass,
  Trophy,
  Info,
} from "lucide-react";
import type { PlatformXPConfig } from "@/types/reps";
import { DEFAULT_PLATFORM_XP_CONFIG } from "@/types/reps";
import {
  generateLevelTable,
  DEFAULT_LEVELING,
  DEFAULT_TIERS,
} from "@/lib/xp-levels";
import type { LevelingConfig, TierDefinition } from "@/lib/xp-levels";

const QUEST_LABELS: Record<string, string> = {
  social_post: "Social Post",
  story_share: "Story Share",
  content_creation: "Content Creation",
  sales_milestone: "Sales Milestone",
  custom: "Custom Quest",
};

export function PlatformXPTab() {
  const [config, setConfig] = useState<PlatformXPConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/platform/xp-config");
      if (!res.ok) {
        setError("Could not load XP config");
        setLoading(false);
        return;
      }
      const json = await res.json();
      if (json.data) {
        setConfig({ ...DEFAULT_PLATFORM_XP_CONFIG, ...json.data });
      }
    } catch {
      setError("Failed to load — check your connection");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-primary/60" />
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">{error || "No data"}</p>
      </div>
    );
  }

  const leveling: LevelingConfig = config.leveling || DEFAULT_LEVELING;
  const tiers: TierDefinition[] =
    (config.tiers as TierDefinition[]) || DEFAULT_TIERS;
  const levelTable = generateLevelTable(leveling, tiers).slice(0, 20);

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-info/20 bg-info/5 p-4">
        <Info size={16} className="text-info shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">
            XP is platform-wide
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            XP values and the leveling curve are set by Entry and apply to all
            reps across the platform. Quest XP is automatically assigned based on
            the quest type. You can focus on creating quests and managing rewards
            — the XP economy is handled for you.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* XP Earning Rates */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Zap size={14} className="text-primary" />
              XP Awards
            </h3>

            <div className="space-y-3">
              {config.xp_per_sale > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={13} className="text-success" />
                    <span className="text-sm text-foreground">Per Sale</span>
                  </div>
                  <span className="font-mono text-sm font-bold text-primary tabular-nums">
                    +{config.xp_per_sale} XP
                  </span>
                </div>
              )}

              {Object.entries(config.xp_per_quest_type).map(([type, xp]) => (
                <div key={type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Compass size={13} className="text-primary/70" />
                    <span className="text-sm text-foreground">
                      {QUEST_LABELS[type] || type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <span className="font-mono text-sm font-bold text-primary tabular-nums">
                    +{xp} XP
                  </span>
                </div>
              ))}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy size={13} className="text-warning" />
                  <span className="text-sm text-foreground">
                    Leaderboard Top 3
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">Bonus XP</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tier System */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">
              Tier System
            </h3>

            <div className="space-y-2">
              {tiers.map((tier) => (
                <div
                  key={tier.name}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: tier.color }}
                    />
                    <span
                      className="text-sm font-medium"
                      style={{ color: tier.color }}
                    >
                      {tier.name}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono tabular-nums">
                    Level {tier.min_level}+
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Level Preview Table */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Level Preview
            </h3>
            <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
              {leveling.max_level} levels
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-[10px] uppercase tracking-wider text-muted-foreground/50">
                  <th className="pb-2 text-left font-semibold w-12">Lvl</th>
                  <th className="pb-2 text-left font-semibold">Tier</th>
                  <th className="pb-2 text-right font-semibold">Total XP</th>
                  <th className="pb-2 text-right font-semibold">To Next</th>
                </tr>
              </thead>
              <tbody>
                {levelTable.map((row) => (
                  <tr key={row.level} className="border-b border-border/20">
                    <td
                      className="py-1.5 font-mono font-bold tabular-nums"
                      style={{ color: row.tierColor }}
                    >
                      {row.level}
                    </td>
                    <td className="py-1.5">
                      <span
                        className="text-xs font-medium"
                        style={{ color: row.tierColor }}
                      >
                        {row.tierName}
                      </span>
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs text-muted-foreground tabular-nums">
                      {row.totalXp.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs text-foreground/70 tabular-nums">
                      {row.xpToNext > 0
                        ? `+${row.xpToNext.toLocaleString()}`
                        : "MAX"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Showing first 20 levels. XP requirements increase progressively. The
            full table has {leveling.max_level} levels.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
