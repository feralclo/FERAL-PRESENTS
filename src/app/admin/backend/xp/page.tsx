"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, RefreshCw, Save, Zap, Target, Camera, Share2, Sparkles,
  Trophy, TrendingUp, Info,
} from "lucide-react";
import { generateLevelTable } from "@/lib/xp-levels";
import type { LevelTableRow } from "@/lib/xp-levels";

// ─── Types ──────────────────────────────────────────────────────────────────

interface XPConfig {
  xp_per_sale: number;
  xp_per_quest_type: {
    social_post: number;
    story_share: number;
    content_creation: number;
    custom: number;
    sales_milestone: number;
  };
  position_xp: Record<string, number>;
  leveling: {
    base_xp: number;
    exponent: number;
    max_level: number;
  };
  tiers: {
    name: string;
    min_level: number;
    color: string;
  }[];
}

const QUEST_TYPE_META: { key: string; label: string; icon: typeof Camera }[] = [
  { key: "social_post", label: "Social Post", icon: Camera },
  { key: "story_share", label: "Story Share", icon: Share2 },
  { key: "content_creation", label: "Content Creation", icon: Sparkles },
  { key: "custom", label: "Custom", icon: Zap },
  { key: "sales_milestone", label: "Sales Challenge", icon: Target },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function XPEconomyPage() {
  const [config, setConfig] = useState<XPConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levelTable, setLevelTable] = useState<LevelTableRow[]>([]);
  const [showAllLevels, setShowAllLevels] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/platform/xp-config");
      if (!res.ok) throw new Error("Failed to load XP config");
      const json = await res.json();
      const data = json.data as XPConfig;
      setConfig(data);
      setLevelTable(generateLevelTable(data.leveling, data.tiers));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/platform/xp-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to save");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Refresh level table
      setLevelTable(generateLevelTable(config.leveling, config.tiers));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = <K extends keyof XPConfig>(key: K, value: XPConfig[K]) => {
    if (!config) return;
    setConfig({ ...config, [key]: value });
  };

  const updateQuestXP = (questType: string, value: number) => {
    if (!config) return;
    setConfig({
      ...config,
      xp_per_quest_type: { ...config.xp_per_quest_type, [questType]: value },
    });
  };

  const updateLeveling = <K extends keyof XPConfig["leveling"]>(key: K, value: number) => {
    if (!config) return;
    const newLeveling = { ...config.leveling, [key]: value };
    setConfig({ ...config, leveling: newLeveling });
    setLevelTable(generateLevelTable(newLeveling, config.tiers));
  };

  const updatePositionXP = (pos: string, value: number) => {
    if (!config) return;
    setConfig({
      ...config,
      position_xp: { ...config.position_xp, [pos]: value },
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive">{error || "Failed to load config"}</p>
        <Button variant="outline" size="sm" onClick={fetchConfig}>Retry</Button>
      </div>
    );
  }

  // Activity projections
  const weeklyXP = (config.xp_per_sale * 5) + config.xp_per_quest_type.social_post + config.xp_per_quest_type.story_share;
  const displayLevels = showAllLevels ? levelTable : levelTable.slice(0, 20);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-mono text-lg font-bold tracking-tight text-foreground">
            XP Economy
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Platform-wide XP values, leveling curve, and tier definitions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchConfig}
            className="gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="gap-2"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Zap className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* How it works */}
      <Card className="py-0 gap-0 border-primary/20 bg-primary/[0.02]">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Info size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">How the XP Economy Works</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                XP is platform-wide and controlled here — tenants cannot change it.
                Reps earn XP from sales, quests, and leaderboard positions.
                Currency (FRL, etc.) is tenant-specific — each tenant controls their own currency economy.
                Leveling uses a polynomial curve: each level requires progressively more XP.
                The formula is <code className="text-xs bg-secondary px-1.5 py-0.5 rounded font-mono">base * level^exponent</code> XP per level.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── XP Awards ── */}
        <Card className="py-0 gap-0">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
              XP Awards
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-5">
            {/* Per sale */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-success" />
                <Label className="text-sm font-medium">Per Sale (per ticket)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={config.xp_per_sale}
                  onChange={(e) => updateConfig("xp_per_sale", Number(e.target.value) || 0)}
                  className="w-24 font-mono"
                />
                <span className="text-xs text-muted-foreground">XP per ticket sold</span>
              </div>
            </div>

            {/* Per quest type */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Per Quest Type</p>
              <div className="space-y-2.5">
                {QUEST_TYPE_META.map(({ key, label, icon: Icon }) => (
                  <div key={key} className="flex items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary">
                      <Icon size={13} className="text-muted-foreground" />
                    </div>
                    <span className="text-sm text-foreground flex-1 min-w-0">{label}</span>
                    <Input
                      type="number"
                      min={0}
                      value={(config.xp_per_quest_type as Record<string, number>)[key] || 0}
                      onChange={(e) => updateQuestXP(key, Number(e.target.value) || 0)}
                      className="w-20 font-mono text-right"
                    />
                    <span className="text-[10px] text-muted-foreground w-6">XP</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Position rewards */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Trophy size={14} className="text-amber-400" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Leaderboard Position Rewards</p>
              </div>
              <div className="space-y-2">
                {["1", "2", "3"].map((pos) => (
                  <div key={pos} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary font-mono text-xs font-bold text-muted-foreground">
                      #{pos}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      value={config.position_xp[pos] || 0}
                      onChange={(e) => updatePositionXP(pos, Number(e.target.value) || 0)}
                      className="w-20 font-mono text-right"
                    />
                    <span className="text-[10px] text-muted-foreground">XP</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Leveling Curve ── */}
        <Card className="py-0 gap-0">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
              Leveling Curve
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Base XP</Label>
                <Input
                  type="number"
                  min={1}
                  value={config.leveling.base_xp}
                  onChange={(e) => updateLeveling("base_xp", Number(e.target.value) || 100)}
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Exponent</Label>
                <Input
                  type="number"
                  min={1}
                  max={3}
                  step={0.1}
                  value={config.leveling.exponent}
                  onChange={(e) => updateLeveling("exponent", Number(e.target.value) || 1.5)}
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Max Level</Label>
                <Input
                  type="number"
                  min={5}
                  max={100}
                  value={config.leveling.max_level}
                  onChange={(e) => updateLeveling("max_level", Number(e.target.value) || 50)}
                  className="mt-1 font-mono"
                />
              </div>
            </div>

            <div className="rounded-lg bg-secondary/50 px-3.5 py-2.5">
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Formula:</span>{" "}
                XP to next level = {config.leveling.base_xp} * level<sup>{config.leveling.exponent}</sup>
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                <span className="font-semibold text-foreground">Projection:</span>{" "}
                A rep earning ~{weeklyXP} XP/week (5 sales + 2 quests) reaches Level 5 in ~{Math.ceil((levelTable[4]?.totalXp || 1000) / weeklyXP)} weeks
              </p>
            </div>

            {/* Tiers */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Level Tiers</p>
              <div className="flex flex-wrap gap-1.5">
                {config.tiers.map((tier) => (
                  <Badge
                    key={tier.name}
                    className="gap-1.5 px-2.5 py-1"
                    style={{
                      backgroundColor: `${tier.color}15`,
                      borderColor: `${tier.color}30`,
                      color: tier.color,
                    }}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: tier.color }}
                    />
                    {tier.name} (Lv.{tier.min_level}+)
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Level Table ── */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
              Level Table Preview
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllLevels(!showAllLevels)}
              className="text-xs"
            >
              {showAllLevels ? `Show first 20` : `Show all ${config.leveling.max_level}`}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Level</th>
                  <th className="text-left py-2 pr-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tier</th>
                  <th className="text-right py-2 pr-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total XP</th>
                  <th className="text-right py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">XP to Next</th>
                </tr>
              </thead>
              <tbody>
                {displayLevels.map((row) => (
                  <tr key={row.level} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pr-4 font-mono text-xs font-semibold tabular-nums text-foreground">
                      {row.level}
                    </td>
                    <td className="py-1.5 pr-4">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium"
                        style={{ color: row.tierColor }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: row.tierColor }}
                        />
                        {row.tierName}
                      </span>
                    </td>
                    <td className="py-1.5 pr-4 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {row.totalXp.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {row.xpToNext > 0 ? `+${row.xpToNext.toLocaleString()}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
